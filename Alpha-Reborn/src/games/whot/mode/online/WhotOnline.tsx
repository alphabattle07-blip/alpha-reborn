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
import { playCard, pickCard, callSuit, executeForcedDraw } from '../core/game';
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
    if (currentGame?.id) {
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
            // MERGE SYNC: If we accept a full sync, we must update our Local Truth
            // Payload is Server State (needs rotation if P2)
            const newState = payload as GameState;
            // We need to rotate if we are P2
            const visualState = needsRotation ? rotateGameState(newState) : newState;

            // Commit to Local Truth
            pendingLocalStateRef.current = visualState;

            // Update Redux
            dispatch(setCurrentGame({ ...currentGame, board: payload }));
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
      myHand.forEach((c, i) => {
        if (i < 5) {
          const stableHandSize = myHand.length > 5 ? 5 : myHand.length;
          dealer.teleportCard(c, "player", { cardIndex: i, handSize: stableHandSize });
        } else {
          dealer.teleportCard(c, "player", { cardIndex: -100, handSize: 5 });
        }
      });
    });

  }, [visualGameState, hasDealt, isAnimating]);

  // --- 10. ACTION HANDLING (With Timestamp Locking) ---

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
        // Ensure we de-rotate if we are Player 2, because Redux expects "Server/Logical" format
        // pendingLocalStateRef is always ROTATED (Me=0).
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

        // 6. Persist Background - ONLY ON GAME OVER (Optimization)
        // We rely on Sockets/Memory for intermediate state. DB is only for final results/wallet.
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

        // 7. Handle Animation (Non-Blocking for State, but Blocking for Queue?)
        // If we await here, we ensure sequential animations (A lands, then B starts).
        // This prevents chaos.
        if (animPromise) {
          await animPromise.catch(e => console.warn("Anim Error", e));
        }

      } catch (err) {
        console.error('Action logic failed:', err);
      } finally {
        lastAnimationTimeRef.current = Date.now();
        // We defer clearing 'isAnimating' until queue empty? 
        // Or simply keep it simple.
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
    // No need to sleep here anymore, the queue handles serialization!

    handleAction(async (currentBaseState) => {
      const dealer = cardListRef.current;
      const oppIndex = 1;

      switch (action.type) {
        case 'CARD_PLAYED': {
          const card = visualGameState?.allCards?.find(c => c.id === action.cardId);
          if (!card) return currentBaseState;

          let animPromise: Promise<void> | undefined;

          if (dealer) {
            // Animation: Opponent plays card to pile
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
            // Special 14 Cascade Visualization
            const { newState: finalState, drawnCard } = executeForcedDraw(newState);
            if (drawnCard && dealer) {
              const subAnim = async () => {
                dealer.teleportCard(drawnCard, "market", { cardIndex: 0 });
                await new Promise(r => setTimeout(r, 50));
                // Opponent attacked ME (Player 0)
                const myHand = finalState.players[0].hand;
                await dealer.dealCard(drawnCard, "player", {
                  cardIndex: myHand.length - 1,
                  handSize: myHand.length > 5 ? 5 : myHand.length
                }, false);
              };
              // Chain animations if needed
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
              dealer.teleportCard(card, "market", { cardIndex: 0 }, action.timestamp);
              await new Promise(r => setTimeout(r, 40));
              await dealer.dealCard(card, "computer", {
                cardIndex: newState.players[1].hand.length - 1,
                handSize: newState.players[1].hand.length
              }, false, action.timestamp);
            })();
          }
          return { newState, animationPromise: animPromise };
        }

        case 'CALL_SUIT':
          return callSuit(currentBaseState, oppIndex, action.suit);

        case 'FORCED_DRAW': {
          let state = currentBaseState;
          let animPromise: Promise<void> | undefined;

          const pending = state.pendingAction;
          if (pending?.type === 'draw' && pending.playerIndex === oppIndex) {
            animPromise = (async () => {
              const total = pending.count;
              // We need to iterate state to find WHICH cards are drawn for correct animation?
              // Actually we just rerun the drawing logic locally for visualization.
              // NOTE: We must capture the ITERATIVE state updates for the animation to know indexes.
              // But passing `state` into the async closure is risky if `state` is mutated?
              // `executeForcedDraw` returns a NEW state object. Safe.

              let tempState = state;
              for (let i = 0; i < total; i++) {
                const { newState: nextS, drawnCard } = executeForcedDraw(tempState);
                tempState = nextS;

                if (drawnCard && dealer) {
                  dealer.teleportCard(drawnCard, "market", { cardIndex: 0 }, action.timestamp);
                  await new Promise(r => setTimeout(r, 40));
                  await dealer.dealCard(drawnCard, "computer", {
                    cardIndex: tempState.players[1].hand.length - 1,
                    handSize: tempState.players[1].hand.length
                  }, false, action.timestamp);
                }
              }
            })();

            // To be perfectly accurate, we should return the FINAL state immediately.
            // Loop synchronously to get final state.
            let tempState = state;
            for (let i = 0; i < pending.count; i++) {
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

  // --- 11. USER INPUT HANDLERS ---
  // --- 11. USER INPUT HANDLERS ---
  const latestOnCardPress = useRef<(card: Card) => void>(() => { });

  useEffect(() => {
    latestOnCardPress.current = (card: Card) => {
      if (!visualGameState) return;

      // Check turn using Visual Index 0 (You)
      if (visualGameState.currentPlayer !== 0) {
        toast({ title: 'Not your turn', type: "warning" });
        return;
      }
      logTap();

      handleAction(async (currentBaseState) => {
        const dealer = cardListRef.current;
        // 🔥 FIX: Always use visual index 0 (Me) because currentBaseState is already rotated.
        let newState = playCard(currentBaseState, 0, card);
        let animPromise: Promise<void> | undefined;

        if (dealer) {
          const safeZIndex = newState.pile.length + 100;
          animPromise = Promise.all([
            dealer.dealCard(card, "pile", { cardIndex: safeZIndex }, false),
            dealer.flipCard(card, true)
          ]).then(() => { });
        }

        if (card.number === 14) {
          const { newState: stateAfterDraw, drawnCard } = executeForcedDraw(newState);
          if (drawnCard && dealer) {
            const subAnim = async () => {
              dealer.teleportCard(drawnCard, "market", { cardIndex: 0 });
              await new Promise(r => setTimeout(r, 50));
              // Opponent attacked ME (Player 0) - or cascading 14s...
              // Wait, if I played 14, and Opponent picks? No, I played 14.
              // If I played 14, newState logic executes forced draw on Opponent?
              // Logic: playCard(14) -> sets pendingAction for NEXT player.
              // executeForcedDraw(newState) checks pendingAction.
              // If I just played 14, pendingAction is for Opponent (1).
              // So executeForcedDraw draws for Opponent.
              // Opponent is Visually Index 1.
              // BUT previous code used logic to deal to 'computer' (which is Opponent).
              // "const oppIndex = myLogicalIndex === 0 ? 1 : 0;" -> original logic tried to find logical opponent.
              // Visual Opponent is ALWAYS 1.
              const oppHand = stateAfterDraw.players[1].hand;
              await dealer.dealCard(drawnCard, "computer", {
                cardIndex: oppHand.length - 1,
                handSize: oppHand.length
              }, false);
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

    // 🔥 FIX: Check against 0
    const isSurrender = visualGameState?.pendingAction?.type === 'draw' && visualGameState?.pendingAction.playerIndex === 0;

    const socketAction: WhotGameAction = isSurrender
      ? { type: 'FORCED_DRAW', timestamp: Date.now() }
      : { type: 'PICK_CARD', timestamp: Date.now() };

    handleAction(async (baseState) => {
      const dealer = cardListRef.current;
      if (!dealer) return baseState;

      const handlePickLogic = async (startState: GameState): Promise<{ newState: GameState, animationPromise?: Promise<void> }> => {
        let tempState = startState;
        let animPromise: Promise<void> | undefined;

        const pending = tempState.pendingAction;

        // 🔥 FIX: Check against 0 (Visual You)
        if (pending?.type === 'draw' && pending.playerIndex === 0) {
          const totalToPick = pending.count;
          const animSteps: Card[] = [];

          for (let i = 0; i < totalToPick; i++) {
            const { newState: nextS, drawnCard } = executeForcedDraw(tempState);
            tempState = nextS;
            if (drawnCard) animSteps.push(drawnCard);
          }

          if (animSteps.length > 0) {
            animPromise = (async () => {
              for (const card of animSteps) {
                dealer.teleportCard(card, "market", { cardIndex: 0 });
                await new Promise(r => setTimeout(r, 40));

                // 🔥 FIX: Visual logic always deals to 'player' (Me)
                const myHand = tempState.players[0].hand;
                const finalIndex = myHand.findIndex(c => c.id === card.id);

                await dealer.dealCard(card, "player", {
                  cardIndex: finalIndex >= 0 ? finalIndex : -1,
                  handSize: 5
                }, false);
                await dealer.flipCard(card, true);
                await new Promise(r => setTimeout(r, 150));
              }
            })();
          }
          return { newState: tempState, animationPromise: animPromise };
        }

        // 🔥 FIX: Use 0 for pickCard
        const { newState, drawnCards } = pickCard(tempState, 0);

        if (drawnCards.length === 0 && newState.pendingAction?.type === 'draw') {
          return handlePickLogic(newState);
        }

        if (drawnCards.length > 0) {
          const card = drawnCards[0];
          animPromise = (async () => {
            dealer.teleportCard(card, "market", { cardIndex: 0 });
            await new Promise(r => setTimeout(r, 40));

            const myHand = newState.players[0].hand; // 🔥 FIX: Visual Index 0
            const finalIndex = myHand.findIndex(c => c.id === card.id);

            await dealer.dealCard(card, "player", {
              cardIndex: finalIndex >= 0 ? finalIndex : myHand.length,
              handSize: myHand.length > 5 ? 5 : myHand.length
            }, false);
            await dealer.flipCard(card, true);
          })();
        }

        return { newState, animationPromise: animPromise };
      };

      return await handlePickLogic(baseState);
    }, socketAction);
  };

  const onSuitSelect = (suit: CardSuit) => {
    console.log("🎨 Suit Selected:", suit);
    setIsSuitSelectorOpen(false);
    handleAction(async (baseState) => {
      // Always use visual index 0 for local player
      const newState = callSuit(baseState, 0, suit);
      console.log("🎨 New State calledSuit:", newState.calledSuit);
      return newState;
    }, { type: 'CALL_SUIT', suit, timestamp: Date.now() });
  };

  const handlePagingPress = async () => {
    const dealer = cardListRef.current;
    if (!dealer || isAnimating || isAnimatingRef.current || !visualGameState) return;

    const myHand = visualGameState.players[0].hand;
    if (myHand.length <= 5) return;

    const lastCard = myHand[myHand.length - 1];
    const rotatedHand = [lastCard, ...myHand.slice(0, -1)];

    dealer.teleportCard(lastCard, "player", { cardIndex: -1, handSize: 5 });

    handleAction(async () => {
      const newState = {
        ...visualGameState,
        players: visualGameState.players.map((p, i) => i === 0 ? { ...p, hand: rotatedHand } : p)
      };

      const animationPromises: Promise<void>[] = [];
      rotatedHand.slice(0, 5).forEach((c, idx) => {
        animationPromises.push(dealer.dealCard(c, "player", { cardIndex: idx, handSize: 5 }, false));
      });
      if (rotatedHand.length > 5) {
        animationPromises.push(dealer.dealCard(rotatedHand[5], "player", { cardIndex: 5, handSize: 5 }, false));
      }
      await Promise.all(animationPromises);
      return newState;
    });
  };

  // --- 12. INITIALIZATION ---
  const onCardListReady = () => {
    setTimeout(() => {
      if (!hasDealt) animateInitialDeal();
    }, 500);
  };

  const animateInitialDeal = async () => {
    if (!visualGameState || !cardListRef.current) return;
    const dealer = cardListRef.current;
    setIsAnimating(true);
    isAnimatingRef.current = true;

    const { players, pile } = visualGameState;
    const h1 = players[0].hand;
    const h2 = players[1].hand;

    const dealPromises = [];
    for (let i = 0; i < h2.length; i++) {
      if (h2[i]) dealPromises.push(dealer.dealCard(h2[i], "computer", { cardIndex: i, handSize: h2.length }, false));
    }
    for (let i = 0; i < h1.length; i++) {
      if (h1[i]) dealPromises.push(dealer.dealCard(h1[i], "player", { cardIndex: i, handSize: h1.length }, false));
    }
    if (pile.length > 0) {
      dealPromises.push(dealer.dealCard(pile[pile.length - 1], "pile", { cardIndex: 0 }, false));
      dealPromises.push(dealer.flipCard(pile[pile.length - 1], true));
    }
    await Promise.all(dealPromises);

    const flips = h1.map(c => dealer.flipCard(c, true));
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

  // --- RENDER ---
  const areFontsReady = stableFont !== null && stableWhotFont !== null;

  if (errorMessage) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>⚠️ Error</Text>
          <Text style={styles.loadingText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isMatchmaking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.matchmakingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.matchmakingTitle}>{matchmakingMessage}</Text>
          <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentGame || !visualGameState || !areFontsReady || !assetsReady || !areCardsReadyToRender) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Preparing Arena...</Text>
          <Text style={[styles.loadingText, { fontSize: 10, opacity: 0.6 }]}>
            {!currentGame ? 'Waiting for match...' : !areFontsReady ? 'Loading fonts...' : !assetsReady ? 'Cashing assets...' : !areCardsReadyToRender ? 'Initializing layout...' : 'Processing board...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const opponent = needsRotation ? currentGame.player1 : currentGame.player2;

  if (visualGameState?.calledSuit) {
    console.log("🎨 RENDER: Active Suit =", visualGameState.calledSuit);
  }

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
      showPagingButton={(visualGameState.players?.[0]?.hand?.length || 0) > 5}
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
  errorText: { color: '#ef5350', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
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