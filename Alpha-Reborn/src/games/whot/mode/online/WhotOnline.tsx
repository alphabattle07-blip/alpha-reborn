// WhotOnlineScreen
import React, { useState, useEffect, useRef, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Text, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../../../../../scripts/store/hooks';
import {
  fetchGameState,
  updateOnlineGameState,
} from '../../../../../scripts/store/thunks/onlineGameThunks';
import { clearCurrentGame, setCurrentGame } from '../../../../../scripts/store/slices/onlineGameSlice';
import { matchmakingService } from '../../../../services/api/matchmakingService';
import WhotCoreUI from '../core/ui/WhotCoreUI';
import { useWhotFonts } from '../core/ui/useWhotFonts';
import { Card, CardSuit, GameState, WhotGameAction } from '../core/types';
import { AnimatedCardListHandle } from '../core/ui/AnimatedCardList';
import { useSharedValue } from 'react-native-reanimated';
import { playCard, pickCard, callSuit, executeForcedDraw } from '../core/game';
import { socketService } from '../../../../services/api/socketService';
import { WhotAssetManager } from '../core/ui/WhotAssetManager';
import { LatencyLogger } from '../core/ui/LatencyLogger';

// Error Boundary to catch crashes in child components move
//move to whot
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

const WhotOnlineUI = () => {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const { currentGame } = useAppSelector(state => state.onlineGame);
  const { profile: userProfile } = useAppSelector(state => state.user);
  const { isAuthenticated, token } = useAppSelector(state => state.auth);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Error State for crash prevention
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { font: loadedFont, whotFont: loadedWhotFont, areLoaded } = useWhotFonts();
  const [stableFont, setStableFont] = useState<any>(null);
  const [stableWhotFont, setStableWhotFont] = useState<any>(null);

  // --- Player Role Determination (MUST be before useEffects that depend on it) ---
  const isPlayer1 = currentGame?.player1?.id === userProfile?.id;
  const isPlayer2 = currentGame?.player2?.id === userProfile?.id;
  const needsRotation = isPlayer2;

  // Matchmaking State
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [matchmakingMessage, setMatchmakingMessage] = useState('Finding match...');

  const matchmakingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedMatchmaking = useRef(false);


  // Game Logic State
  // Game Logic State
  const [isAnimating, setIsAnimating] = useState(false);
  const isAnimatingRef = useRef(false); // Ref for synchronous animation tracking
  const cardListRef = useRef<AnimatedCardListHandle>(null);
  const [hasDealt, setHasDealt] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const playerHandIdsSV = useSharedValue<string[]>([]);
  const previousGameStateRef = useRef<GameState | null>(null);

  const lastSyncBatchRef = useRef<string | null>(null);

  // Rapid Fire State Protection
  // Stores the latest calculated state to prevent stale closures during rapid taps
  const pendingLocalStateRef = useRef<GameState | null>(null);

  // Safety: Delay card rendering to prevent Reanimated initialization crashes on mount
  const [areCardsReadyToRender, setCardsReadyToRender] = useState(false);

  // Font Stabilization
  useEffect(() => {
    if (areLoaded && !stableFont && loadedFont && loadedWhotFont) {
      setStableFont(loadedFont);
      setStableWhotFont(loadedWhotFont);
    }
  }, [areLoaded, stableFont, loadedFont, loadedWhotFont]);

  // Lazy load cards
  useEffect(() => {
    const timer = setTimeout(() => {
      setCardsReadyToRender(true);
    }, 800); // 800ms delay to ensure layout is measured
    return () => clearTimeout(timer);
  }, []);


  // ... (Matchmaking useEffects remain the same)

  // Matchmaking Initialization
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

  // Polling
  useEffect(() => {
    if (currentGame?.id && !isAnimating) {
      const interval = setInterval(() => {
        dispatch(fetchGameState(currentGame.id));
      }, 15000); // REPLACED: Polling fallback reduced to 15s
      return () => clearInterval(interval);
    }
  }, [currentGame?.id, isAnimating, dispatch]);

  // --- ASSET PRELOADING ---
  useEffect(() => {
    if (currentGame?.id && userProfile) {
      const opponent = needsRotation ? currentGame.player1 : currentGame.player2;
      const avatarsToPreload = [
        userProfile.avatar || '',
        opponent?.avatar || ''
      ].filter(Boolean);

      WhotAssetManager.preload(avatarsToPreload).then(() => {
        setAssetsReady(true);
      });
    }
  }, [currentGame?.id, userProfile?.id]);

  // --- SOCKET.IO INTEGRATION ---
  useEffect(() => {
    if (currentGame?.id) {
      socketService.joinGame(currentGame.id);

      const unsubscribe = socketService.onOpponentMove((payload: any) => {
        if (payload && typeof payload === 'object' && 'type' in payload) {
          handleRemoteAction(payload as WhotGameAction);
        } else if (payload) {
          // Legacy/Fallback: Full state sync
          dispatch(setCurrentGame({
            ...currentGame,
            board: payload
          }));
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
      console.error('Matchmaking error:', error);
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
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);
  };

  // We process the game state here to ensure it's safe for rendering
  const { visualGameState, reconstructedAllCards } = useMemo(() => {
    if (!currentGame?.board || !userProfile?.id) return { visualGameState: null, reconstructedAllCards: [] };

    let board: any;
    try {
      board = typeof currentGame.board === 'string' ? JSON.parse(currentGame.board) : JSON.parse(JSON.stringify(currentGame.board));

      // NORMALIZE CARD DATA (Fix case mismatch e.g., "Star" -> "star")
      const normalizeCard = (c: any) => {
        if (!c) return c;
        if (c.suit && typeof c.suit === 'string') c.suit = c.suit.toLowerCase();
        if (c.shape && typeof c.shape === 'string') c.shape = c.shape.toLowerCase();
        return c; // Mutating deep clone is fine
      };

      if (Array.isArray(board.market)) board.market.forEach(normalizeCard);
      if (Array.isArray(board.pile)) board.pile.forEach(normalizeCard);
      if (Array.isArray(board.players)) {
        board.players.forEach((p: any) => {
          if (Array.isArray(p.hand)) {
            p.hand.forEach(normalizeCard);
          }
        });
      }
      if (Array.isArray(board.allCards)) board.allCards.forEach(normalizeCard);

      // NORMALIZE GAME STATE GLOBALS
      // Fixes issue where server sends "CROSS" but client expects "cross", causing "Invalid Move" lock.
      if (board.calledSuit && typeof board.calledSuit === 'string') {
        board.calledSuit = board.calledSuit.toLowerCase();
      }
      if (board.pendingAction && typeof board.pendingAction === 'object') {
        if (board.pendingAction.type && typeof board.pendingAction.type === 'string') {
          board.pendingAction.type = board.pendingAction.type.toLowerCase();
        }
      }
    } catch (e) {
      console.error("Failed to parse board state", e);
      return { visualGameState: null, reconstructedAllCards: [] };
    }

    const serverState = board as GameState;

    // SAFETY CHECK 1: Ensure critical arrays exist or default to []
    if (!serverState || !Array.isArray(serverState.players) || serverState.players.length < 2) {
      return { visualGameState: null, reconstructedAllCards: [] };
    }

    // SAFETY CHECK 2: Sanitize arrays (prevents undefined.length crash)
    const safeState = {
      ...serverState,
      market: serverState.market || [],
      pile: serverState.pile || [],
      players: serverState.players.map(p => ({ ...p, hand: p.hand || [] }))
    };

    // VITAL: Reconstruct allCards if missing. 
    // The server usually doesn't send "allCards", but AnimatedCardList NEEDS it to render anything.
    let allCards = safeState.allCards;
    if (!allCards || allCards.length === 0) {
      allCards = [
        ...safeState.players[0].hand,
        ...safeState.players[1].hand,
        ...safeState.pile,
        ...safeState.market
      ];
    }

    // --- DUPLICATE KEY PROTECTION ---
    // Ensure allCards only contains unique IDs to prevent AnimatedCardList crashes
    const seenIds = new Set();
    const uniqueAllCards = allCards.filter(card => {
      if (!card || !card.id || seenIds.has(card.id)) return false;
      seenIds.add(card.id);
      return true;
    });

    if (!needsRotation) {
      return { visualGameState: { ...safeState, allCards: uniqueAllCards }, reconstructedAllCards: uniqueAllCards };
    }

    // Flip players for Player 2 view
    const rotatedState = {
      ...safeState,
      players: [safeState.players[1], safeState.players[0]],
      currentPlayer: safeState.currentPlayer === 0 ? 1 : 0,
      allCards: uniqueAllCards // Pass the reconstructed cards
    } as GameState;

    // ✅ CRITICAL FIX: Rotate PendingAction Indices too!
    // If the server says "Pick 2 against Player 0", and I am Player 0 (but rotated to 0),
    // we need to make sure the index aligns with the visual arrays.
    // Actually, if I am Player 2 (index 1 on server), I am index 0 visually.
    // So if server says "Action on Player 1", that means "Action on Me (Visual 0)".
    if (rotatedState.pendingAction) {
      const pAction = { ...rotatedState.pendingAction };

      // Swap playerIndex (0 -> 1, 1 -> 0)
      if (typeof pAction.playerIndex === 'number') {
        pAction.playerIndex = pAction.playerIndex === 0 ? 1 : 0;
      }

      // Swap returnTurnTo if it exists
      if ('returnTurnTo' in pAction && typeof pAction.returnTurnTo === 'number') {
        pAction.returnTurnTo = pAction.returnTurnTo === 0 ? 1 : 0;
      }

      rotatedState.pendingAction = pAction as any;
    }

    return { visualGameState: rotatedState, reconstructedAllCards: uniqueAllCards };

  }, [currentGame?.board, needsRotation, userProfile?.id]);

  useEffect(() => {
    if (visualGameState && visualGameState.players?.[0]?.hand) {
      playerHandIdsSV.value = visualGameState.players[0].hand.map(c => c.id);
    }
  }, [visualGameState]);

  // Sync Logic
  useEffect(() => {
    // Check ref for instant blocking of reconciliation
    if (!visualGameState || isAnimating || isAnimatingRef.current || !hasDealt) return;

    const gameStateHash = JSON.stringify(visualGameState);
    // REMOVED: if (gameStateHash === lastSyncBatchRef.current) return;
    // We need to allow re-runs for paging or reconciliation even if hash matches?
    // Actually, reconciliation should run even if hash matches IF pageIndex changes.
    // But this sync effect is for detecting PLAYS/DRAWS.

    if (gameStateHash === lastSyncBatchRef.current) return;
    lastSyncBatchRef.current = gameStateHash;

    if (previousGameStateRef.current) {
      const prev = previousGameStateRef.current;
      const curr = visualGameState;

      // Detect Play (Improved Logic: Check if pile grew AND I didn't play)
      // If I played, my hand would shrink.
      // If I didn't play (hand same or grown), and pile grew, it must be opponent.
      // Also handles edge case of multi-card plays if any.
      const myHandSameOrGrown = (curr.players[0].hand?.length || 0) >= (prev.players[0].hand?.length || 0);

      if (curr.pile.length > prev.pile.length && myHandSameOrGrown) {
        const playedCard = curr.pile[curr.pile.length - 1];
        animateOpponentPlay(playedCard, curr);
      }
      // Detect Draw
      else if (curr.players?.[1]?.hand && prev.players?.[1]?.hand && curr.players[1].hand.length > prev.players[1].hand.length) {
        const prevHandCount = prev.players[1].hand.length;
        animateOpponentDraw(curr, prevHandCount);
      }
    }

    previousGameStateRef.current = visualGameState;
  }, [visualGameState, isAnimating, hasDealt]);

  // --- RECONCILIATION LOOP (The Fix for Visual Synchronization) ---
  useEffect(() => {
    if (isAnimating || isAnimatingRef.current || !hasDealt || !cardListRef.current || !visualGameState) return;

    const dealer = cardListRef.current;

    // 1. Reconcile Pile (Fixes "Whot card moves back" issue)
    visualGameState.pile.forEach((c, i) => {
      // Force pile cards to their correct slot
      dealer.teleportCard(c, "pile", { cardIndex: i });
    });

    // 2. Reconcile Opponent Hand (Fixes compression issues)
    const oppHand = visualGameState.players[1].hand || [];
    oppHand.forEach((c, i) => {
      dealer.teleportCard(c, "computer", { cardIndex: i, handSize: oppHand.length });
    });

    // 3. Reconcile Player Hand (Fixes Paging and Sorting)
    const myHand = visualGameState.players[0].hand || [];

    myHand.forEach((c, i) => {
      if (i < 5) {
        // STABLE: Use 5 as handSize if paged to prevent "jumping" positions
        const stableHandSize = myHand.length > 5 ? 5 : myHand.length;
        dealer.teleportCard(c, "player", {
          cardIndex: i,
          handSize: stableHandSize
        });
      } else {
        // Move off-screen or hide
        dealer.teleportCard(c, "player", { cardIndex: -100, handSize: 5 });
      }
    });

  }, [visualGameState, isAnimating, hasDealt]);

  const handlePagingPress = async () => {
    const dealer = cardListRef.current;
    if (!dealer || isAnimating || isAnimatingRef.current || !visualGameState) return;

    const myHand = visualGameState.players[0].hand;
    if (myHand.length <= 5) return;

    // Shift logic: Move the last card to the front
    const lastCard = myHand[myHand.length - 1];
    const rotatedHand = [lastCard, ...myHand.slice(0, -1)];

    // Optimistic teleport for the entering card (from right to -1 then to 0)
    dealer.teleportCard(lastCard, "player", { cardIndex: -1, handSize: 5 });

    handleAction(async () => {
      const newState = {
        ...visualGameState,
        players: visualGameState.players.map((p, i) =>
          i === 0 ? { ...p, hand: rotatedHand } : p
        )
      };

      const animationPromises: Promise<void>[] = [];
      rotatedHand.slice(0, 5).forEach((c, idx) => {
        animationPromises.push(dealer.dealCard(c, "player", {
          cardIndex: idx,
          handSize: 5
        }, false));
      });

      // Also animate the card that just left visibility (was at index 4, now index 5)
      if (rotatedHand.length > 5) {
        animationPromises.push(dealer.dealCard(rotatedHand[5], "player", {
          cardIndex: 5,
          handSize: 5
        }, false));
      }

      await Promise.all(animationPromises);
      return newState;
    });
  };

  const animateOpponentPlay = async (card: Card, finalState: GameState) => {
    const dealer = cardListRef.current;
    if (!dealer) return;
    setIsAnimating(true);
    isAnimatingRef.current = true;

    const finalPileIndex = finalState.pile.length - 1;
    await Promise.all([
      dealer.dealCard(card, "pile", { cardIndex: finalPileIndex }, false),
      dealer.flipCard(card, true)
    ]);
    setIsAnimating(false);
    isAnimatingRef.current = false;
  };

  const animateOpponentDraw = async (finalState: GameState, prevHandCount: number) => {
    const dealer = cardListRef.current;
    if (!dealer) return;
    setIsAnimating(true);
    isAnimatingRef.current = true;

    const currentHand = finalState.players?.[1]?.hand || [];
    const newCardsCount = currentHand.length - prevHandCount;
    const newCards = currentHand.slice(0, newCardsCount);

    for (let i = 0; i < newCardsCount; i++) {
      const card = newCards[i];

      dealer.teleportCard(card, "market", { cardIndex: 0 });
      await new Promise(r => setTimeout(r, 40));

      const animationPromises: Promise<void>[] = [];
      // Animate the WHOLE computer hand to show the shift (index 0 insertion)
      currentHand.forEach((c, idx) => {
        animationPromises.push(dealer.dealCard(c, "computer", {
          cardIndex: idx,
          handSize: currentHand.length
        }, false));
      });

      await Promise.all(animationPromises);

      if (i < newCardsCount - 1) {
        await new Promise(r => setTimeout(r, 200)); // Gap between cards
      }
    }



    setIsAnimating(false);
    isAnimatingRef.current = false;
  };

  // Turn Handling
  const handleAction = async (
    logic: (baseState: GameState) => GameState | Promise<GameState>,
    socketAction?: WhotGameAction
  ) => {
    // REMOVED BLOCKING CHECKS: Allow rapid input ("Fire and Forget")
    setIsAnimating(true);
    isAnimatingRef.current = true;

    try {
      // Use the LATEST pending state if we have one, else visual state
      const baseState = pendingLocalStateRef.current || visualGameState!;

      // 1. Calculate new state & Start Animations (Client-Side Immediate)
      const nextVisualStatePromise = logic(baseState);
      const nextVisualState = await nextVisualStatePromise;

      // Update Ref IMMEDIATELY for the next rapid input
      pendingLocalStateRef.current = nextVisualState;

      const logicalBoard = !needsRotation ? nextVisualState : {
        ...nextVisualState,
        players: [nextVisualState.players[1], nextVisualState.players[0]],
        currentPlayer: nextVisualState.currentPlayer === 0 ? 1 : 0
      };

      // 3. EMIT SOCKET IMMEDIATELY
      if (socketAction) {
        const actionWithTick = { ...socketAction, timestamp: socketAction.timestamp || Date.now() };
        LatencyLogger.logEmit();
        socketService.emitMove(currentGame!.id, actionWithTick);
      }

      // 4. AWAIT ANIMATION COMPLETION before updating React state
      // This ensures re-renders don't compete with the animation thread
      await nextVisualStatePromise;

      // 5. UPDATE REACT STATE (Now that animation is done)
      if (currentGame) {
        dispatch(setCurrentGame({
          ...currentGame,
          board: logicalBoard
        }));
      }

      // 6. PERSIST VIA HTTP IN BACKGROUND

      // 4. PERSIST VIA HTTP IN BACKGROUND (Fire & Forget)
      dispatch(updateOnlineGameState({
        gameId: currentGame!.id,
        updates: {
          board: logicalBoard,
          currentTurn: logicalBoard.currentPlayer === 0 ? currentGame!.player1.id : (currentGame!.player2?.id || ''),
          winnerId: nextVisualState.winner?.id || undefined,
          status: nextVisualState.winner ? 'COMPLETED' : 'IN_PROGRESS'
        }
      })).unwrap().catch(err => {
        console.warn("⚠️ Server rejected optimistic update. Triggering rollback/re-sync.", err);

        // 🚨 RECONCILIATION / ROLLBACK
        // 1. Clear the local optimistic chain
        pendingLocalStateRef.current = null;

        // 2. Force a full state fetch from the server
        if (currentGame?.id) {
          dispatch(fetchGameState(currentGame.id));
        }
      });

    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setIsAnimating(false);
      isAnimatingRef.current = false;
    }
  };

  const handleRemoteAction = async (action: WhotGameAction) => {
    LatencyLogger.logReceive(action.timestamp);
    console.log("📥 Remote Action Received:", action.type);

    handleAction(async (currentBaseState) => {
      const dealer = cardListRef.current;
      const oppIndex = 1; // Visually, opponent is always index 1

      switch (action.type) {
        case 'CARD_PLAYED': {
          const card = visualGameState?.allCards?.find(c => c.id === action.cardId);
          if (!card) return currentBaseState;

          // Animate card from opponent hand to pile
          if (dealer) {
            const zIndex = currentBaseState.pile.length + 100;
            await Promise.all([
              dealer.dealCard(card, "pile", { cardIndex: zIndex }, false, action.timestamp),
              dealer.flipCard(card, true)
            ]).catch(console.warn);
          }

          let newState = playCard(currentBaseState, oppIndex, card);

          // Apply suit choice if it's a WHOT card
          if (action.suitChoice && newState.pendingAction?.type === 'call_suit') {
            newState = callSuit(newState, oppIndex, action.suitChoice);
          }

          // Handle Rule 2 General Market (14) cascade locally for consistency
          if (card.number === 14 && newState.pendingAction?.type === 'draw') {
            const { newState: finalState, drawnCard } = executeForcedDraw(newState);
            if (drawnCard && dealer) {
              dealer.teleportCard(drawnCard, "market", { cardIndex: 0 }, action.timestamp);
              await new Promise(r => setTimeout(r, 40));
              await dealer.dealCard(drawnCard, "player", {
                cardIndex: finalState.players[0].hand.length - 1,
                handSize: finalState.players[0].hand.length > 5 ? 5 : finalState.players[0].hand.length
              }, false, action.timestamp);
              await dealer.flipCard(drawnCard, true);
            }
            newState = finalState;
          }

          return newState;
        }

        case 'PICK_CARD': {
          const { newState, drawnCards } = pickCard(currentBaseState, oppIndex);
          if (drawnCards.length > 0 && dealer) {
            const card = drawnCards[0];
            dealer.teleportCard(card, "market", { cardIndex: 0 }, action.timestamp);
            await new Promise(r => setTimeout(r, 40));
            await dealer.dealCard(card, "computer", {
              cardIndex: newState.players[1].hand.length - 1,
              handSize: newState.players[1].hand.length
            }, false, action.timestamp);
          }
          return newState;
        }

        case 'CALL_SUIT': {
          return callSuit(currentBaseState, oppIndex, action.suit);
        }

        case 'FORCED_DRAW': {
          let state = currentBaseState;
          const pending = state.pendingAction;
          if (pending?.type === 'draw' && pending.playerIndex === oppIndex) {
            const total = pending.count;
            for (let i = 0; i < total; i++) {
              const { newState, drawnCard } = executeForcedDraw(state);
              state = newState;
              if (drawnCard && dealer) {
                dealer.teleportCard(drawnCard, "market", { cardIndex: 0 }, action.timestamp);
                await new Promise(r => setTimeout(r, 40));
                await dealer.dealCard(drawnCard, "computer", {
                  cardIndex: state.players[1].hand.length - 1,
                  handSize: state.players[1].hand.length
                }, false, action.timestamp);
              }
            }
          }
          return state;
        }

        default:
          return currentBaseState;
      }
    }, undefined);
  };

  const onCardPress = (card: Card) => {
    if (visualGameState?.currentPlayer !== 0) return;
    LatencyLogger.logTap();

    handleAction(async (currentBaseState) => {
      const dealer = cardListRef.current;

      // 1. Play the card locally
      let newState = playCard(currentBaseState, 0, card);

      // Animate the card going to pile
      if (dealer) {
        const safeZIndex = newState.pile.length + 100;
        await Promise.all([
          dealer.dealCard(card, "pile", { cardIndex: safeZIndex }, false),
          dealer.flipCard(card, true)
        ]).catch(console.warn);
      }

      // ⚡ SPECIAL RULE: CARD 14 (GENERAL MARKET) - AUTO ATTACK
      if (card.number === 14) {
        const { newState: stateAfterDraw, drawnCard } = executeForcedDraw(newState);

        if (drawnCard && dealer) {
          dealer.teleportCard(drawnCard, "market", { cardIndex: 0 });
          await new Promise(r => setTimeout(r, 50));

          const oppHand = stateAfterDraw.players[1].hand;
          await dealer.dealCard(drawnCard, "computer", {
            cardIndex: oppHand.length - 1,
            handSize: oppHand.length
          }, false);
        }
        newState = stateAfterDraw;
      }

      return newState;
    }, { type: 'CARD_PLAYED', cardId: card.id, timestamp: Date.now() });
  };

  const onPickFromMarket = () => {
    if (visualGameState?.currentPlayer !== 0) return;

    // Determine the action type for socket sync
    const isSurrender = visualGameState?.pendingAction?.type === 'draw' && visualGameState?.pendingAction.playerIndex === 0;
    const socketAction: WhotGameAction = isSurrender
      ? { type: 'FORCED_DRAW', timestamp: Date.now() }
      : { type: 'PICK_CARD', timestamp: Date.now() };

    handleAction(async (baseState) => {
      const dealer = cardListRef.current;
      if (!dealer) return baseState;

      let currentState = baseState;
      const pending = currentState.pendingAction;

      // =============================================================
      // 🛡️ DEFENSE SURRENDER: PICK 2 / PICK 3 LOOP
      // =============================================================
      if (pending?.type === 'draw' && pending.playerIndex === 0) {
        const totalToPick = pending.count;
        for (let i = 0; i < totalToPick; i++) {
          const { newState, drawnCard } = executeForcedDraw(currentState);
          currentState = newState;

          if (drawnCard) {
            dealer.teleportCard(drawnCard, "market", { cardIndex: 0 });
            await new Promise(r => setTimeout(r, 40));

            const myHand = currentState.players[0].hand;
            const cardIdx = myHand.findIndex(c => c.id === drawnCard.id);
            await dealer.dealCard(drawnCard, "player", {
              cardIndex: cardIdx >= 0 ? cardIdx : 0,
              handSize: myHand.length > 5 ? 5 : myHand.length
            }, false);
            await dealer.flipCard(drawnCard, true);
            await new Promise(r => setTimeout(r, 200));
          }
          if (!drawnCard) break;
        }
        return currentState;
      }

      // =============================================================
      // 🖐️ STANDARD SINGLE PICK
      // =============================================================
      const { newState, drawnCards } = pickCard(currentState, 0);

      if (drawnCards.length === 0 && newState.pendingAction?.type === 'draw') {
        const forcedState = await onPickFromMarketRecursive(newState, dealer);
        return forcedState;
      }

      if (drawnCards.length > 0) {
        const drawnCard = drawnCards[0];
        dealer.teleportCard(drawnCard, "market", { cardIndex: 0 });
        await new Promise(r => setTimeout(r, 40));

        const myHand = newState.players[0].hand;
        const cardIdx = myHand.findIndex(c => c.id === drawnCard.id);

        await dealer.dealCard(drawnCard, "player", {
          cardIndex: cardIdx,
          handSize: myHand.length > 5 ? 5 : myHand.length
        }, false);
        await dealer.flipCard(drawnCard, true);
      }

      return newState;
    }, socketAction);
  };

  // Helper for the recursive call to avoid hooks issues
  const onPickFromMarketRecursive = async (baseState: GameState, dealer: any): Promise<GameState> => {
    let currentState = baseState;
    const pending = currentState.pendingAction;

    if (pending?.type === 'draw' && pending.playerIndex === 0) {
      const totalToPick = pending.count;
      for (let i = 0; i < totalToPick; i++) {
        const { newState, drawnCard } = executeForcedDraw(currentState);
        currentState = newState;
        if (drawnCard) {
          dealer.teleportCard(drawnCard, "market", { cardIndex: 0 });
          await new Promise(r => setTimeout(r, 40));
          const myHand = currentState.players[0].hand;
          const cardIdx = myHand.findIndex(c => c.id === drawnCard.id);
          await dealer.dealCard(drawnCard, "player", {
            cardIndex: cardIdx >= 0 ? cardIdx : 0,
            handSize: myHand.length > 5 ? 5 : myHand.length
          }, false);
          await dealer.flipCard(drawnCard, true);
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
    return currentState;
  };

  const onSuitSelect = (suit: CardSuit) => {
    handleAction(async (baseState) => {
      const newState = callSuit(baseState, 0, suit);
      return newState;
    }, { type: 'CALL_SUIT', suit, timestamp: Date.now() });
  };

  const onCardListReady = () => {
    setTimeout(() => {
      if (!hasDealt) animateInitialDeal();
    }, 500);
  };


  // Initialize Pending State Ref
  useEffect(() => {
    if (visualGameState) {
      // Only sync if we don't have a pending local chain (or if server is way ahead?)
      // Actually, for simplicity, we let the server win if we are idle, 
      // but during rapid fire we prioritize local.
      // For now, simple sync:
      pendingLocalStateRef.current = visualGameState;
    }
  }, [visualGameState]);

  const animateInitialDeal = async () => {
    if (!visualGameState || !cardListRef.current) return;
    const dealer = cardListRef.current;
    setIsAnimating(true);
    isAnimatingRef.current = true;

    const { players, pile } = visualGameState;
    const h1 = players[0].hand;
    const h2 = players[1].hand;
    for (let i = 0; i < h1.length; i++) {
      if (h2[i]) await dealer.dealCard(h2[i], "computer", { cardIndex: i, handSize: h2.length }, false);
      if (h1[i]) await dealer.dealCard(h1[i], "player", { cardIndex: i, handSize: h1.length }, false);
    }
    if (pile.length > 0) {
      await dealer.dealCard(pile[pile.length - 1], "pile", { cardIndex: 0 }, false);
      await dealer.flipCard(pile[pile.length - 1], true);
    }
    const flips = h1.map(c => dealer.flipCard(c, true));
    await Promise.all(flips);
    await Promise.all(flips);
    setIsAnimating(false);
    isAnimatingRef.current = false;
    setHasDealt(true);
  };

  const handleExit = () => {
    dispatch(clearCurrentGame());
    navigation.navigate('GameHome' as never);
  };

  // --- Rendering ---

  // Add font-ready guard to prevent crash on slow devices
  const areFontsReady = stableFont !== null && stableWhotFont !== null;

  // Error Display UI
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

  // Block rendering until BOTH fonts AND game state AND assets (avatars/audio) are ready
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

  return (
    <WhotCoreUI
      // PASS THE RECONSTRUCTED CARDS HERE (Safety: Lazy load)
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
      showSuitSelector={visualGameState.pendingAction?.type === 'call_suit' && visualGameState.currentPlayer === 0}
      isAnimating={isAnimating}
      cardListRef={cardListRef}
      onCardPress={onCardPress}
      onPickFromMarket={onPickFromMarket}
      onPagingPress={handlePagingPress}
      onSuitSelect={onSuitSelect}
      onCardListReady={onCardListReady}
      showPagingButton={(visualGameState.players?.[0]?.hand?.length || 0) > 5}
      allCards={areCardsReadyToRender ? reconstructedAllCards : []}
      playerHandIdsSV={playerHandIdsSV}
      gameInstanceId={currentGame.id || 'whot-online'} // Use stable string ID
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

// Wrapper component that uses Error Boundary
const WhotOnlineScreen = () => {
  const navigation = useNavigation();

  const handleGoBack = () => {
    navigation.goBack();
  };

  return (
    <WhotErrorBoundary onGoBack={handleGoBack}>
      <WhotOnlineUI />
    </WhotErrorBoundary>
  );
};

export default WhotOnlineScreen;