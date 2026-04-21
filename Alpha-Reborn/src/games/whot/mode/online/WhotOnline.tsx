import React, { useState, useEffect, useRef, useMemo, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Text, useWindowDimensions, Vibration } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import {
  fetchGameState,
} from '../../../../store/thunks/onlineGameThunks';
import { clearCurrentGame, setCurrentGame } from '../../../../store/slices/onlineGameSlice';
import { setHistory, addMessage, clearChat } from '../../../../store/slices/chatSlice';
import { matchmakingService } from '../../../../services/api/matchmakingService';
import WhotCoreUI from '../core/ui/WhotCoreUI';
import { MatchActionButtons } from '../../../../components/chat/MatchActionButtons';
import { MatchChatOverlay } from '../../../../components/chat/MatchChatOverlay';
import { useWhotFonts } from '../core/ui/useWhotFonts';
import { Card, CardSuit, GameState, WhotGameAction } from '../core/types';
import { useSharedValue } from 'react-native-reanimated';
import { socketService } from '../../../../services/api/socketService';
import { WhotAssetManager } from '../core/ui/WhotAssetManager';
import { logTap, logEmit } from '../core/ui/LatencyLogger';
import { useToast } from '../../../../hooks/useToast';
import { animationLock } from './animationLock';
import { animationQueue } from './animationQueue';
import { useWhotSoundEffects } from '../core/useWhotSoundEffects';

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

  // --- SOUND EFFECTS ---
  // Hook call is here (before any early returns) so it always runs.
  // The actual `visualGameState` is computed below via useMemo; we pass a
  // derived version that watches the raw board from Redux.
  const rawBoardState = useMemo(() => {
    if (!currentGame?.board) return null;
    try {
      const board = typeof currentGame.board === 'string' ? JSON.parse(currentGame.board) : currentGame.board;
      return board as GameState;
    } catch { return null; }
  }, [currentGame?.board]);
  useWhotSoundEffects(rawBoardState);

  // --- WHOT-SPECIFIC RATING RESOLUTION ---
  const { gameStats: reduxGameStats } = useAppSelector((state) => state.gameStats);
  const gameStatsArray = Object.values(reduxGameStats);

  const getPlayerGameRating = (profile: any) => {
    if (!profile) return 1000;

    // 1. Try Redux Slice (if this is the logged-in user)
    const existingStat = profile.id === userProfile?.id
      ? gameStatsArray.find(stat => stat.gameId === 'whot')
      : undefined;

    if (existingStat) return existingStat.rating;

    // 2. If missing, try Profile Embedded Stats
    const profileEmbeddedStats = profile?.gameStats || [];
    const embeddedStat = profileEmbeddedStats.find((s: any) => s.gameId === 'whot');

    if (embeddedStat) return embeddedStat.rating;

    // 3. Absolute Fallback
    return profile?.rating ?? 1000;
  };

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
  // Guard: track if game-over has been processed to stop polling/socket updates
  const gameOverProcessedRef = useRef(false);

  // --- ANIMATION STATE ---
  // `isAnimating` React state drives UI lock (passed to WhotCoreUI).
  // Incremented every time the animation queue fully drains — used to trigger snap effects
  const [snapTrigger, setSnapTrigger] = useState(0);

  // --- DEFERRED STATE ---
  // When a gameStateUpdate arrives while animating, it's stashed here.
  // Flushed when the animation queue drains.
  const pendingStateRef = useRef<any>(null);

  // --- GAME REFS ---
  const lastVersion = useRef<number>(0);
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

  // --- EVENT DEDUP ---
  // Prevents duplicate animations and state overwrites out of order
  const processedEventsRef = useRef<Set<string>>(new Set());
  
  // --- OPTIMISTIC PLAYS ---
  // Tracks cards that were played but haven't been removed from visualGameState yet.
  // Prevents draw detection from falsely interpreting them as newly drawn cards.
  const pendingLocalPlaysRef = useRef<Set<string>>(new Set());
  const pendingOpponentPlaysRef = useRef<Set<string>>(new Set());

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

  // --- Intercept back button during active game ---
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      // If game is not in progress (COMPLETED, null, etc.), clear state and allow leaving
      if (!currentGame || currentGame.status !== 'IN_PROGRESS') {
        dispatch(clearCurrentGame());
        dispatch(clearChat());
        return;
      }

      // Prevent default back action
      e.preventDefault();

      // Show forfeit confirmation
      Alert.alert(
        'Forfeit Match',
        'If you forfeit, you will lose. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes',
            style: 'destructive',
            onPress: () => {
              socketService.emitForfeit(currentGame.id);
            }
          }
        ]
      );
    });

    return unsubscribe;
  }, [navigation, currentGame]);

  // --- Mark game as completed to stop polling/socket updates ---
  useEffect(() => {
    if (currentGame?.status === 'COMPLETED' && !gameOverProcessedRef.current) {
      gameOverProcessedRef.current = true;
    }
  }, [currentGame?.status]);

  // --- 3. POLLING FALLBACK ---
  useEffect(() => {
    if (currentGame?.id) {
      const interval = setInterval(() => {
        // Skip polling while animations are running or game is completed
        if (animationLock.isAnimating || gameOverProcessedRef.current) return;
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
  // Bug 6 fix: Use a ref so the callback always reads the freshest currentGame,
  // even when called from the animation queue drain callback long after it was created.
  const currentGameRef = useRef(currentGame);
  useEffect(() => { currentGameRef.current = currentGame; }, [currentGame]);

  const applyStateUpdate = useCallback((board: any, serverTime?: number) => {
    const game = currentGameRef.current;
    if (!game) return;
    dispatch(setCurrentGame({ ...game, board }));
    if (serverTime) {
      setServerTimeOffset(Date.now() - serverTime);
    }
  }, [dispatch]);


  // --- 6. ANIMATION QUEUE DRAIN CALLBACK ---
  // When the queue finishes all jobs, flush any stashed state update.
  useEffect(() => {
    animationQueue.onQueueDrained = () => {
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
      // 8. Lifecycle Cleanups
      processedEventsRef.current.clear();
      lastVersion.current = 0;
      // Register first so backend knows who we are (for targeted broadcasts)
      socketService.register(userProfile.id);
      socketService.joinGame(currentGame.id);

      // Join Match Chat
      socketService.joinMatchChat(currentGame.id);

      // --- CHAT HANDLERS ---
      const unsubChatStatus = socketService.onChatStatus((data) => {
        console.log("📡 [WhotOnline/Chat] Status:", data);
      });

      const unsubChatHistory = socketService.onChatHistory((data) => {
        if (data.matchId === currentGame.id) {
          dispatch(setHistory(data.messages || []));
        }
      });

      const unsubMatchMessage = socketService.onReceiveMatchMessage((payload) => {
        dispatch(addMessage({
          message: payload,
          currentUserId: userProfile.id
        }));
      });

      // ─── OPPONENT MOVE → DEDUP + ENQUEUE ANIMATION ───
      const unsubOpponentMove = socketService.onOpponentMove((action: any) => {
        // Filter out self-moves: backend broadcasts to the whole room and marks
        // the sender via excludePlayerId — skip if it's us.
        if (action?.excludePlayerId === userProfile?.id) return;

        console.log("📡 [WhotOnline] Received onOpponentMove event:", action.type);
        if (action && action.type && action.eventId) {
          // Dedup: build a unique key from the action
          const dedupKey = `OPPONENT_MOVE:${action.eventId}`;

          if (processedEventsRef.current.has(dedupKey)) {
            console.log(`⚠️ [WhotOnline] Duplicate opponent-move skipped: ${dedupKey}`);
            return;
          }
          processedEventsRef.current.add(dedupKey);

          // Cap set size to prevent unbounded growth in long matches
          if (processedEventsRef.current.size > 200) {
            const first = processedEventsRef.current.values().next().value;
            if (first !== undefined) processedEventsRef.current.delete(first);
          }

          animationQueue.enqueue(async () => {
            await animateRemoteAction(action as WhotGameAction);
          });
        }
      });

      // ─── GAME STATE UPDATE → SINGLE AUTHORITY ───
      const unsubStateUpdate = socketService.onGameStateUpdate((board: any, serverTime?: number) => {
        // Ignore updates once game is completed
        if (gameOverProcessedRef.current) return;
        if (!board) return;

        if (board.eventId) {
          const dedupKey = `GAME_STATE_UPDATE:${board.eventId}`;
          if (processedEventsRef.current.has(dedupKey)) return;
          processedEventsRef.current.add(dedupKey);
        }

        // Stale state protection
        if (board.stateVersion <= lastVersion.current) {
           console.log(`⚠️ [WhotOnline] Stale state skipped. Current: ${lastVersion.current}, Received: ${board.stateVersion}`);
           return;
        }
        
        console.log("📡 [WhotOnline] Received valid gameStateUpdate v" + board.stateVersion);
        lastVersion.current = board.stateVersion;

        // Apply immediately. Redux handles the rendering separation correctly.
        applyStateUpdate(board, serverTime);
      });

      // ─── MOVE REJECTED (Validation Error) ───
      const unsubMoveRejected = socketService.onMoveRejected(({ playerId, reason }) => {
        if (gameOverProcessedRef.current) return;
        if (userProfile?.id === playerId) {
          toast({ title: 'Invalid Move', message: reason || 'Not allowed right now.', type: "error" });
          // Force a state refresh so optimistic cards return safely
          if (stableBoardRef.current) {
            applyStateUpdate(stableBoardRef.current, Date.now());
          }
        }
      });

      // ─── GAME ENDED (forfeit, normal win) ───
      const unsubGameEnded = socketService.onGameEnded((data: any) => {
        console.log("📡 [WhotOnline] Game Ended Event:", data);
        if (data?.winnerId && currentGame) {
          // Immediately block polling/socket updates
          gameOverProcessedRef.current = true;
          dispatch(setCurrentGame({
            ...currentGame,
            status: 'COMPLETED',
            winnerId: data.winnerId
          }));
        }
      });

      return () => {
        unsubOpponentMove();
        unsubStateUpdate();
        unsubMoveRejected();
        unsubGameEnded();

        unsubChatStatus();
        unsubChatHistory();
        unsubMatchMessage();

        socketService.leaveMatchChat(currentGame.id);
        socketService.leaveGame(currentGame.id);
        dispatch(clearChat());
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

  // Fix 1: Ref for animation closures — always reads the latest visualGameState
  const visualGameStateRef = useRef(visualGameState);
  useEffect(() => { visualGameStateRef.current = visualGameState; }, [visualGameState]);

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
    // Draw detection enqueues into animationQueue (which serializes safely),
    // so we do NOT gate on animationLock — that would prevent the animation
    // from ever being enqueued when an opponent-move event holds the lock.
    if (!hasDealt || !visualGameState?.players?.[0]?.hand) return;

    const reduxHand: Card[] = visualGameState.players[0].hand;
    // Read fresh displayedHand from ref — not from stale effect closure
    const currentDisplayedHand = displayedHandRef.current;
    const displayedIds = new Set(currentDisplayedHand.map(c => c.id));
    const reduxIds = new Set(reduxHand.map(c => c.id));

    // Cleanup local pending plays: if the server confirmed it is gone, remove it
    pendingLocalPlaysRef.current.forEach(playedId => {
      if (!reduxIds.has(playedId)) {
        pendingLocalPlaysRef.current.delete(playedId);
      }
    });

    // Cards that were removed (played) — sync immediately
    const removedCards = currentDisplayedHand.filter(c => !reduxIds.has(c.id));
    if (removedCards.length > 0) {
      setDisplayedHand(prev => prev.filter(c => reduxIds.has(c.id)));
    }

    // Cards that are TRULY new: not displayed AND not already in-flight AND not locally played
    const newCards = reduxHand.filter(
      c => !displayedIds.has(c.id) && !pendingDrawIdsRef.current.has(c.id) && !pendingLocalPlaysRef.current.has(c.id)
    );
    if (newCards.length > 0 && cardListRef.current) {
      const dealer = cardListRef.current;

      // IMMEDIATELY mark these cards as in-flight so re-fires of this effect
      // (caused by localHandOrder -> visualGameState chain) find no new cards.
      newCards.forEach(c => pendingDrawIdsRef.current.add(c.id));

      // Snapshot surviving displayed cards now — safe to capture in closure
      const survivingDisplayed = currentDisplayedHand.filter(c => reduxIds.has(c.id));

      animationQueue.enqueue(async () => {
        // ── SEQUENTIAL CARD-BY-CARD ANIMATION ──
        // (Ensure cards are properly grounded at the market before flight)
        newCards.forEach(card => {
          dealer.teleportCard(card, 'market', { cardIndex: 0 });
          dealer.flipInstant(card, false);
        });

        // Let Reanimated register the teleports
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
          });

          // ✅ FIX: Ensure the newly drawn (or returning rejected) card ALWAYS flips face up,
          // even if it exceeds the visible hand layout threshold and gets pushed off-screen.
          animationPromises.push(dealer.flipCard(drawnCard, true));

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
    // Same as player draw: no animationLock gate — enqueuing is safe.
    if (!hasDealt || !visualGameState?.players?.[1]?.hand) return;

    const reduxOppHand: Card[] = visualGameState.players[1].hand;
    const currentDisplayedOppHand = displayedOpponentHandRef.current;
    const displayedIds = new Set(currentDisplayedOppHand.map(c => c.id));
    const reduxIds = new Set(reduxOppHand.map(c => c.id));

    // Cleanup remote pending plays: if the server confirmed it is gone, remove it
    pendingOpponentPlaysRef.current.forEach(playedId => {
      if (!reduxIds.has(playedId)) {
        pendingOpponentPlaysRef.current.delete(playedId);
      }
    });

    // Cards that were removed (played) — sync immediately
    const removedCards = currentDisplayedOppHand.filter(c => !reduxIds.has(c.id));
    if (removedCards.length > 0) {
      setDisplayedOpponentHand(prev => prev.filter(c => reduxIds.has(c.id)));
    }

    // Cards that are TRULY new: not displayed AND not already in-flight AND not played
    const newCards = reduxOppHand.filter(
      c => !displayedIds.has(c.id) && !pendingOpponentDrawIdsRef.current.has(c.id) && !pendingOpponentPlaysRef.current.has(c.id)
    );

    if (newCards.length > 0 && cardListRef.current) {
      const dealer = cardListRef.current;

      newCards.forEach(c => pendingOpponentDrawIdsRef.current.add(c.id));
      const survivingDisplayed = currentDisplayedOppHand.filter(c => reduxIds.has(c.id));

      animationQueue.enqueue(async () => {
        // Opponent draws: naturally animate from market to opponent hand.
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
    // Fix 1: Use ref so animation closures always read the latest state
    const currentVisualState = visualGameStateRef.current;
    if (!dealer || !currentVisualState) return;

    switch (action.type) {
      case 'CARD_PLAYED': {
        // Prefer the full card from the server event (public info once played)
        const card = (action as any).card
          || currentVisualState?.allCards?.find(c => c.id === action.cardId);
        if (!card) return;

        // Tag this card as a remote play so draw detection completely ignores it
        pendingOpponentPlaysRef.current.add(card.id);

        console.log(`🎴 [Remote CARD_PLAYED] card: ${card.id} suit:${card.suit} num:${card.number}`);

        const zIndex = (currentVisualState.pile?.length || 0) + 100;
        await Promise.all([
          dealer.dealCard(card, "pile", { cardIndex: zIndex }, false, action.timestamp),
          dealer.flipCard(card, true)
        ]);
        return;
      }

      case 'PICK_CARD': {
        // No-op: the actual market→hand animation is handled by the
        // opponent draw detection effect (5c) when state update arrives.
        return;
      }

      case 'CALL_SUIT': {
        // Visual only — the state update will set calledSuit
        return;
      }

      case 'FORCED_DRAW': {
        // No-op: draw detection effect handles the visual animation.
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
      // Bypass suit selector if it's the player's last card, as they've already won.
      if (card.number === 20 && visualGameState.players[0].hand.length > 1) {
        pendingWhotCardId.current = card.id;
        setIsSuitSelectorOpen(true);

        // Animate the card to pile immediately (visual only)
        if (dealer) {
          animationQueue.enqueue(async () => {
            pendingLocalPlaysRef.current.add(card.id);
            setDisplayedHand(prev => prev.filter(c => c.id !== card.id));
            setLocalHandOrder(prev => prev.filter(id => id !== card.id));
            
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
        // Tag this card as a local play so draw detection completely ignores it
        pendingLocalPlaysRef.current.add(card.id);

        // Optimistic removal: immediately remove the played card from displayedHand
        // so it never flashes back into the hand when server state arrives.
        setDisplayedHand(prev => prev.filter(c => c.id !== card.id));
        setLocalHandOrder(prev => prev.filter(id => id !== card.id));

        if (dealer) {
          const zIndex = (visualGameState.pile?.length || 0) + 100;
          // Animate the played card to the pile
          await Promise.all([
            dealer.dealCard(card, "pile", { cardIndex: zIndex }, false),
            dealer.flipCard(card, true)
          ]);

          // Re-position the remaining visible hand cards so they close the gap.
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

  const latestPickFromMarket = useRef<() => void>(() => {});
  useEffect(() => {
    latestPickFromMarket.current = () => {
      if (!visualGameState || visualGameState.currentPlayer !== 0 || !currentGame?.id) return;

      logEmit();
      socketService.emitMove(currentGame.id, {
        type: 'DRAW',
        timestamp: Date.now()
      });
    };
  });

  const onPickFromMarket = useCallback(() => {
    latestPickFromMarket.current();
  }, []);

  const latestSuitSelect = useRef<(suit: CardSuit) => void>(() => {});
  useEffect(() => {
    latestSuitSelect.current = (suit: CardSuit) => {
      setIsSuitSelectorOpen(false);
      const cardId = pendingWhotCardId.current;

      if (cardId && currentGame?.id) {
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
  });

  const onSuitSelect = useCallback((suit: CardSuit) => {
    latestSuitSelect.current(suit);
  }, []);

  const latestPagingPress = useRef<() => void>(() => {});
  useEffect(() => {
    latestPagingPress.current = () => {
      const dealer = cardListRef.current;
      if (!dealer || animationLock.isAnimating || !visualGameState) return;

      const myHand = visualGameState.players[0].hand;
      if (myHand.length <= playerHandLimit) return;

      const lastCard = myHand[myHand.length - 1];
      const rotatedHand = [lastCard, ...myHand.slice(0, -1)];

      // Update local paging order (does NOT mutate game state)
      setLocalHandOrder(rotatedHand.map(c => c.id));

      dealer.teleportCard(lastCard, "player", { cardIndex: -1, handSize: layoutHandSize, zIndex: 90 });

      rotatedHand.slice(0, layoutHandSize).forEach((c, idx) => {
        dealer.dealCard(c, "player", { cardIndex: idx, handSize: layoutHandSize }, false);
      });

      if (rotatedHand.length > layoutHandSize) {
        const cardLeaving = rotatedHand[layoutHandSize];
        dealer.dealCard(cardLeaving, "player", { cardIndex: 5, handSize: layoutHandSize, zIndex: 90 }, false);
      }
    };
  });

  const onPagingPress = useCallback(() => {
    latestPagingPress.current();
  }, []);

  // --- 11. INITIAL DEAL ANIMATION ---
  const onCardListReady = () => {
    setTimeout(() => { if (!hasDealt) animateInitialDeal(); }, 500);
  };

  const animateInitialDeal = async () => {
    if (!visualGameState || !cardListRef.current) return;
    const dealer = cardListRef.current;
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
  // Fix 3: snapTrigger ensures pile re-snaps after animations drain
  }, [visualGameState?.pile?.length, visualGameState?.market?.length, hasDealt, snapTrigger]);

  // --- 12a2. PLAYER HAND SNAP (Fallback) ---
  // When animations are idle, ensure displayedHand matches Redux truth.
  // Prevents ghost cards and desync when state updates arrive during transitions.
  useEffect(() => {
    if (!hasDealt || !cardListRef.current || !visualGameState) return;
    if (animationLock.isAnimating || animationQueue.isRunning) return;

    const reduxHand = visualGameState.players[0]?.hand || [];
    const reduxIds = new Set(reduxHand.map(c => c.id));
    const dispIds = new Set(displayedHand.map(c => c.id));

    // Content-level comparison
    let needsResync = reduxIds.size !== dispIds.size;
    if (!needsResync) {
      for (const id of reduxIds) {
        if (!dispIds.has(id)) { needsResync = true; break; }
      }
    }

    if (needsResync) {
      setDisplayedHand([...reduxHand]);
      setLocalHandOrder(reduxHand.map(c => c.id));

      // Re-position all visible hand cards
      const dealer = cardListRef.current;
      const visibleHand = reduxHand.slice(0, layoutHandSize);
      visibleHand.forEach((card, index) => {
        dealer.teleportCard(card, 'player', { cardIndex: index, handSize: layoutHandSize });
        dealer.flipInstant(card, true);
      });
      // Push overflow cards offscreen
      reduxHand.slice(layoutHandSize).forEach((card, index) => {
        dealer.teleportCard(card, 'player', { cardIndex: layoutHandSize + index, handSize: layoutHandSize });
      });
    }
  }, [visualGameState?.players?.[0]?.hand?.length, hasDealt, snapTrigger]);

  // --- 12b. OPPONENT HAND SNAP ---
  // Snaps opponent cards whenever their hand changes (opponent drew or played).
  // Uses the ACTUAL server hand length as handSize so all cards are spread correctly.
  // Only runs when animation queue is idle to avoid fighting active animations.
  useEffect(() => {
    if (!hasDealt || !cardListRef.current || !visualGameState) return;
    if (animationLock.isAnimating || animationQueue.isRunning) return;

    const dealer = cardListRef.current;

    // Check if displayed content matches server truth
    const reduxOppHand = visualGameState.players[1]?.hand || [];
    const oppHandIds = new Set(reduxOppHand.map(c => c.id));
    const dispHandIds = new Set(displayedOpponentHand.map(c => c.id));

    // Content-level comparison: resync if ANY card differs (not just size)
    let needsResync = oppHandIds.size !== dispHandIds.size;
    if (!needsResync) {
      for (const id of oppHandIds) {
        if (!dispHandIds.has(id)) { needsResync = true; break; }
      }
    }

    if (needsResync) {
      setDisplayedOpponentHand([...reduxOppHand]);
    }

    const currentOppHand = displayedOpponentHandRef.current;

    // Only snap cards that STILL belong to the opponent's hand.
    // This prevents snapping a just-played card back to the hand before React state updates.
    const validOppCards = currentOppHand.filter(c => oppHandIds.has(c.id));

    validOppCards.forEach((c, i) => {
      dealer.teleportCard(c, 'computer', { cardIndex: i, handSize: validOppCards.length });
    });
  }, [visualGameState?.players?.[1]?.hand?.length, hasDealt, displayedOpponentHand.length, snapTrigger]);


  const handleExit = () => {
    // If game is still in progress, show forfeit confirmation
    if (currentGame && currentGame.status === 'IN_PROGRESS') {
      Alert.alert(
        'Forfeit Match',
        'If you forfeit, you will lose. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes',
            style: 'destructive',
            onPress: () => {
              socketService.emitForfeit(currentGame.id);
            }
          }
        ]
      );
    } else {
      dispatch(clearChat());
      (navigation as any).navigate('GameLobby', { gameId: 'whot' });
    }
  };

  const handleRematch = () => {
    // Clear current game from Redux
    dispatch(clearCurrentGame());
    dispatch(clearChat());
    // Reset all animation/display state for a fresh session
    animationQueue.clear();
    setIsAnimating(false);
    setHasDealt(false);
    setDisplayedHand([]);
    setDisplayedOpponentHand([]);
    displayedHandRef.current = [];
    displayedOpponentHandRef.current = [];
    pendingDrawIdsRef.current = new Set();
    pendingOpponentDrawIdsRef.current = new Set();
    processedMoveIdsRef.current = new Set();
    prevBoardStringRef.current = null;
    stableBoardRef.current = null;
    stableAllCardsRef.current = [];
    pendingStateRef.current = null;
    setLocalHandOrder([]);
    setIsSuitSelectorOpen(false);
    setAssetsReady(false);
    setCardsReadyToRender(true);
    // Reset matchmaking ref and restart matchmaking
    hasStartedMatchmaking.current = true;
    gameOverProcessedRef.current = false;
    startAutomaticMatchmaking();
  };

  const handleNewBattle = () => {
    dispatch(clearCurrentGame());
    dispatch(clearChat());
    (navigation as any).navigate('GameLobby', { gameId: 'whot' });
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

  // --- WINNER MEMOIZATION ---
  const isGameCompleted = currentGame?.status === 'COMPLETED' || !!visualGameState?.winner;
  const actualWinnerId = visualGameState?.winner?.id || currentGame?.winnerId;
  const matchResult = actualWinnerId === userProfile?.id ? 'win' : (actualWinnerId ? 'loss' : 'draw');
  const parsedWinnerObj = useMemo(() => actualWinnerId ? { id: actualWinnerId } : null, [actualWinnerId]);

  // --- RENDER ---
  const areFontsReady = stableFont !== null && stableWhotFont !== null;

  if (isMatchmaking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.matchmakingContainer}>
          <View style={styles.matchmakingContent}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.matchmakingTitle}>{matchmakingMessage}</Text>
            <Text style={styles.matchmakingSub}>Pairing you with an opponent...</Text>
            <TouchableOpacity style={styles.cancelMatchmakingButton} onPress={() => {
              matchmakingService.cancelMatchmaking().catch(console.error);
              if (matchmakingIntervalRef.current) clearInterval(matchmakingIntervalRef.current);
              setIsMatchmaking(false);
              navigation.goBack();
            }}>
              <Text style={styles.cancelMatchmakingText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentGame || !visualGameState || !areFontsReady || !assetsReady || !areCardsReadyToRender) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.matchmakingContainer}>
          <View style={styles.matchmakingContent}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.matchmakingTitle}>Preparing Arena...</Text>
            <Text style={styles.matchmakingSub}>Connecting to Match...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }



  const opponent = isPlayer2 ? currentGame.player1 : currentGame.player2;

  return (
    <View style={styles.gameContainer}>
      <WhotCoreUI
        game={{
          gameState: coreUIGameState!,
          allCards: areCardsReadyToRender ? reconstructedAllCards : []
        }}
        playerState={{
          name: userProfile?.name || 'You',
          rating: getPlayerGameRating(userProfile),
          handLength: displayedHand.length,
          isCurrentPlayer: visualGameState.currentPlayer === 0,
          avatar: userProfile?.avatar
        }}
        opponentState={{
          name: opponent?.name || 'Opponent',
          rating: getPlayerGameRating(opponent),
          handLength: displayedOpponentHand.length,
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
        cardListRef={cardListRef}
        onCardPress={onCardPress}
        onFeedback={onFeedback}
        onPickFromMarket={onPickFromMarket}
        onPagingPress={onPagingPress}
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
        gameOver={isGameCompleted ? {
          winner: parsedWinnerObj,
          onRematch: handleRematch,
          onNewBattle: handleNewBattle,
          level: 1 as any,
          playerName: userProfile?.name || 'You',
          opponentName: opponent?.name || 'Opponent',
          playerRating: getPlayerGameRating(userProfile),
          result: matchResult,
          isOnline: true
        } : null}
      />
      <MatchActionButtons />
      <MatchChatOverlay matchId={currentGame.id} />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  gameContainer: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FFD700', marginTop: 15 },
  matchmakingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  matchmakingContent: { alignItems: 'center', backgroundColor: '#2a2a2a', padding: 40, borderRadius: 20, width: '100%', maxWidth: 400 },
  matchmakingTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', marginTop: 20, textAlign: 'center' },
  matchmakingSub: { color: '#aaa', marginTop: 10, fontSize: 14, textAlign: 'center' },
  cancelMatchmakingButton: { marginTop: 30, padding: 15, borderWidth: 1, borderColor: '#d32f2f', borderRadius: 8, width: '100%' },
  cancelMatchmakingText: { color: '#ef5350', textAlign: 'center', fontSize: 16, fontWeight: '600' },
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