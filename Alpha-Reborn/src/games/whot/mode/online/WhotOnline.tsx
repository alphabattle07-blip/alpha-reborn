import React, { useState, useEffect, useRef, useMemo, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Text, useWindowDimensions, Vibration } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import {
  fetchGameState,
  updateOnlineGameState,
} from '../../../../store/thunks/onlineGameThunks';
import { clearCurrentGame, setCurrentGame } from '../../../../store/slices/onlineGameSlice';
import { matchmakingService } from '../../../../services/api/matchmakingService';
import WhotCoreUI from '../core/ui/WhotCoreUI';
import { useWhotFonts } from '../core/ui/useWhotFonts';
import { Card, CardSuit, GameState, WhotGameAction } from '../core/types';
import { useSharedValue } from 'react-native-reanimated';
import { playCard, pickCard, callSuit, executeForcedDraw, getReshuffledState } from '../core/game';
import { socketService } from '../../../../services/api/socketService';
import { WhotAssetManager } from '../core/ui/WhotAssetManager';
import { logTap, logEmit } from '../core/ui/LatencyLogger';
import { useToast } from '../../../../hooks/useToast';

// --- ERROR BOUNDARY ---
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class WhotErrorBoundary extends Component<{ children: ReactNode; onGoBack: () => void }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; onGoBack: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Unknown error occurred' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('WhotErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ color: '#ef5350', fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>⚠️ Game Error</Text>
            <Text style={{ color: '#FFD700', textAlign: 'center', marginBottom: 20 }}>{this.state.errorMessage}</Text>
            <TouchableOpacity
              style={{ padding: 15, borderWidth: 1, borderColor: '#d32f2f', borderRadius: 8 }}
              onPress={this.props.onGoBack}
            >
              <Text style={{ color: '#ef5350', fontSize: 16, fontWeight: '600' }}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

// --- MAIN COMPONENT ---
const WhotOnlineUI = () => {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const { currentGame } = useAppSelector(state => state.onlineGame);
  const { profile: userProfile } = useAppSelector(state => state.user);
  const { isAuthenticated, token } = useAppSelector(state => state.auth);
  const { width, height } = useWindowDimensions();
  const { toast } = useToast();
  const isLandscape = width > height;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- FONTS ---
  const { font: loadedFont, whotFont: loadedWhotFont, areLoaded } = useWhotFonts();
  const [stableFont, setStableFont] = useState<any>(null);
  const [stableWhotFont, setStableWhotFont] = useState<any>(null);

  // --- ROLES ---
  const isPlayer1 = currentGame?.player1?.id === userProfile?.id;
  const isPlayer2 = currentGame?.player2?.id === userProfile?.id;
  // Server's scrubStateForClient already puts "me" at players[0], so NO client rotation needed
  const needsRotation = false;
  const myLogicalIndex = 0;

  const playerHandLimit = 5;
  const layoutHandSize = 6;

  // --- MATCHMAKING ---
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [matchmakingMessage, setMatchmakingMessage] = useState('Finding match...');
  const matchmakingIntervalRef = useRef<any>(null);
  const hasStartedMatchmaking = useRef(false);

  // --- ANIMATION & SYNC LOCKS ---
  const [isAnimating, setIsAnimating] = useState(false);
  const isAnimatingRef = useRef(false);
  const lastAnimationTimeRef = useRef<number>(0);

  // --- GAME REFS ---
  const cardListRef = useRef<any>(null);
  const [hasDealt, setHasDealt] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);

  // --- ACTION QUEUE REF ---
  // A queue to ensure that state updates and animations happen sequentially to prevent race conditions
  const actionQueueRef = useRef<(() => Promise<void>)[]>([]);
  const isProcessingQueueRef = useRef(false);
  const playerHandIdsSV = useSharedValue<string[]>([]);
  const pendingWhotCardId = useRef<string | null>(null);

  // --- MEMOIZATION REFS ---
  const prevBoardStringRef = useRef<string | null>(null);
  const stableBoardRef = useRef<GameState | null>(null);
  const stableAllCardsRef = useRef<Card[]>([]);

  const [isSuitSelectorOpen, setIsSuitSelectorOpen] = useState(false);

  // --- TIMER SYNC ---
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);

  const onFeedback = useCallback((message: string) => {
    Vibration.vibrate(50);
    toast({ title: 'Move Invalid', description: message, type: 'error' });
  }, [toast]);

  // --- 1. STABILIZE FONTS ---
  useEffect(() => {
    if (areLoaded && !stableFont && loadedFont && loadedWhotFont) {
      setStableFont(loadedFont);
      setStableWhotFont(loadedWhotFont);
    }
  }, [areLoaded, stableFont, loadedFont, loadedWhotFont]);



  // --- 2. LAZY LOAD CARDS ---
  // The 800ms delay was causing a severe race condition against the server's
  // initial gameStateUpdate, leading to missing card refs during the initial deal.
  const [areCardsReadyToRender, setCardsReadyToRender] = useState(true);

  // --- LOCAL SCROLL STATE ---
  // Persists the hand order across server updates so scrolling works seamlessly.
  const [localHandOrder, setLocalHandOrder] = useState<string[]>([]);

  // --- 3. INIT MATCHMAKING ---
  useEffect(() => {
    if (!isAuthenticated || !token || !userProfile?.id) {
      Alert.alert('Authentication Required', 'Please log in to play online.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      return;
    }

    if (!hasStartedMatchmaking.current && !currentGame) {
      hasStartedMatchmaking.current = true;
      startAutomaticMatchmaking();
    }

    return () => {
      if (matchmakingIntervalRef.current) clearInterval(matchmakingIntervalRef.current);
      if (isMatchmaking) matchmakingService.cancelMatchmaking().catch(console.error);
      hasStartedMatchmaking.current = false;
    };
  }, []);

  // --- 4. POLLING FALLBACK ---
  useEffect(() => {
    if (currentGame?.id && !isAnimating) {
      const interval = setInterval(() => {
        // Guard against visual jumps during animations
        const timeSinceAnim = Date.now() - lastAnimationTimeRef.current;
        if (timeSinceAnim > 2000) {
          dispatch(fetchGameState(currentGame.id));
        }
      }, 5000); // Poll every 5s is usually enough
      return () => clearInterval(interval);
    }
  }, [currentGame?.id, isAnimating, dispatch]);

  // --- 5. ASSET PRELOADING ---
  useEffect(() => {
    if (currentGame?.id && userProfile) {
      const opponent = needsRotation ? currentGame.player1 : currentGame.player2;
      const avatarsToPreload = [userProfile.avatar || '', opponent?.avatar || ''].filter(Boolean);
      WhotAssetManager.preload(avatarsToPreload).then(() => setAssetsReady(true));
    }
  }, [currentGame?.id, userProfile?.id]);

  // --- 6. SOCKET HANDLERS ---
  useEffect(() => {
    if (currentGame?.id && userProfile?.id) {
      // ✅ REGISTER FIRST so backend knows who we are (for targeted broadcasts)
      socketService.register(userProfile.id);
      socketService.joinGame(currentGame.id);

      const unsubOpponentMove = socketService.onOpponentMove((action: any) => {
        console.log("📡 [WhotOnline] Received onOpponentMove event:", action.type);
        if (action && action.type) {
          handleRemoteAction(action as WhotGameAction);
        }
      });

      const unsubStateUpdate = socketService.onGameStateUpdate((board: any, serverTime?: number) => {
        console.log("📡 [WhotOnline] Received gameStateUpdate");
        if (board) {
          dispatch(setCurrentGame({ ...currentGame, board }));
        }
        if (serverTime) {
          setServerTimeOffset(Date.now() - serverTime);
        }
      });

      return () => {
        unsubOpponentMove();
        unsubStateUpdate();
        socketService.leaveGame(currentGame.id);
      };
    }
  }, [currentGame?.id]);

  const startAutomaticMatchmaking = async () => {
    try {
      setIsMatchmaking(true);
      setMatchmakingMessage('Finding match...');
      const response = await matchmakingService.startMatchmaking('whot');
      if (response.matched && response.game) {
        setIsMatchmaking(false);
        dispatch(setCurrentGame(response.game));
      } else {
        setMatchmakingMessage(response.message);
        startMatchmakingPolling();
      }
    } catch (error: any) {
      setIsMatchmaking(false);
      navigation.goBack();
    }
  };

  const startMatchmakingPolling = () => {
    matchmakingIntervalRef.current = setInterval(async () => {
      try {
        const response = await matchmakingService.checkMatchmakingStatus('whot');
        if (response.matched && response.game) {
          if (matchmakingIntervalRef.current) clearInterval(matchmakingIntervalRef.current);
          setIsMatchmaking(false);
          dispatch(setCurrentGame(response.game));
        }
      } catch (error) { }
    }, 2000);
  };

  // --- 7. LOGIC HELPERS ---
  // rotateGameState is no longer needed because the server's `scrubStateForClient` 
  // pre-rotates the board (always puts the receiving player at index 0).

  // --- 8. STATE MEMOIZATION ---
  const { visualGameState, reconstructedAllCards } = useMemo(() => {
    // 🛡️ PURE SERVER-AUTHORITATIVE TRUTH
    // We only rely on Redux 'currentGame' (which receives backend updates).
    if (!currentGame?.board || !userProfile?.id) return { visualGameState: null, reconstructedAllCards: [] };

    const boardString = typeof currentGame.board === 'string' ? currentGame.board : JSON.stringify(currentGame.board);
    let serverState: GameState;

    if (boardString === prevBoardStringRef.current && stableBoardRef.current) {
      serverState = stableBoardRef.current;
    } else {
      try {
        const parsed = JSON.parse(boardString);
        const normalizeCard = (c: any) => {
          if (!c) return c;
          if (c.suit && typeof c.suit === 'string') c.suit = c.suit.toLowerCase();
          return c;
        };

        if (Array.isArray(parsed.market)) parsed.market.forEach(normalizeCard);
        if (Array.isArray(parsed.pile)) parsed.pile.forEach(normalizeCard);
        if (Array.isArray(parsed.players)) parsed.players.forEach((p: any) => p.hand?.forEach(normalizeCard));
        if (Array.isArray(parsed.allCards)) parsed.allCards.forEach(normalizeCard);

        if (parsed.calledSuit) parsed.calledSuit = parsed.calledSuit.toLowerCase();
        if (parsed.pendingAction?.type) parsed.pendingAction.type = parsed.pendingAction.type.toLowerCase();

        serverState = parsed as GameState;
        stableBoardRef.current = serverState;
        prevBoardStringRef.current = boardString;
      } catch (e) {
        return { visualGameState: null, reconstructedAllCards: [] };
      }
    }

    const safeState = {
      ...serverState,
      market: serverState.market || [],
      pile: serverState.pile || [],
      players: serverState.players.map(p => ({ ...p, hand: p.hand || [] }))
    };

    // Apply local paging order to player 0's hand
    if (localHandOrder.length > 0 && safeState.players[0]) {
      const orderMap = new Map(localHandOrder.map((id, index) => [id, index]));
      safeState.players[0].hand = [...safeState.players[0].hand].sort((a, b) => {
        const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
        const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
        return idxA - idxB;
      });
    }

    if (stableAllCardsRef.current.length === 0) {
      let allCards = safeState.allCards;
      if (!allCards || allCards.length === 0) {
        allCards = [
          ...safeState.players[0].hand,
          ...safeState.players[1].hand,
          ...safeState.pile,
          ...safeState.market
        ];
      }
      const seenIds = new Set();
      stableAllCardsRef.current = allCards.filter(card => {
        // 🔥 CRITICAL FIX: Ensure placeholder cards from the server are preserved!
        // The server sends `hidden-${opponentId}-${i}` and `hidden-market-${i}`. 
        if (!card?.id || seenIds.has(card.id)) return false;
        seenIds.add(card.id);
        return true;
      });
      console.log('🃏 [WhotOnline] Initialized stableAllCardsRef with', stableAllCardsRef.current.length, 'cards.', 'Market:', safeState.market.length, 'Pile:', safeState.pile.length);
    }

    const startCards = stableAllCardsRef.current;

    // The backend `scrubStateForClient` already guarantees that the local player
    // is at `players[0]`. Thus, no client-side rotation is needed!
    return { visualGameState: { ...safeState, allCards: startCards }, reconstructedAllCards: startCards };

  }, [currentGame?.board, userProfile?.id, localHandOrder]);

  useEffect(() => {
    if (visualGameState?.players?.[0]?.hand) {
      playerHandIdsSV.value = visualGameState.players[0].hand.map(c => c.id);
    }
  }, [visualGameState]);

  // --- 9. RECONCILIATION LOOP (Modified) ---
  useEffect(() => {
    if (isAnimating || isAnimatingRef.current || !hasDealt || !cardListRef.current || !visualGameState) return;

    const timeSinceLastAnim = Date.now() - lastAnimationTimeRef.current;
    if (timeSinceLastAnim < 500) return;

    const dealer = cardListRef.current;

    requestAnimationFrame(() => {
      visualGameState.market.forEach((c, i) => {
        dealer.teleportCard(c, "market", { cardIndex: i });
      });

      visualGameState.pile.forEach((c, i) => {
        dealer.teleportCard(c, "pile", { cardIndex: i });
      });

      const oppHand = visualGameState.players[1].hand || [];
      oppHand.forEach((c, i) => {
        dealer.teleportCard(c, "computer", { cardIndex: i, handSize: oppHand.length });
      });

      const myHand = visualGameState.players[0].hand || [];
      const visibleHand = myHand.slice(0, layoutHandSize);
      const hiddenHand = myHand.slice(layoutHandSize);

      visibleHand.forEach((c, i) => {
        dealer.teleportCard(c, "player", { cardIndex: i, handSize: layoutHandSize });
        dealer.flipCard(c, true); // Ensure my cards are face-up!
      });
      hiddenHand.forEach((c) => {
        // Stack behind the last visible card (index 5) with a lower zIndex
        dealer.teleportCard(c, "player", { cardIndex: 5, handSize: layoutHandSize, zIndex: 90 });
        dealer.flipCard(c, true); // Ensure hidden stacked cards are face-up too (in case they are paged)
      });
    });

  }, [visualGameState, hasDealt, isAnimating]);

  // --- 10. ACTION HANDLING (QUEUED) ---
  const processActionQueue = async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    while (actionQueueRef.current.length > 0) {
      const task = actionQueueRef.current.shift();
      if (task) {
        try {
          await task();
        } catch (e) {
          console.error("Queue Task Failed", e);
        }
      }
    }
    isProcessingQueueRef.current = false;
  };

  const animateReshuffle = useCallback(async () => {
    const dealer = cardListRef.current;
    if (!dealer || !visualGameState) return;

    const { pile } = visualGameState;
    if (pile.length <= 1) return;

    console.log("♻️ Animation: Moving pile cards back to market...");
    const cardsToMove = pile.slice(0, pile.length - 1);

    const promises = cardsToMove.map(async (card) => {
      const randomRot = Math.floor(Math.random() * 4 - 2);
      await Promise.all([
        dealer.dealCard(card, "market", { cardIndex: 0, rotation: randomRot }, false),
        dealer.flipCard(card, false),
      ]);
    });

    await Promise.all(promises);
    await new Promise((r) => setTimeout(r, 200));
  }, [visualGameState]);

  const handleAction = (
    logic: (baseState: GameState) => Promise<{ newState: GameState, animationPromise?: Promise<void> } | GameState>,
    socketAction?: WhotGameAction
  ) => {
    // 1. Lock UI via isAnimating immediately
    setIsAnimating(true);
    isAnimatingRef.current = true; // Still useful for general UI locks

    const task = async () => {
      try {
        const baseState = visualGameState!;

        // 2. Execute Logic ONLY for the animation side-effects
        const result = await logic(baseState);

        let animPromise: Promise<void> | undefined;

        if (result && typeof result === 'object' && 'newState' in result) {
          // @ts-ignore
          animPromise = result.animationPromise;
        }

        // 3. Emit Socket IMMEDIATELY to server
        if (socketAction) {
          logEmit();
          socketService.emitMove(currentGame!.id, { ...socketAction, timestamp: Date.now() });
        }

        // 4. Await local animation without updating local truth
        // Redux will receive gameStateUpdate shortly to confirm.
        if (animPromise) {
          await animPromise.catch(e => console.warn("Anim Error", e));
        }

      } catch (err) {
        console.error('Action logic failed:', err);
      } finally {
        lastAnimationTimeRef.current = Date.now();
        if (actionQueueRef.current.length === 0) {
          setIsAnimating(false);
          isAnimatingRef.current = false;
        }
      }
    };

    actionQueueRef.current.push(task);
    processActionQueue();
  };

  const handleRemoteAction = async (action: WhotGameAction) => {
    // 🎯 ANIMATION-ONLY: The server is authoritative.
    // Local game logic (playCard, pickCard etc.) must NOT run for opponent moves
    // because their cards are fogged (suit: 'hidden'). The gameStateUpdate broadcast
    // already updates Redux with the correct state.
    handleAction(async (currentBaseState) => {
      const dealer = cardListRef.current;

      switch (action.type) {
        case 'CARD_PLAYED': {
          // Prefer the full card from the server event (public info once played)
          // Fallback to allCards lookup (may be fogged for opponent cards)
          const card = (action as any).card
            || visualGameState?.allCards?.find(c => c.id === action.cardId);
          if (!card) return currentBaseState;

          let animPromise: Promise<void> | undefined;

          console.log(`🎴 [Remote CARD_PLAYED] card: ${card.id} suit:${card.suit} num:${card.number} dealer:${!!dealer}`);

          if (dealer) {
            const zIndex = currentBaseState.pile.length + 100;
            animPromise = Promise.all([
              dealer.dealCard(card, "pile", { cardIndex: zIndex }, false, action.timestamp),
              dealer.flipCard(card, true)
            ]).then(() => { });
          }

          // Do NOT call playCard() — server state handles everything
          return { newState: currentBaseState, animationPromise: animPromise };
        }

        case 'PICK_CARD': {
          // Opponent drew a card — just animate from market to opponent hand
          let animPromise: Promise<void> | undefined;

          if (dealer) {
            const oppHand = currentBaseState.players[1]?.hand || [];
            // We don't know the exact drawn card, but the reconciliation loop
            // will snap everything into place when the gameStateUpdate arrives.
            animPromise = (async () => {
              await new Promise(r => setTimeout(r, 100));
            })();
          }

          return { newState: currentBaseState, animationPromise: animPromise };
        }

        case 'CALL_SUIT':
          // Visual only — the server state will update calledSuit via gameStateUpdate
          return currentBaseState;

        case 'FORCED_DRAW': {
          // Opponent is drawing penalty cards — let reconciliation handle it
          let animPromise: Promise<void> | undefined;
          if (dealer) {
            animPromise = (async () => {
              await new Promise(r => setTimeout(r, 100));
            })();
          }
          return { newState: currentBaseState, animationPromise: animPromise };
        }

        default:
          return currentBaseState;
      }
    }, undefined);
  };

  const latestOnCardPress = useRef<(card: Card) => void>(() => { });

  useEffect(() => {
    latestOnCardPress.current = (card: Card) => {
      if (!visualGameState) return;

      if (visualGameState.currentPlayer !== 0) {
        toast({ title: 'Not your turn', type: "error" });
        return;
      }
      logTap();

      handleAction(async (currentBaseState) => {
        const dealer = cardListRef.current;
        let newState = playCard(currentBaseState, 0, card);
        let animPromise: Promise<void> | undefined;

        if (dealer) {
          const safeZIndex = newState.pile.length + 100;
          animPromise = Promise.all([
            dealer.dealCard(card, "pile", { cardIndex: safeZIndex }, false),
            dealer.flipCard(card, true)
          ]).then(() => { });

          const myHand = newState.players[0].hand;
          const visibleHand = myHand.slice(0, playerHandLimit);
          visibleHand.forEach((hCard, idx) => {
            dealer.dealCard(hCard, "player", { cardIndex: idx, handSize: layoutHandSize }, false);
          });
        }

        if (card.number === 14) {
          const { newState: stateAfterDraw, drawnCard } = executeForcedDraw(newState);
          if (drawnCard && dealer) {
            const subAnim = async () => {
              dealer.teleportCard(drawnCard, "market", { cardIndex: 0 });
              await new Promise(r => setTimeout(r, 40));

              const oppHand = stateAfterDraw.players[1].hand;
              const animPromises = oppHand.slice(0, layoutHandSize).map((c, idx) => {
                return dealer.dealCard(c, "computer", {
                  cardIndex: idx,
                  handSize: layoutHandSize,
                }, false);
              });
              await Promise.all(animPromises);
            };
            animPromise = animPromise ? animPromise.then(subAnim) : subAnim();
          }
          newState = stateAfterDraw;
        }

        if (card.number === 20 && newState.pendingAction?.type === 'call_suit') {
          pendingWhotCardId.current = card.id;
          setIsSuitSelectorOpen(true);
        }

        return { newState, animationPromise: animPromise };
      }, card.number === 20 ? undefined : { type: 'PLAY_CARD', cardId: card.id, timestamp: Date.now() }); // Delay emit for card 20
    };
  });

  const onCardPress = useCallback((card: Card) => {
    latestOnCardPress.current(card);
  }, []);

  const onPickFromMarket = () => {
    if (visualGameState?.currentPlayer !== 0) return;

    const isSurrender = (visualGameState?.pendingAction?.type === 'draw' || visualGameState?.pendingAction?.type === 'defend') && visualGameState?.pendingAction.playerIndex === 0;

    // The backend `whotGameEngine.js` validateMove function expects exactly `{ type: 'DRAW' }`.
    // Previously we sent 'PICK_CARD' and 'FORCED_DRAW' which caused the server to silently reject the move.
    const socketAction: WhotGameAction = { type: 'DRAW', timestamp: Date.now() };

    handleAction(async (baseState) => {
      const dealer = cardListRef.current;
      if (!dealer) return baseState;

      let logicalState = baseState;
      if (logicalState.market.length === 0 && logicalState.pile.length > 1) {
        await animateReshuffle();
        logicalState = getReshuffledState(logicalState);
      }

      const handlePickLogic = async (startState: GameState): Promise<{ newState: GameState, animationPromise?: Promise<void> }> => {
        let tempState = startState;
        let animPromise: Promise<void> | undefined;

        const pending = tempState.pendingAction;

        if (pending?.type === 'draw' && pending.playerIndex === 0) {
          const totalToPick = pending.count;
          const animSteps: Card[] = [];

          for (let i = 0; i < totalToPick; i++) {
            if (tempState.market.length === 0 && tempState.pile.length > 1) {
              await animateReshuffle();
              tempState = getReshuffledState(tempState);
            }
            const { newState: nextS, drawnCard } = executeForcedDraw(tempState);
            tempState = nextS;
            if (drawnCard) animSteps.push(drawnCard);
          }

          if (animSteps.length > 0) {
            animPromise = (async () => {
              let currentLoopState = startState;
              for (const card of animSteps) {
                const nextStepS = executeForcedDraw(currentLoopState).newState;

                dealer.teleportCard(card, "market", { cardIndex: 0 });
                await new Promise(r => setTimeout(r, 40));

                const myHand = nextStepS.players[0].hand;
                const animPromises = myHand.slice(0, layoutHandSize).map((c, idx) => {
                  return dealer.dealCard(c, "player", {
                    cardIndex: idx,
                    handSize: layoutHandSize,
                  }, false);
                });
                animPromises.push(dealer.flipCard(card, true));
                await Promise.all(animPromises);
                currentLoopState = nextStepS;
                await new Promise(r => setTimeout(r, 100));
              }
            })();
          }
          return { newState: tempState, animationPromise: animPromise };
        }

        const { newState, drawnCards } = pickCard(tempState, 0);

        if (drawnCards.length === 0 && newState.pendingAction?.type === 'draw') {
          return handlePickLogic(newState);
        }

        if (drawnCards.length > 0) {
          const card = drawnCards[0];
          animPromise = (async () => {
            await new Promise(r => setTimeout(r, 40));
            dealer.teleportCard(card, "market", { cardIndex: 0 });
            await new Promise(r => setTimeout(r, 40));

            const myHand = newState.players[0].hand;
            const animPromises = myHand.slice(0, layoutHandSize).map((c, idx) => {
              return dealer.dealCard(c, "player", {
                cardIndex: idx,
                handSize: layoutHandSize,
              }, false);
            });
            animPromises.push(dealer.flipCard(card, true));
            await Promise.all(animPromises);
          })();
        }
        return { newState, animationPromise: animPromise };
      };

      return await handlePickLogic(logicalState);
    }, socketAction);
  };

  const onSuitSelect = (suit: CardSuit) => {
    setIsSuitSelectorOpen(false);
    const cardId = pendingWhotCardId.current;

    handleAction(async (baseState) => {
      const newState = callSuit(baseState, 0, suit);
      return newState;
    }, cardId ? { type: 'PLAY_CARD', cardId, calledSuit: suit, timestamp: Date.now() } : undefined);

    pendingWhotCardId.current = null;
  };

  const handlePagingPress = async () => {
    const dealer = cardListRef.current;
    if (!dealer || isAnimating || isAnimatingRef.current || !visualGameState) return;

    const myHand = visualGameState.players[0].hand;
    if (myHand.length <= playerHandLimit) return;

    const lastCard = myHand[myHand.length - 1];
    const rotatedHand = [lastCard, ...myHand.slice(0, -1)];

    setIsAnimating(true);
    isAnimatingRef.current = true;

    // Instantly update UI and Redux-independent state
    setLocalHandOrder(rotatedHand.map(c => c.id));

    dealer.teleportCard(lastCard, "player", { cardIndex: -1, handSize: layoutHandSize, zIndex: 90 });

    const animationPromises: Promise<void>[] = [];
    rotatedHand.slice(0, layoutHandSize).forEach((c, idx) => {
      animationPromises.push(dealer.dealCard(c, "player", { cardIndex: idx, handSize: layoutHandSize }, false));
    });

    if (rotatedHand.length > layoutHandSize) {
      const cardLeaving = rotatedHand[layoutHandSize];
      animationPromises.push(dealer.dealCard(cardLeaving, "player", { cardIndex: 5, handSize: layoutHandSize, zIndex: 90 }, false));
    }

    await Promise.all(animationPromises);

    lastAnimationTimeRef.current = Date.now();
    setIsAnimating(false);
    isAnimatingRef.current = false;
  };

  const onCardListReady = () => {
    setTimeout(() => { if (!hasDealt) animateInitialDeal(); }, 500);
  };

  const animateInitialDeal = async () => {
    if (!visualGameState || !cardListRef.current) return;
    const dealer = cardListRef.current;
    setIsAnimating(true);
    isAnimatingRef.current = true;
    const { players, pile } = visualGameState;
    const h1 = players[0].hand;
    const h2 = players[1].hand;
    const visiblePlayerHand = h1.slice(0, layoutHandSize);
    const hiddenPlayerHand = h1.slice(layoutHandSize);
    const dealPromises = [];
    for (let i = 0; i < h2.length; i++) {
      dealPromises.push(dealer.dealCard(h2[i], "computer", { cardIndex: i, handSize: h2.length }, false));
    }
    for (let i = 0; i < visiblePlayerHand.length; i++) {
      dealPromises.push(dealer.dealCard(visiblePlayerHand[i], "player", { cardIndex: i, handSize: layoutHandSize }, false));
    }
    for (const card of hiddenPlayerHand) {
      dealer.dealCard(card, "player", { cardIndex: 5, handSize: layoutHandSize, zIndex: 90 }, true);
    }
    if (pile.length > 0) {
      dealPromises.push(dealer.dealCard(pile[pile.length - 1], "pile", { cardIndex: 0 }, false));
      dealPromises.push(dealer.flipCard(pile[pile.length - 1], true));
    }
    await Promise.all(dealPromises);
    const flips = visiblePlayerHand.map(c => dealer.flipCard(c, true));
    await Promise.all(flips);
    lastAnimationTimeRef.current = Date.now();
    setIsAnimating(false);
    isAnimatingRef.current = false;
    setHasDealt(true);
  };

  const handleExit = () => {
    dispatch(clearCurrentGame());
    navigation.navigate('GameHome' as never);
  };

  const areFontsReady = stableFont !== null && stableWhotFont !== null;
  if (!currentGame || !visualGameState || !areFontsReady || !assetsReady || !areCardsReadyToRender) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Preparing Arena...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const opponent = isPlayer2 ? currentGame.player1 : currentGame.player2;
  return (
    <WhotCoreUI
      game={{
        gameState: visualGameState,
        allCards: areCardsReadyToRender ? reconstructedAllCards : []
      }}
      playerState={{
        name: userProfile?.name || 'You',
        rating: userProfile?.rating || 1200,
        handLength: visualGameState.players?.[0]?.hand?.length || 0,
        isCurrentPlayer: visualGameState.currentPlayer === 0,
        avatar: userProfile?.avatar
      }}
      opponentState={{
        name: opponent?.name || 'Opponent',
        rating: opponent?.rating || 1200,
        handLength: visualGameState.players?.[1]?.hand?.length || 0,
        isCurrentPlayer: visualGameState.currentPlayer === 1,
        isAI: false
      }}
      marketCardCount={visualGameState.market?.length || 0}
      activeCalledSuit={visualGameState.calledSuit || null}
      showSuitSelector={isSuitSelectorOpen || (visualGameState.pendingAction?.type === 'call_suit' && visualGameState.currentPlayer === 0)}

      // Dual-Tier Timer Props
      turnStartTime={visualGameState.turnStartTime}
      turnDuration={visualGameState.turnDuration}
      warningYellowAt={visualGameState.warningYellowAt}
      warningRedAt={visualGameState.warningRedAt}
      serverTimeOffset={serverTimeOffset}

      isAnimating={isAnimating}
      cardListRef={cardListRef}
      onCardPress={onCardPress}
      onFeedback={onFeedback}
      onPickFromMarket={onPickFromMarket}
      onPagingPress={handlePagingPress}
      onSuitSelect={onSuitSelect}
      onCardListReady={onCardListReady}
      showPagingButton={(visualGameState.players?.[0]?.hand?.length || 0) > playerHandLimit}
      allCards={areCardsReadyToRender ? reconstructedAllCards : []}
      playerHandIdsSV={playerHandIdsSV}
      gameInstanceId={currentGame.id || 'whot-online'}
      stableWidth={width}
      stableHeight={height}
      stableFont={stableFont}
      stableWhotFont={stableWhotFont}
      isLandscape={isLandscape}
      gameOver={visualGameState.winner ? {
        winner: visualGameState.winner,
        onRematch: () => { },
        onNewBattle: handleExit,
        level: 1 as any,
        playerName: userProfile?.name || 'You',
        opponentName: opponent?.name || 'Opponent',
        playerRating: userProfile?.rating || 1200,
        result: visualGameState.winner.id === userProfile?.id ? 'win' : 'loss'
      } : null}
    />
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FFD700', marginTop: 15 },
  matchmakingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  matchmakingTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', marginTop: 20, textAlign: 'center' },
  cancelButton: { marginTop: 40, padding: 15, borderWidth: 1, borderColor: '#d32f2f', borderRadius: 8 },
  cancelText: { color: '#ef5350', fontSize: 16, fontWeight: '600' },
});

const WhotOnlineScreen = () => {
  const navigation = useNavigation();
  return (
    <WhotErrorBoundary onGoBack={() => navigation.goBack()}>
      <WhotOnlineUI />
    </WhotErrorBoundary>
  );
};

export default WhotOnlineScreen;