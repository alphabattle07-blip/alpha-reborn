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
  const needsRotation = isPlayer2;
  const myLogicalIndex = needsRotation ? 1 : 0;

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

  // ✅ NEW: Tracks when YOU last made a move.
  // We use this to ignore "old" server data for a few seconds.
  const lastLocalActionTimeRef = useRef<number>(0);

  // --- GAME REFS ---
  const cardListRef = useRef<any>(null);
  const [hasDealt, setHasDealt] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);

  // --- ACTION QUEUE REF ---
  // A queue to ensure that state updates and animations happen sequentially to prevent race conditions
  const actionQueueRef = useRef<(() => Promise<void>)[]>([]);
  const isProcessingQueueRef = useRef(false);
  const playerHandIdsSV = useSharedValue<string[]>([]);

  // --- MEMOIZATION REFS ---
  const prevBoardStringRef = useRef<string | null>(null);
  const stableBoardRef = useRef<GameState | null>(null);
  const stableAllCardsRef = useRef<Card[]>([]);

  const pendingLocalStateRef = useRef<GameState | null>(null);
  const [areCardsReadyToRender, setCardsReadyToRender] = useState(false);
  const [isSuitSelectorOpen, setIsSuitSelectorOpen] = useState(false);

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

  // Seed pendingLocalStateRef with the initial visualGameState for action inference
  useEffect(() => {
    if (visualGameState && !pendingLocalStateRef.current && !isAnimatingRef.current) {
      console.log("🌱 [WhotOnline] Seeding initial state reference");
      pendingLocalStateRef.current = visualGameState;
    }
  }, [visualGameState]);

  // --- 2. LAZY LOAD CARDS ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setCardsReadyToRender(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

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

  // --- 4. POLLING FALLBACK (WITH STALE DATA PROTECTION) ---
  useEffect(() => {
    if (currentGame?.id && !isAnimating) {
      const interval = setInterval(() => {
        // ✅ GUARD: If I just made a move < 3 seconds ago, DO NOT POLL.
        // This prevents fetching "stale" state from the server that undoes my local move.
        if (Date.now() - lastLocalActionTimeRef.current < 3000) {
          return;
        }

        // Also guard against visual jumps during animations
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

      const unsubscribe = socketService.onOpponentMove((payload: any) => {
        if (payload && typeof payload === 'object' && 'type' in payload) {
          handleRemoteAction(payload as WhotGameAction);
        } else if (payload) {
          // ✅ GUARD: Ignore "Full State Syncs" if we are locally ahead (Shield Active)
          if (Date.now() - lastLocalActionTimeRef.current < 3000) {
            return;
          }

          if (!isAnimatingRef.current) {
            // --- INFER ACTION FROM STATE DIFF (Frontend-Only Fix) ---
            const localVisual = pendingLocalStateRef.current;
            // The payload is the Server State (raw). Convert to Visual State to compare.
            const serverVisual = needsRotation ? rotateGameState(payload) : payload;

            let inferredAction: WhotGameAction | null = null;

            if (localVisual && serverVisual) {
              const oldPile = localVisual.pile || [];
              const newPile = serverVisual.pile || [];
              const oldOppHand = localVisual.players[1].hand || [];
              const newOppHand = serverVisual.players[1].hand || [];

              // 1. Detect CARD_PLAYED (Pile grew, Top card changed)
              if (newPile.length > oldPile.length) {
                const topCard = newPile[newPile.length - 1];
                const prevTop = oldPile.length > 0 ? oldPile[oldPile.length - 1] : null;

                if (topCard.id !== prevTop?.id) {
                  console.log("🕵️ INFERRED ACTION: CARD_PLAYED", topCard.id);
                  inferredAction = { type: 'CARD_PLAYED', cardId: topCard.id, timestamp: Date.now() };
                }
              }
              // 2. Detect PICK_CARD (Opponent hand grew)
              // Note: 'market' might differ, but hand size is the visual cue
              else if (newOppHand.length > oldOppHand.length) {
                console.log("🕵️ INFERRED ACTION: PICK_CARD");
                inferredAction = { type: 'PICK_CARD', timestamp: Date.now() };
              }
            }

            if (inferredAction) {
              // Execute the animation (this will also update local state)
              handleRemoteAction(inferredAction);
              // We rely on handleRemoteAction to eventually set pendingLocalStateRef
              // which will then match serverVisual (mostly).
            } else {
              // Fallback: Just sync state if no obvious action (or just a heavy refresh)
              const visualState = serverVisual;
              pendingLocalStateRef.current = visualState;
              dispatch(setCurrentGame({ ...currentGame, board: payload }));
            }
          }
        }
      });

      return () => {
        unsubscribe();
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
  const rotateGameState = (state: GameState): GameState => {
    const rotated = {
      ...state,
      players: [state.players[1], state.players[0]],
      currentPlayer: state.currentPlayer === 0 ? 1 : 0,
    } as GameState;

    if (rotated.pendingAction) {
      const pAction = { ...rotated.pendingAction };
      if (typeof pAction.playerIndex === 'number') {
        pAction.playerIndex = pAction.playerIndex === 0 ? 1 : 0;
      }
      if ('returnTurnTo' in pAction && typeof pAction.returnTurnTo === 'number') {
        pAction.returnTurnTo = pAction.returnTurnTo === 0 ? 1 : 0;
      }
      rotated.pendingAction = pAction as any;
    }
    return rotated;
  };

  // --- 8. STATE MEMOIZATION ---
  const { visualGameState, reconstructedAllCards } = useMemo(() => {
    // 🛡️ PERMANENT LOCAL TRUTH
    // We always prefer our local optimistic state (pendingLocalStateRef) if it exists.
    // We only fallback to Redux 'currentGame' on initial load or hard reset.
    if (pendingLocalStateRef.current) {
      const safeState = pendingLocalStateRef.current;
      const startCards = stableAllCardsRef.current.length > 0 ? stableAllCardsRef.current : safeState.allCards || [];

      // Ensure allCards is populated if stable ref was empty (edge case)
      if (stableAllCardsRef.current.length === 0 && startCards.length > 0) {
        stableAllCardsRef.current = startCards;
      }

      if (!needsRotation) {
        return { visualGameState: { ...safeState, allCards: startCards }, reconstructedAllCards: startCards };
      }

      // Note: pendingLocalStateRef is usually already rotated if it came from handleAction -> nextVisualState
      // But handleAction stores 'nextVisualState' BEFORE de-rotation for logic?
      // Let's check handleAction: 
      // "pendingLocalStateRef.current = nextVisualState;"
      // "const logicalBoard = !needsRotation ? nextVisualState : rotateGameState(nextVisualState);"
      // So pendingLocalStateRef is VISUAL (Player 0 is ME). Correct.
      // So we return it directly.
      if (safeState.players[0].id === userProfile?.id) {
        return { visualGameState: { ...safeState, allCards: startCards }, reconstructedAllCards: startCards };
      } else {
        // If for some reason it's not rotated (raw server state?), rotate it.
        const rotated = rotateGameState(safeState);
        rotated.allCards = startCards;
        return { visualGameState: rotated, reconstructedAllCards: startCards };
      }
    }

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
        if (!card?.id || seenIds.has(card.id)) return false;
        seenIds.add(card.id);
        return true;
      });
    }

    const startCards = stableAllCardsRef.current;

    if (!needsRotation) {
      return { visualGameState: { ...safeState, allCards: startCards }, reconstructedAllCards: startCards };
    }

    const rotated = rotateGameState(safeState);
    rotated.allCards = startCards;
    return { visualGameState: rotated, reconstructedAllCards: startCards };

  }, [currentGame?.board, needsRotation, userProfile?.id]);

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
      });
      hiddenHand.forEach((c) => {
        // Stack behind the last visible card (index 5) with a lower zIndex
        dealer.teleportCard(c, "player", { cardIndex: 5, handSize: layoutHandSize, zIndex: 90 });
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
    // 1. Lock Polling immediately
    lastLocalActionTimeRef.current = Date.now();
    setIsAnimating(true);
    isAnimatingRef.current = true; // Still useful for general UI locks

    const task = async () => {
      try {
        const baseState = pendingLocalStateRef.current || visualGameState!;

        // 2. Execute Logic (Calculates State Fast)
        const result = await logic(baseState);

        let nextState: GameState;
        let animPromise: Promise<void> | undefined;

        if (result && typeof result === 'object' && 'newState' in result) {
          // @ts-ignore
          nextState = result.newState;
          // @ts-ignore
          animPromise = result.animationPromise;
        } else {
          nextState = result as GameState;
        }

        // 3. Atomic State Update (The "Commit")
        pendingLocalStateRef.current = nextState;

        // 4. Update Redux (Visual Feedback)
        if (currentGame) {
          const serverFormatState = needsRotation ? rotateGameState(nextState) : nextState;
          dispatch(setCurrentGame({
            ...currentGame,
            board: serverFormatState
          }));
        }

        // 5. Emit Socket
        if (socketAction) {
          logEmit();
          socketService.emitMove(currentGame!.id, { ...socketAction, timestamp: Date.now() });
        }

        // 6. Persist Background - ONLY ON GAME OVER
        if (nextState.winner) {
          const logicalState = needsRotation ? rotateGameState(nextState) : nextState;
          dispatch(updateOnlineGameState({
            gameId: currentGame!.id,
            updates: {
              board: logicalState,
              currentTurn: logicalState.currentPlayer === 0 ? currentGame!.player1.id : (currentGame!.player2?.id || ''),
              winnerId: nextState.winner?.id,
              status: 'COMPLETED'
            }
          })).unwrap().catch(() => { });
        }

        // 7. Handle Animation
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
    handleAction(async (currentBaseState) => {
      const dealer = cardListRef.current;
      const oppIndex = 1;

      switch (action.type) {
        case 'CARD_PLAYED': {
          const card = visualGameState?.allCards?.find(c => c.id === action.cardId);
          if (!card) return currentBaseState;

          let animPromise: Promise<void> | undefined;

          if (dealer) {
            const zIndex = currentBaseState.pile.length + 100;
            animPromise = Promise.all([
              dealer.dealCard(card, "pile", { cardIndex: zIndex }, false, action.timestamp),
              dealer.flipCard(card, true)
            ]).then(() => { });
          }

          let newState = playCard(currentBaseState, oppIndex, card);
          if (action.suitChoice && newState.pendingAction?.type === 'call_suit') {
            newState = callSuit(newState, oppIndex, action.suitChoice);
          }

          if (card.number === 14 && newState.pendingAction?.type === 'draw') {
            const { newState: finalState, drawnCard } = executeForcedDraw(newState);
            if (drawnCard && dealer) {
              const subAnim = async () => {
                const srv = needsRotation ? rotateGameState(finalState) : finalState;
                dispatch(setCurrentGame({ ...currentGame!, board: srv }));
                pendingLocalStateRef.current = finalState;

                dealer.teleportCard(drawnCard, "market", { cardIndex: 0 });
                await new Promise(r => setTimeout(r, 40));

                const myHand = finalState.players[0].hand;
                const animPromises = myHand.slice(0, layoutHandSize).map((c, idx) => {
                  return dealer.dealCard(c, "player", {
                    cardIndex: idx,
                    handSize: layoutHandSize,
                  }, false);
                });
                animPromises.push(dealer.flipCard(drawnCard, true));
                await Promise.all(animPromises);
              };
              animPromise = animPromise ? animPromise.then(subAnim) : subAnim();
            }
            newState = finalState;
          }
          return { newState, animationPromise: animPromise };
        }

        case 'PICK_CARD': {
          const { newState, drawnCards } = pickCard(currentBaseState, oppIndex);
          let animPromise: Promise<void> | undefined;

          if (drawnCards.length > 0 && dealer) {
            const card = drawnCards[0];
            animPromise = (async () => {
              // Redux already updated by handleAction context
              await new Promise(r => setTimeout(r, 40));
              dealer.teleportCard(card, "market", { cardIndex: 0 }, action.timestamp);
              await new Promise(r => setTimeout(r, 40));

              const oppHand = newState.players[1].hand;
              const animPromises = oppHand.slice(0, layoutHandSize).map((c, idx) => {
                return dealer.dealCard(c, "computer", {
                  cardIndex: idx,
                  handSize: layoutHandSize,
                }, false, action.timestamp);
              });
              await Promise.all(animPromises);
            })();
          }
          return { newState, animationPromise: animPromise };
        }

        case 'CALL_SUIT':
          return callSuit(currentBaseState, oppIndex, action.suit);

        case 'FORCED_DRAW': {
          let state = currentBaseState;
          let animPromise: Promise<void> | undefined;

          if (state.pendingAction?.type === 'defend' && state.pendingAction.playerIndex === oppIndex) {
            state = {
              ...state,
              pendingAction: { ...state.pendingAction, type: 'draw' } as any
            };
          }

          const pending = state.pendingAction;
          if (pending?.type === 'draw' && pending.playerIndex === oppIndex) {
            animPromise = (async () => {
              const total = pending.count;
              let tempState = state;
              for (let i = 0; i < total; i++) {
                if (tempState.market.length === 0 && tempState.pile.length > 1 && dealer) {
                  await animateReshuffle();
                  tempState = getReshuffledState(tempState);
                  pendingLocalStateRef.current = tempState;
                }

                const { newState: nextS, drawnCard } = executeForcedDraw(tempState);
                tempState = nextS;

                if (drawnCard && dealer) {
                  const srv = needsRotation ? rotateGameState(tempState) : tempState;
                  dispatch(setCurrentGame({ ...currentGame!, board: srv }));
                  pendingLocalStateRef.current = tempState;

                  dealer.teleportCard(drawnCard, "market", { cardIndex: 0 }, action.timestamp);
                  await new Promise(r => setTimeout(r, 40));

                  const oppHand = tempState.players[1].hand;
                  const animPromises = oppHand.slice(0, layoutHandSize).map((c, idx) => {
                    return dealer.dealCard(c, "computer", {
                      cardIndex: idx,
                      handSize: layoutHandSize,
                    }, false, action.timestamp);
                  });
                  await Promise.all(animPromises);
                  await new Promise(r => setTimeout(r, 100));
                }
              }
            })();

            let tempState = state;
            for (let i = 0; i < pending.count; i++) {
              if (tempState.market.length === 0 && tempState.pile.length > 1) {
                tempState = getReshuffledState(tempState);
              }
              tempState = executeForcedDraw(tempState).newState;
            }
            state = tempState;
          }
          return { newState: state, animationPromise: animPromise };
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
              const srv = needsRotation ? rotateGameState(stateAfterDraw) : stateAfterDraw;
              dispatch(setCurrentGame({ ...currentGame!, board: srv }));
              pendingLocalStateRef.current = stateAfterDraw;

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
          setIsSuitSelectorOpen(true);
        }

        return { newState, animationPromise: animPromise };
      }, { type: 'CARD_PLAYED', cardId: card.id, timestamp: Date.now() });
    };
  });

  const onCardPress = useCallback((card: Card) => {
    latestOnCardPress.current(card);
  }, []);

  const onPickFromMarket = () => {
    if (visualGameState?.currentPlayer !== 0) return;

    const isSurrender = (visualGameState?.pendingAction?.type === 'draw' || visualGameState?.pendingAction?.type === 'defend') && visualGameState?.pendingAction.playerIndex === 0;

    const socketAction: WhotGameAction = isSurrender
      ? { type: 'FORCED_DRAW', timestamp: Date.now() }
      : { type: 'PICK_CARD', timestamp: Date.now() };

    handleAction(async (baseState) => {
      const dealer = cardListRef.current;
      if (!dealer) return baseState;

      let logicalState = baseState;
      if (logicalState.market.length === 0 && logicalState.pile.length > 1) {
        await animateReshuffle();
        logicalState = getReshuffledState(logicalState);
        pendingLocalStateRef.current = logicalState;
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
              pendingLocalStateRef.current = tempState;
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
                const srv = needsRotation ? rotateGameState(nextStepS) : nextStepS;
                dispatch(setCurrentGame({ ...currentGame!, board: srv }));
                pendingLocalStateRef.current = nextStepS;

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
    handleAction(async (baseState) => {
      const newState = callSuit(baseState, 0, suit);
      return newState;
    }, { type: 'CALL_SUIT', suit, timestamp: Date.now() });
  };

  const handlePagingPress = async () => {
    const dealer = cardListRef.current;
    if (!dealer || isAnimating || isAnimatingRef.current || !visualGameState) return;
    const myHand = visualGameState.players[0].hand;
    if (myHand.length <= playerHandLimit) return;
    const lastCard = myHand[myHand.length - 1];
    const rotatedHand = [lastCard, ...myHand.slice(0, -1)];
    dealer.teleportCard(lastCard, "player", { cardIndex: -1, handSize: layoutHandSize, zIndex: 90 });
    handleAction(async () => {
      const newState = {
        ...visualGameState,
        players: visualGameState.players.map((p, i) => i === 0 ? { ...p, hand: rotatedHand } : p)
      };
      const animationPromises: Promise<void>[] = [];
      rotatedHand.slice(0, layoutHandSize).forEach((c, idx) => {
        animationPromises.push(dealer.dealCard(c, "player", { cardIndex: idx, handSize: layoutHandSize }, false));
      });
      if (rotatedHand.length > layoutHandSize) {
        const cardLeaving = rotatedHand[layoutHandSize];
        animationPromises.push(dealer.dealCard(cardLeaving, "player", { cardIndex: 5, handSize: layoutHandSize, zIndex: 90 }, false));
      }
      await Promise.all(animationPromises);
      return newState;
    });
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

  const opponent = needsRotation ? currentGame.player1 : currentGame.player2;
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
        level: 1,
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