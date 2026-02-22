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

  // Update shared value for reanimated — use displayedHand, not redux hand
  useEffect(() => {
    playerHandIdsSV.value = displayedHand.map(c => c.id);
  }, [displayedHand]);

  // --- 5b. DRAW DETECTION & ANIMATION ---
  // Compares Redux hand (visualGameState) vs displayedHand.
  // New cards → animate from market → hand, then merge into displayedHand.
  // Removed cards (played) → sync displayedHand immediately.
  useEffect(() => {
    if (!hasDealt || !visualGameState?.players?.[0]?.hand) return;

    const reduxHand: Card[] = visualGameState.players[0].hand;
    const displayedIds = new Set(displayedHand.map(c => c.id));
    const reduxIds = new Set(reduxHand.map(c => c.id));

    // Cards that were removed (played) — sync immediately
    const removedCards = displayedHand.filter(c => !reduxIds.has(c.id));
    if (removedCards.length > 0 && displayedHand.length > 0) {
      setDisplayedHand(prev => prev.filter(c => reduxIds.has(c.id)));
    }

    // Cards that are new (drawn) — animate then merge
    const newCards = reduxHand.filter(c => !displayedIds.has(c.id));
    if (newCards.length > 0 && cardListRef.current) {
      const dealer = cardListRef.current;
      animationQueue.enqueue(async () => {
        setIsAnimating(true);

        for (let i = 0; i < newCards.length; i++) {
          const card = newCards[i];
          // Compute the hand size AFTER this card is merged
          const projectedHandSize = displayedHand.length - removedCards.length + i + 1;
          const handSize = Math.min(projectedHandSize, layoutHandSize);
          const visibleIndex = Math.min(i, layoutHandSize - 1);

          // Animate card from market position to player hand
          await Promise.all([
            dealer.dealCard(card, 'player', { cardIndex: visibleIndex, handSize }, false),
            dealer.flipCard(card, true)
          ]);

          // Merge this card into displayedHand immediately after its animation
          setDisplayedHand(prev => [card, ...prev]);
        }
      });
    }
  }, [visualGameState?.players?.[0]?.hand, hasDealt]);

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

      // Normal card → animate to pile + emit to server
      animationQueue.enqueue(async () => {
        setIsAnimating(true);
        if (dealer) {
          const zIndex = (visualGameState.pile?.length || 0) + 100;
          await Promise.all([
            dealer.dealCard(card, "pile", { cardIndex: zIndex }, false),
            dealer.flipCard(card, true)
          ]);
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

    setIsAnimating(false);
    setHasDealt(true);
  };

  // --- 12. POST-DEAL STATE SNAP ---
  // After the initial deal AND after any deferred state flush, snap all cards
  // to their correct positions. This is NOT a diff-based animation trigger —
  // it only runs when `hasDealt` changes or when the board updates while NOT animating.
  useEffect(() => {
    if (!hasDealt || !cardListRef.current || !visualGameState || animationLock.isAnimating) return;

    const dealer = cardListRef.current;

    requestAnimationFrame(() => {
      // Snap market cards
      visualGameState.market.forEach((c, i) => {
        dealer.teleportCard(c, "market", { cardIndex: i });
      });

      // Snap pile cards
      visualGameState.pile.forEach((c, i) => {
        dealer.teleportCard(c, "pile", { cardIndex: i });
      });

      // Snap opponent hand
      const oppHand = visualGameState.players[1].hand || [];
      oppHand.forEach((c, i) => {
        dealer.teleportCard(c, "computer", { cardIndex: i, handSize: oppHand.length });
      });

      // Snap player hand
      const myHand = visualGameState.players[0].hand || [];
      const visibleHand = myHand.slice(0, layoutHandSize);
      const hiddenHand = myHand.slice(layoutHandSize);

      visibleHand.forEach((c, i) => {
        dealer.teleportCard(c, "player", { cardIndex: i, handSize: layoutHandSize });
        dealer.flipCard(c, true);
      });
      hiddenHand.forEach((c) => {
        dealer.teleportCard(c, "player", { cardIndex: 5, handSize: layoutHandSize, zIndex: 90 });
        dealer.flipCard(c, true);
      });
    });
  }, [visualGameState, hasDealt]);

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
        visualGameState.players[1]
      ]
    };
  }, [visualGameState, displayedHand]);

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