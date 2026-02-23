import React, { useState, useEffect, useRef, useMemo, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Text, useWindowDimensions, Vibration } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import {
  fetchGameState,
} from '../../../../store/thunks/onlineGameThunks';
import { clearCurrentGame, setCurrentGame } from '../../../../store/slices/onlineGameSlice';
import { matchmakingService } from '../../../../services/api/matchmakingService';
import WhotCoreUI from '../core/ui/WhotCoreUI';
import { useWhotFonts } from '../core/ui/useWhotFonts';
import { Card, CardSuit, GameState, WhotGameAction } from '../core/types';
import { useSharedValue } from 'react-native-reanimated';
import { socketService } from '../../../../services/api/socketService';
import { WhotAssetManager } from '../core/ui/WhotAssetManager';
import { logTap, logEmit } from '../core/ui/LatencyLogger';
import { useToast } from '../../../../hooks/useToast';
import { animationLock } from './animationLock';
import { animationQueue } from './animationQueue';

// --- ERROR BOUNDARY --
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

  // --- ANIMATION STATE ---
  // `isAnimating` React state drives UI lock (passed to WhotCoreUI).
  // The actual lock is in `animationLock.isAnimating` (checked synchronously by socket handlers).
  const [isAnimating, setIsAnimating] = useState(false);
  // Incremented every time the animation queue fully drains — used to trigger snap effects
  const [snapTrigger, setSnapTrigger] = useState(0);

  // --- DEFERRED STATE ---
  // When a gameStateUpdate arrives while animating, it's stashed here.
  // Flushed when the animation queue drains.
  const pendingStateRef = useRef<any>(null);

  // --- GAME REFS ---
  const cardListRef = useRef<any>(null);
  const [hasDealt, setHasDealt] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const playerHandIdsSV = useSharedValue<string[]>([]);
  const pendingWhotCardId = useRef<string | null>(null);

  // --- DISPLAYED HAND ---
  // The hand that WhotCoreUI actually renders. New cards are merged into this
  // only AFTER their market→hand animation completes. This prevents teleporting.
  const [displayedHand, setDisplayedHand] = useState<Card[]>([]);
  // Always-fresh ref so async closures inside animation jobs read current displayedHand
  const displayedHandRef = useRef<Card[]>([]);
  // Card IDs currently in-flight (teleported but not yet in displayedHand).
  // Prevents draw detection from re-triggering the same animation on re-fires.
  const pendingDrawIdsRef = useRef<Set<string>>(new Set());

  // --- DISPLAYED OPPONENT HAND ---
  const [displayedOpponentHand, setDisplayedOpponentHand] = useState<Card[]>([]);
  const displayedOpponentHandRef = useRef<Card[]>([]);
  const pendingOpponentDrawIdsRef = useRef<Set<string>>(new Set());

  // --- MEMOIZATION REFS ---
  const prevBoardStringRef = useRef<string | null>(null);
  const stableBoardRef = useRef<GameState | null>(null);
  const stableAllCardsRef = useRef<Card[]>([]);

  const [isSuitSelectorOpen, setIsSuitSelectorOpen] = useState(false);

  // --- TIMER SYNC ---
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);

  // --- LAZY LOAD CARDS ---
  const [areCardsReadyToRender, setCardsReadyToRender] = useState(true);

  // --- LOCAL SCROLL STATE ---
  // Persists the hand order across server updates so scrolling works seamlessly.
  const [localHandOrder, setLocalHandOrder] = useState<string[]>([]);

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

  // --- 2. INIT MATCHMAKING ---
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

  // --- 3. POLLING FALLBACK ---
  useEffect(() => {
    if (currentGame?.id) {
      const interval = setInterval(() => {
        // Skip polling while animations are running
        if (animationLock.isAnimating) return;
        dispatch(fetchGameState(currentGame.id));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [currentGame?.id, dispatch]);

  // --- 4. ASSET PRELOADING ---
  useEffect(() => {
    if (currentGame?.id && userProfile) {
      const opponent = needsRotation ? currentGame.player1 : currentGame.player2;
      const avatarsToPreload = [userProfile.avatar || '', opponent?.avatar || ''].filter(Boolean);
      WhotAssetManager.preload(avatarsToPreload).then(() => setAssetsReady(true));
    }
  }, [currentGame?.id, userProfile?.id]);

  // --- 5. APPLY STATE HELPER ---
  // Always dispatches to Redux immediately. The displayed hand is managed
  // separately via the draw detection effect below.
  const applyStateUpdate = useCallback((board: any, serverTime?: number) => {
    if (!currentGame) return;
    dispatch(setCurrentGame({ ...currentGame, board }));
    if (serverTime) {
      setServerTimeOffset(Date.now() - serverTime);
    }
  }, [currentGame, dispatch]);


  // --- 6. ANIMATION QUEUE DRAIN CALLBACK ---
  // When the queue finishes all jobs, flush any stashed state update.
  useEffect(() => {
    animationQueue.onQueueDrained = () => {
      setIsAnimating(false);
      // Bump snap trigger so pile/market/opponent/player snap effects re-evaluate
      // after animations complete (deps may have changed while queue was running)
      setSnapTrigger(n => n + 1);
      if (pendingStateRef.current) {
        const { board, serverTime } = pendingStateRef.current;
        pendingStateRef.current = null;
        applyStateUpdate(board, serverTime);
      }
    };

    return () => {
      animationQueue.onQueueDrained = null;
      animationQueue.clear();
    };
  }, [applyStateUpdate]);

  // --- 7. SOCKET HANDLERS ---
  useEffect(() => {
    if (currentGame?.id && userProfile?.id) {
      // Register first so backend knows who we are (for targeted broadcasts)
      socketService.register(userProfile.id);
      socketService.joinGame(currentGame.id);

      // ─── OPPONENT MOVE → ENQUEUE ANIMATION ───
      const unsubOpponentMove = socketService.onOpponentMove((action: any) => {
        console.log("📡 [WhotOnline] Received onOpponentMove event:", action.type);
        if (action && action.type) {
          animationQueue.enqueue(async () => {
            setIsAnimating(true);
            await animateRemoteAction(action as WhotGameAction);
          });
        }
      });

      // ─── GAME STATE UPDATE → DEFER IF ANIMATING ───
      const unsubStateUpdate = socketService.onGameStateUpdate((board: any, serverTime?: number) => {
        console.log("📡 [WhotOnline] Received gameStateUpdate, locked:", animationLock.isAnimating);
        if (!board) return;

        if (animationLock.isAnimating) {
          // Stash — will be flushed when the animation queue drains
          pendingStateRef.current = { board, serverTime };
        } else {
          applyStateUpdate(board, serverTime);
        }
      });

      return () => {
        unsubOpponentMove();
        unsubStateUpdate();
        socketService.leaveGame(currentGame.id);
      };
    }
  }, [currentGame?.id]);

  // --- MATCHMAKING HELPERS ---
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
        if (!card?.id || seenIds.has(card.id)) return false;
        seenIds.add(card.id);
        return true;
      });
      console.log('🃏 [WhotOnline] Initialized stableAllCardsRef with', stableAllCardsRef.current.length, 'cards.');
    }

    const startCards = stableAllCardsRef.current;

    return { visualGameState: { ...safeState, allCards: startCards }, reconstructedAllCards: startCards };

  }, [currentGame?.board, userProfile?.id, localHandOrder]);

  // Keep ref in sync with state so async closures always read fresh displayedHand
  useEffect(() => {
    displayedHandRef.current = displayedHand;
    playerHandIdsSV.value = displayedHand.map(c => c.id);
  }, [displayedHand]);

  useEffect(() => {
    displayedOpponentHandRef.current = displayedOpponentHand;
  }, [displayedOpponentHand]);

  // --- 5b. DRAW DETECTION & ANIMATION ---
  // Mirrors computer mode pattern: teleport drawn cards to market, then animate
  // cards into the hand one-by-one sequentially.
  useEffect(() => {
    if (!hasDealt || !visualGameState?.players?.[0]?.hand) return;

    const reduxHand: Card[] = visualGameState.players[0].hand;
    // Read fresh displayedHand from ref — not from stale effect closure
    const currentDisplayedHand = displayedHandRef.current;
    const displayedIds = new Set(currentDisplayedHand.map(c => c.id));
    const reduxIds = new Set(reduxHand.map(c => c.id));

    // Cards that were removed (played) — sync immediately
    const removedCards = currentDisplayedHand.filter(c => !reduxIds.has(c.id));
    if (removedCards.length > 0) {
      setDisplayedHand(prev => prev.filter(c => reduxIds.has(c.id)));
    }

    // Cards that are TRULY new: not displayed AND not already in-flight
    const newCards = reduxHand.filter(
      c => !displayedIds.has(c.id) && !pendingDrawIdsRef.current.has(c.id)
    );
    if (newCards.length > 0 && cardListRef.current) {
      const dealer = cardListRef.current;

      // IMMEDIATELY mark these cards as in-flight so re-fires of this effect
      // (caused by localHandOrder -> visualGameState chain) find no new cards.
      newCards.forEach(c => pendingDrawIdsRef.current.add(c.id));

      // Snapshot surviving displayed cards now — safe to capture in closure
      const survivingDisplayed = currentDisplayedHand.filter(c => reduxIds.has(c.id));

      animationQueue.enqueue(async () => {
        setIsAnimating(true);

        // ── SEQUENTIAL CARD-BY-CARD ANIMATION ──
        // Teleport ALL new cards to market first (hidden start position)
        newCards.forEach(card => {
          dealer.teleportCard(card, 'market', { cardIndex: 0 });
          dealer.flipInstant(card, false);
        });

        // Let UI thread register all teleports before animating
        await new Promise(r => setTimeout(r, 40));

        // Grow the hand one card at a time
        let currentHand = [...survivingDisplayed];

        for (let i = 0; i < newCards.length; i++) {
          const drawnCard = newCards[i];

          // Prepend this card to the front
          currentHand = [drawnCard, ...currentHand];
          const handSnapshot = [...currentHand];

          // Update displayedHand (adds card to render tree)
          // Do NOT update localHandOrder here — that would re-trigger visualGameState
          // recomputation and cause this effect to fire again mid-loop.
          setDisplayedHand(handSnapshot);

          // Small pause for React to commit the state
          await new Promise(r => setTimeout(r, 20));

          // Animate all visible hand cards to their new positions
          const visibleHand = handSnapshot.slice(0, layoutHandSize);
          const animationPromises: Promise<void>[] = [];

          visibleHand.forEach((card, index) => {
            animationPromises.push(
              dealer.dealCard(card, 'player', { cardIndex: index, handSize: layoutHandSize }, false)
            );
            if (card.id === drawnCard.id) {
              animationPromises.push(dealer.flipCard(card, true));
            }
          });

          // Push any card bumped out of visible range offscreen
          handSnapshot.slice(layoutHandSize).forEach((card, index) => {
            animationPromises.push(
              dealer.dealCard(card, 'player', {
                cardIndex: layoutHandSize + index,
                handSize: layoutHandSize,
                zIndex: 90
              }, false)
            );
          });

          await Promise.all(animationPromises);

          // Pause between cards (matches computer mode feel)
          if (i < newCards.length - 1) {
            await new Promise(r => setTimeout(r, 200));
          }
        }

        // Update localHandOrder ONCE at the end — safe now that the loop is done
        const finalHand = [...currentHand];
        setLocalHandOrder(finalHand.map(c => c.id));

        // Clear in-flight tracking — these cards are now in displayedHand
        newCards.forEach(c => pendingDrawIdsRef.current.delete(c.id));
      });
    }
  }, [visualGameState?.players?.[0]?.hand, hasDealt]);

  // --- 5c. OPPONENT DRAW DETECTION & ANIMATION ---
  useEffect(() => {
    if (!hasDealt || !visualGameState?.players?.[1]?.hand) return;

    const reduxOppHand: Card[] = visualGameState.players[1].hand;
    const currentDisplayedOppHand = displayedOpponentHandRef.current;
    const displayedIds = new Set(currentDisplayedOppHand.map(c => c.id));
    const reduxIds = new Set(reduxOppHand.map(c => c.id));

    // Cards that were removed (played) — sync immediately
    const removedCards = currentDisplayedOppHand.filter(c => !reduxIds.has(c.id));
    if (removedCards.length > 0) {
      setDisplayedOpponentHand(prev => prev.filter(c => reduxIds.has(c.id)));
    }

    // Cards that are TRULY new: not displayed AND not already in-flight
    const newCards = reduxOppHand.filter(
      c => !displayedIds.has(c.id) && !pendingOpponentDrawIdsRef.current.has(c.id)
    );

    if (newCards.length > 0 && cardListRef.current) {
      const dealer = cardListRef.current;

      newCards.forEach(c => pendingOpponentDrawIdsRef.current.add(c.id));
      const survivingDisplayed = currentDisplayedOppHand.filter(c => reduxIds.has(c.id));

      animationQueue.enqueue(async () => {
        setIsAnimating(true);

        // Teleport ALL new cards to market first (hidden start position)
        newCards.forEach(card => {
          dealer.teleportCard(card, 'market', { cardIndex: 0 });
          dealer.flipInstant(card, false);
        });

        await new Promise(r => setTimeout(r, 40));

        let currentHand = [...survivingDisplayed];

        for (let i = 0; i < newCards.length; i++) {
          const drawnCard = newCards[i];

          // Opponent cards just append to their hand visually
          currentHand = [...currentHand, drawnCard];
          const handSnapshot = [...currentHand];

          setDisplayedOpponentHand(handSnapshot);

          await new Promise(r => setTimeout(r, 20));

          // Animate all visible opponent hand cards to their new positions
          const animationPromises: Promise<void>[] = [];
          handSnapshot.forEach((card, index) => {
            animationPromises.push(
              dealer.dealCard(card, 'computer', { cardIndex: index, handSize: handSnapshot.length }, false)
            );
          });

          await Promise.all(animationPromises);

          if (i < newCards.length - 1) {
            await new Promise(r => setTimeout(r, 200));
          }
        }

        // Clear in-flight tracking
        newCards.forEach(c => pendingOpponentDrawIdsRef.current.delete(c.id));
      });
    }
  }, [visualGameState?.players?.[1]?.hand, hasDealt]);

  // --- 9. ANIMATE REMOTE ACTION (Pure Visual, No State Mutation) ---
  const animateRemoteAction = async (action: WhotGameAction): Promise<void> => {
    const dealer = cardListRef.current;
    if (!dealer || !visualGameState) return;

    switch (action.type) {
      case 'CARD_PLAYED': {
        // Prefer the full card from the server event (public info once played)
        const card = (action as any).card
          || visualGameState?.allCards?.find(c => c.id === action.cardId);
        if (!card) return;

        console.log(`🎴 [Remote CARD_PLAYED] card: ${card.id} suit:${card.suit} num:${card.number}`);

        const zIndex = (visualGameState.pile?.length || 0) + 100;
        await Promise.all([
          dealer.dealCard(card, "pile", { cardIndex: zIndex }, false, action.timestamp),
          dealer.flipCard(card, true)
        ]);
        return;
      }

      case 'PICK_CARD': {
        // Opponent drew a card — brief delay, state update will reconcile positions
        await new Promise(r => setTimeout(r, 150));
        return;
      }

      case 'CALL_SUIT': {
        // Visual only — the state update will set calledSuit
        return;
      }

      case 'FORCED_DRAW': {
        // Opponent is drawing penalty cards — brief delay for visual pacing
        await new Promise(r => setTimeout(r, 150));
        return;
      }

      default:
        return;
    }
  };

  // --- 10. LOCAL ACTION HANDLERS (Animation + Emit, Zero State Mutation) ---

  const latestOnCardPress = useRef<(card: Card) => void>(() => { });

  useEffect(() => {
    latestOnCardPress.current = (card: Card) => {
      if (!visualGameState) return;

      if (visualGameState.currentPlayer !== 0) {
        toast({ title: 'Not your turn', type: "error" });
        return;
      }
      logTap();

      const dealer = cardListRef.current;

      // Whot card (number 20) → open suit selector, delay emit until suit is chosen
      if (card.number === 20) {
        pendingWhotCardId.current = card.id;
        setIsSuitSelectorOpen(true);

        // Animate the card to pile immediately (visual only)
        if (dealer) {
          animationQueue.enqueue(async () => {
            setIsAnimating(true);
            const zIndex = (visualGameState.pile?.length || 0) + 100;
            await Promise.all([
              dealer.dealCard(card, "pile", { cardIndex: zIndex }, false),
              dealer.flipCard(card, true)
            ]);
          });
        }
        return;
      }

      // Normal card → animate to pile, then shift remaining hand cards into correct positions
      animationQueue.enqueue(async () => {
        setIsAnimating(true);
        if (dealer) {
          const zIndex = (visualGameState.pile?.length || 0) + 100;
          // Animate the played card to the pile
          await Promise.all([
            dealer.dealCard(card, "pile", { cardIndex: zIndex }, false),
            dealer.flipCard(card, true)
          ]);

          // Re-position the remaining visible hand cards so they close the gap.
          // Use displayedHandRef for fresh state — the played card is still in it
          // but will be removed by the draw-detection effect after server confirms.
          // We optimistically position only the cards EXCLUDING the played one.
          const handWithoutPlayed = displayedHandRef.current.filter(c => c.id !== card.id);
          const visibleRemaining = handWithoutPlayed.slice(0, layoutHandSize);
          const shiftPromises = visibleRemaining.map((handCard, index) =>
            dealer.dealCard(handCard, 'player', { cardIndex: index, handSize: layoutHandSize }, false)
          );
          await Promise.all(shiftPromises);
        }
      });

      // Emit move to server (does NOT wait for animation)
      logEmit();
      socketService.emitMove(currentGame!.id, {
        type: 'PLAY_CARD',
        cardId: card.id,
        timestamp: Date.now()
      });
    };
  });

  const onCardPress = useCallback((card: Card) => {
    latestOnCardPress.current(card);
  }, []);

  const onPickFromMarket = () => {
    if (!visualGameState || visualGameState.currentPlayer !== 0 || !currentGame?.id) return;

    // Emit DRAW to server immediately — animation will be triggered by
    // applyStateUpdate when it detects new cards in the hand
    logEmit();
    socketService.emitMove(currentGame.id, {
      type: 'DRAW',
      timestamp: Date.now()
    });
  };

  const onSuitSelect = (suit: CardSuit) => {
    setIsSuitSelectorOpen(false);
    const cardId = pendingWhotCardId.current;

    if (cardId && currentGame?.id) {
      // Emit the PLAY_CARD + calledSuit to server
      logEmit();
      socketService.emitMove(currentGame.id, {
        type: 'PLAY_CARD',
        cardId,
        calledSuit: suit,
        timestamp: Date.now()
      });
    }

    pendingWhotCardId.current = null;
  };

  const handlePagingPress = async () => {
    const dealer = cardListRef.current;
    if (!dealer || animationLock.isAnimating || !visualGameState) return;

    const myHand = visualGameState.players[0].hand;
    if (myHand.length <= playerHandLimit) return;

    const lastCard = myHand[myHand.length - 1];
    const rotatedHand = [lastCard, ...myHand.slice(0, -1)];

    setIsAnimating(true);

    // Update local paging order (does NOT mutate game state)
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
    setIsAnimating(false);
  };

  // --- 11. INITIAL DEAL ANIMATION ---
  const onCardListReady = () => {
    setTimeout(() => { if (!hasDealt) animateInitialDeal(); }, 500);
  };

  const animateInitialDeal = async () => {
    if (!visualGameState || !cardListRef.current) return;
    const dealer = cardListRef.current;
    setIsAnimating(true);
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

    // Seed displayedHand with the initial hand
    setDisplayedHand([...h1]);
    setDisplayedOpponentHand([...h2]);

    setIsAnimating(false);
    setHasDealt(true);
  };

  // --- 12a. PILE & MARKET SNAP ---
  // Snaps pile and market cards whenever state updates and no animation is running.
  // Player and opponent hands are NOT snapped here — they are managed by explicit
  // dealCard / teleportCard calls in the animation jobs above.
  useEffect(() => {
    if (!hasDealt || !cardListRef.current || !visualGameState) return;
    if (animationLock.isAnimating || animationQueue.isRunning) return;

    const dealer = cardListRef.current;
    visualGameState.market.forEach((c, i) => {
      dealer.teleportCard(c, 'market', { cardIndex: i });
      dealer.flipInstant(c, false);
    });
    visualGameState.pile.forEach((c, i) => {
      dealer.teleportCard(c, 'pile', { cardIndex: i });
      dealer.flipInstant(c, true);
    });
  }, [visualGameState?.pile?.length, visualGameState?.market?.length, hasDealt]);

  // --- 12b. OPPONENT HAND SNAP ---
  // Snaps opponent cards whenever their hand size changes (opponent drew or played).
  // Uses the ACTUAL server hand length as handSize so all cards are spread correctly.
  // Only runs when animation queue is idle to avoid fighting active animations.
  useEffect(() => {
    if (!hasDealt || !cardListRef.current || !visualGameState) return;
    if (animationLock.isAnimating || animationQueue.isRunning) return;

    const dealer = cardListRef.current;

    // Check missing displayed opponent cards that might have been skipped
    const reduxOppHand = visualGameState.players[1]?.hand || [];
    const oppHandIds = new Set(reduxOppHand.map(c => c.id));
    const dispHandIds = new Set(displayedOpponentHand.map(c => c.id));

    // If the sizes don't match exactly and no animation running, force resync visually
    // This acts as a fallback if the animation effect missed a state update due to queue locks.
    if (oppHandIds.size !== dispHandIds.size) {
      setDisplayedOpponentHand([...reduxOppHand]);
    }

    const currentOppHand = displayedOpponentHandRef.current;

    // Only snap cards that STILL belong to the opponent's hand.
    // This prevents snapping a just-played card back to the hand before React state updates.
    const validOppCards = currentOppHand.filter(c => oppHandIds.has(c.id));

    validOppCards.forEach((c, i) => {
      dealer.teleportCard(c, 'computer', { cardIndex: i, handSize: validOppCards.length });
    });
  }, [visualGameState?.players?.[1]?.hand?.length, hasDealt, displayedOpponentHand.length]);


  const handleExit = () => {
    dispatch(clearCurrentGame());
    navigation.navigate('GameHome' as never);
  };

  // Build the visual game state for WhotCoreUI — override player hand with displayedHand
  // MUST be above early returns so hooks always run in the same order.
  const coreUIGameState = useMemo(() => {
    if (!visualGameState) return null;
    return {
      ...visualGameState,
      players: [
        { ...visualGameState.players[0], hand: displayedHand },
        { ...visualGameState.players[1], hand: displayedOpponentHand }
      ]
    };
  }, [visualGameState, displayedHand, displayedOpponentHand]);

  // --- RENDER ---
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

  if (isMatchmaking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.matchmakingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.matchmakingTitle}>{matchmakingMessage}</Text>
          <TouchableOpacity style={styles.cancelButton} onPress={() => {
            matchmakingService.cancelMatchmaking().catch(console.error);
            if (matchmakingIntervalRef.current) clearInterval(matchmakingIntervalRef.current);
            setIsMatchmaking(false);
            navigation.goBack();
          }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }



  const opponent = isPlayer2 ? currentGame.player1 : currentGame.player2;
  return (
    <WhotCoreUI
      game={{
        gameState: coreUIGameState!,
        allCards: areCardsReadyToRender ? reconstructedAllCards : []
      }}
      playerState={{
        name: userProfile?.name || 'You',
        rating: userProfile?.rating || 1200,
        handLength: displayedHand.length,
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
      showPagingButton={displayedHand.length > playerHandLimit}
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