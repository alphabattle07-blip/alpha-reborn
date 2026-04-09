import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
    createOnlineGame,
    joinOnlineGame,
    fetchAvailableGames,
    updateOnlineGameState,
    fetchGameState
} from '../../../store/thunks/onlineGameThunks';
import { clearCurrentGame, setCurrentGame } from '../../../store/slices/onlineGameSlice';
import { usePlayerProfile } from '../../../hooks/usePlayerProfile';
import { LudoCoreUI } from '../core/ui/LudoCoreUI';
import { LudoGameState, initializeGame, applyMove } from '../core/ui/LudoGameLogic';
import LudoGameOver from '../computer/LudoGameOver';
import { MatchActionButtons } from '../../../components/chat/MatchActionButtons';
import { MatchChatOverlay } from '../../../components/chat/MatchChatOverlay';
import { setHistory, addMessage, clearChat } from '../../../store/slices/chatSlice';
import { Ionicons } from '@expo/vector-icons';
import { matchmakingService } from '../../../services/api/matchmakingService';
import { socketService } from '../../../services/api/socketService';

const LudoOnline = () => {
    const dispatch = useAppDispatch();
    const navigation = useNavigation();
    const { currentGame, availableGames, isLoading } = useAppSelector(state => state.onlineGame);
    const { profile: userProfile } = useAppSelector(state => state.user);
    const { isAuthenticated, token } = useAppSelector(state => state.auth);
    const playerProfile = usePlayerProfile('ludo');

    // --- LUDO-SPECIFIC RATING RESOLUTION ---
    const { gameStats: reduxGameStats } = useAppSelector((state) => state.gameStats);
    const gameStatsArray = Object.values(reduxGameStats);

    const getPlayerGameRating = (profile: any) => {
        if (!profile) return 1000;

        // 1. Try Redux Slice (if this is the logged-in user)
        const existingStat = profile.id === userProfile?.id
            ? gameStatsArray.find(stat => stat.gameId === 'ludo')
            : undefined;

        if (existingStat) return existingStat.rating;

        // 2. If missing, try Profile Embedded Stats
        const profileEmbeddedStats = profile?.gameStats || [];
        const embeddedStat = profileEmbeddedStats.find((s: any) => s.gameId === 'ludo');

        if (embeddedStat) return embeddedStat.rating;

        // 3. Absolute Fallback
        return profile?.rating ?? 1000;
    };

    // Matchmaking State
    const [isMatchmaking, setIsMatchmaking] = useState(false);
    const [matchmakingMessage, setMatchmakingMessage] = useState('Finding match...');
    const matchmakingIntervalRef = useRef<any>(null);
    const turnTimer = useRef<any>(null);
    const hasStartedMatchmaking = useRef(false);

    // --- Opponent Rolling State ---
    const [isOpponentRolling, setIsOpponentRolling] = useState(false);
    const [isRolling, setIsRolling] = useState(false);

    // --- Optimistic State Protection ---
    // Stores our local state after an action until the server confirms it
    const pendingStateRef = useRef<LudoGameState | null>(null);
    const lastActionTimeRef = useRef<number>(0);
    // Guard: track if game-over has been processed to stop polling/socket updates
    const gameOverProcessedRef = useRef(false);
    // --- Impossible by Design: Sync & Animation Locks ---
    const lastEventIdRef = useRef<number>(0);
    const animationLockRef = useRef<boolean>(false);
    const diceStateRef = useRef<'IDLE' | 'ROLLING' | 'RESULT'>('IDLE');

    // --- Step 1: Per-Seed Interaction Lock (Lift & Pulse) ---
    // Tracks seeds that the user tapped and are waiting for server confirmation
    const [pendingSeedIndices, setPendingSeedIndices] = useState<number[]>([]);

    // --- Step 2: Optimistic Versioning ---
    // Track the local board version so we can drop stale server updates during animation
    const localStateVersionRef = useRef<number>(0);

    // Debounce guard: prevents multiple rapid reconnects from each triggering state recovery
    const reconnectDebounceRef = useRef<any>(null);

    // Ref to always hold the latest currentGame — prevents stale closures in socket listeners
    const currentGameRef = useRef(currentGame);
    useEffect(() => { currentGameRef.current = currentGame; }, [currentGame]);
    const [timerSync, setTimerSync] = useState<{
        turnStartTime?: number;
        turnDuration?: number;
        yellowAt?: number;
        redAt?: number;
        serverTimeOffset?: number;
    } | null>(null);

    // Identify Player Role
    const isPlayer1 = currentGame?.player1?.id === userProfile?.id;
    const isPlayer2 = currentGame?.player2?.id === userProfile?.id;

    // --- Automatic Matchmaking ---
    useEffect(() => {
        if (!isAuthenticated || !token || !userProfile?.id) {
            Alert.alert(
                'Authentication Required',
                'Please log in to play online.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
            return;
        }

        if (hasStartedMatchmaking.current) return;

        if (!currentGame) {
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

    // Safety Net: Clear local rolling state after 3s if server doesn't respond
    useEffect(() => {
        if (isRolling || isOpponentRolling) {
            const timer = setTimeout(() => {
                console.warn(`[LudoSync] Rolling Failsafe triggered: self=${isRolling}, opp=${isOpponentRolling}`);
                setIsRolling(false);
                setIsOpponentRolling(false);
                diceStateRef.current = 'IDLE';
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isRolling, isOpponentRolling]);

    // Handle Game Polling — safety net ONLY for complete socket outages.
    // Under normal conditions, socket deltas keep the state fresh, so this rarely fires.
    useEffect(() => {
        if (currentGame?.id) {
            const interval = setInterval(() => {
                // Stop polling once game is completed
                if (currentGame.status === 'COMPLETED' || gameOverProcessedRef.current) return;
                // Skip if a socket event happened in the last 30 seconds (WebSocket is healthy)
                if (Date.now() - lastActionTimeRef.current < 30000) return;
                dispatch(fetchGameState(currentGame.id));
            }, 60000); // 60s fallback — only fires if socket is silent for 60s
            return () => clearInterval(interval);
        }
    }, [currentGame?.id, dispatch]);

    // --- Socket.IO Integration ---
    useEffect(() => {
        if (currentGame?.id && userProfile?.id) {
            socketService.register(userProfile.id);
            // 1. Join the game room
            socketService.joinGame(currentGame.id);
            // 1.1 Trigger recovery for initial state/timer sync
            socketService.recoverLudoGame(currentGame.id);

            // 1.2 Global Disconnect Handler (Prevent Stuck UI on Doze drop)
            const unsubscribeDisconnect = socketService.onDisconnect(() => {
                console.warn('[LudoOnline] Connection lost! Unlocking UI for safety...');
                animationLockRef.current = false;
                setPendingSeedIndices([]);
                setIsRolling(false);
                setIsOpponentRolling(false);
            });

            // 2. Listen for game state updates (reconnect / timeout recovery)
            const unsubscribe = socketService.onGameStateUpdate((newState: any) => {
                // Ignore updates once game is completed
                if (gameOverProcessedRef.current) return;

                // --- STALE STATE GUARD ---
                // Prevents recovery snapshots from regressing the board backward.
                // After reconnection, the server may send a recovery state with
                // stateVersion=0 (because the recovery path doesn't track versions).
                // If our local board already has a high stateVersion, we must NOT
                // overwrite it with the stale recovery data.
                if (currentGameRef.current) {
                    const currentBoard = typeof currentGameRef.current.board === 'string'
                        ? JSON.parse(currentGameRef.current.board)
                        : currentGameRef.current.board;

                    const incomingVersion = newState.stateVersion || 0;
                    const currentVersion = currentBoard?.stateVersion || 0;

                    // Guard 1: If client has a known version and incoming is LOWER (including 0)
                    if (currentVersion > 0 && incomingVersion < currentVersion) {
                        console.log(`[LudoSync] Dropping stale full-state update: incoming v${incomingVersion} < current v${currentVersion}`);
                        return;
                    }

                    // Guard 2: If versions are equal, only apply if it has timer info
                    // (same version = duplicate, not a new state change)
                    if (currentVersion > 0 && incomingVersion === currentVersion && !newState.remainingTime) {
                        console.log(`[LudoSync] Dropping duplicate full-state update: v${incomingVersion}`);
                        return;
                    }

                    // Ensure board is stored as an object (never a string)
                    const boardObj = typeof newState === 'string' ? JSON.parse(newState) : newState;

                    dispatch(setCurrentGame({
                        ...currentGameRef.current,
                        board: boardObj
                    }));
                }

                // If reconnection state provided remainingTime
                if (newState.remainingTime !== undefined) {
                    const serverTurnStart = (newState.serverTime || Date.now()) - (newState.turnDuration - newState.remainingTime);
                    setTimerSync({
                        turnStartTime: serverTurnStart,
                        turnDuration: newState.turnDuration,
                        yellowAt: newState.yellowAt,
                        redAt: newState.redAt,
                        serverTimeOffset: Date.now() - (newState.serverTime || Date.now())
                    });
                }
                
                // Always release locks on a full state update, as it usually means a turn timeout or reconnect
                animationLockRef.current = false;
                setPendingSeedIndices([]);
            });

            // 3. Listen for turn starts (Timer Sync)
            const unsubscribeTurn = socketService.onTurnStarted((data: any) => {
                setTimerSync({
                    turnStartTime: data.turnStartTime || (data.serverTime - (data.timeLimit - (data.remainingTime || data.timeLimit))),
                    turnDuration: data.timeLimit,
                    yellowAt: data.yellowAt,
                    redAt: data.redAt,
                    serverTimeOffset: Date.now() - data.serverTime
                });
            });

            // 3.5 Listen for Action Deltas (Rolling / Moves)
            const unsubscribeActionUpdate = socketService.onLudoActionUpdate((data: any) => {
                if (gameOverProcessedRef.current) return;

                // 1. Event Version Lock: Drop stale or duplicate events
                if (data.eventId && data.eventId <= lastEventIdRef.current) {
                    console.log(`[LudoSync] Dropping stale event: ${data.eventId} (current: ${lastEventIdRef.current})`);
                    return;
                }
                if (data.eventId) lastEventIdRef.current = data.eventId;

                console.log(`[LudoEvent] TYPE: ${data.type} | ID: ${data.eventId || 'N/A'}`);

                // 3. Animation Lock Layer (for MOVE_PIECE)
                if (data.type === 'DICE_ROLLING_STARTED') {
                    const myServerIndex = isPlayer1 ? 0 : 1;
                    if (data.rollingPlayerIndex !== myServerIndex) {
                        setIsOpponentRolling(true);
                        diceStateRef.current = 'ROLLING';
                        // Clear pending state to prevent rubber-banding of the rolling animation
                        pendingStateRef.current = null;
                        lastActionTimeRef.current = Date.now();
                    }
                    return;
                }

                if (data.type === 'ROLL_DICE') {
                    // ── Dedicated roll result path (NEVER falls into move logic) ──
                    setIsRolling(false);           // Clears YOUR spinning dice
                    setIsOpponentRolling(false);   // Already done by DICE_ROLLING_STARTED counterpart, but keep for safety
                    diceStateRef.current = 'RESULT';
                    pendingStateRef.current = null;
                    lastActionTimeRef.current = Date.now();

                    // Apply dice values + phase directly onto the current board
                    const latestGameForRoll = currentGameRef.current;
                    if (latestGameForRoll) {
                        const currentBoardForRoll = typeof latestGameForRoll.board === 'string'
                            ? JSON.parse(latestGameForRoll.board)
                            : latestGameForRoll.board;

                        const rollBoard = {
                            ...currentBoardForRoll,
                            dice: data.dice || [],
                            diceUsed: data.diceUsed || [],
                            waitingForRoll: data.waitingForRoll ?? false,
                            currentPlayerIndex: data.currentPlayerIndex ?? currentBoardForRoll.currentPlayerIndex,
                            stateVersion: data.stateVersion ?? (currentBoardForRoll.stateVersion || 0) + 1,
                        };

                        // Step 2: Update version watermark
                        if (data.stateVersion) localStateVersionRef.current = data.stateVersion;

                        dispatch(setCurrentGame({
                            ...latestGameForRoll,
                            board: rollBoard
                        }));
                    }
                    return; // ← early return: never touch animation lock or move logic for a roll
                }


                // 3. Animation Lock Layer (for MOVE_PIECE)
                if (data.type === 'MOVE_PIECE') {
                    // It's normal for the lock to be active if WE initiated the move (handleMove sets it).
                    // We only warn if the opponent's move arrived while our UI was locked unexpectedly.
                    if (animationLockRef.current && data.actionPlayerIndex !== (isPlayer1 ? 0 : 1)) {
                        console.warn("[LudoSync] Processing Opponent MOVE during active lock (forced strict sync)");
                    }
                    animationLockRef.current = true;
                }

                const latestGame = currentGameRef.current;
                if (!latestGame) {
                    animationLockRef.current = false;
                    return;
                }
                
                let currentBoard = typeof latestGame.board === 'string' ? JSON.parse(latestGame.board) : latestGame.board;
                let newBoard = { ...currentBoard };
                let shouldUpdate = false;

                if (data.type === 'MOVE_PIECE' && data.move) {
                    try {
                       // Predict Guard Layer
                       const isMyMove = data.actionPlayerIndex === (isPlayer1 ? 0 : 1);
                       const isRedundant = isMyMove && data.stateVersion <= localStateVersionRef.current;

                       if (isRedundant) {
                           console.log(`[LudoPredict] Server confirmed v${data.stateVersion}. Syncing authority.`);
                           localStateVersionRef.current = data.stateVersion;
                           animationLockRef.current = false;
                           setPendingSeedIndices(prev => prev.filter(id => id !== data.move.seedIndex));
                           
                           // STABILIZE: Always ingest server's decision on turns and waiting status
                           newBoard.waitingForRoll = data.waitingForRoll;
                           newBoard.currentPlayerIndex = data.currentPlayerIndex;
                           
                           dispatch(setCurrentGame({
                               ...latestGame,
                               board: newBoard
                           }));
                           return; // SKIP REDUX APPLY_MOVE ENTIRELY
                       }

                       newBoard = applyMove(newBoard, data.move);
                       // Server wins any disagreements
                       newBoard.waitingForRoll = data.waitingForRoll;
                       newBoard.currentPlayerIndex = data.currentPlayerIndex;
                       if (data.diceUsed !== undefined) newBoard.diceUsed = data.diceUsed;
                       newBoard.stateVersion = data.stateVersion;
                       
                       // Sync lastProcessedMoveId so optimistic state can clear
                       if (data.lastProcessedMoveId && data.actionPlayerIndex !== undefined) {
                           if (newBoard.players && newBoard.players[data.actionPlayerIndex]) {
                               newBoard.players[data.actionPlayerIndex].lastProcessedMoveId = data.lastProcessedMoveId;
                           }
                       }

                       // --- Step 3: Unlock per-seed lock on server ack ---
                       // Find which seed was moved by looking at the server data
                       if (data.move && data.move.seedIndex !== undefined) {
                           setPendingSeedIndices(prev => prev.filter(id => id !== data.move.seedIndex));
                           console.log(`[LudoLock] Released seed ${data.move.seedIndex}`);
                       } else if (data.actionSeedIndex !== undefined) {
                           // Fallback to our custom field if move object isn't flat
                           setPendingSeedIndices(prev => prev.filter(id => id !== data.actionSeedIndex));
                           console.log(`[LudoLock] Released seed ${data.actionSeedIndex} (fallback)`);
                       }

                       if (data.stateVersion) localStateVersionRef.current = data.stateVersion;
                       pendingStateRef.current = null;
                       
                       shouldUpdate = true;
                       
                       // Unlock animation instantly now that server has synchronized
                       animationLockRef.current = false;

                    } catch (e) {
                       console.error("[LudoOnline] Failed to apply opponent move locally", e);
                       animationLockRef.current = false;
                       dispatch(fetchGameState(latestGame.id)); // Fallback
                    }
                } else if (data.type === 'PASS_TURN') {
                    newBoard.waitingForRoll = data.waitingForRoll;
                    newBoard.currentPlayerIndex = data.currentPlayerIndex;
                    if (data.diceUsed !== undefined) newBoard.diceUsed = data.diceUsed;
                    newBoard.dice = [];
                    newBoard.stateVersion = data.stateVersion;
                    
                    if (data.lastProcessedMoveId && data.actionPlayerIndex !== undefined) {
                        if (newBoard.players && newBoard.players[data.actionPlayerIndex]) {
                            newBoard.players[data.actionPlayerIndex].lastProcessedMoveId = data.lastProcessedMoveId;
                        }
                    }

                    if (data.stateVersion) localStateVersionRef.current = data.stateVersion;
                    pendingStateRef.current = null;
                    
                    shouldUpdate = true;
                }

                if (shouldUpdate) {
                    dispatch(setCurrentGame({
                        ...latestGame,
                        board: newBoard
                    }));
                }
            });

            // 3.6 Reconnection Recovery: Full sync when socket reconnects
            const unsubscribeConnect = socketService.onConnect(() => {
                console.log("[LudoSync] Socket RECONNECTED - Waiting 1500ms to stabilize before recovery");

                // CRITICAL FIX: Debounce recovery — a mobile socket can fire 'connect' 3x in 2s.
                // Without this guard, we reset the watermark 3 times and accept 3 stale snapshots,
                // causing the "3 rollbacks" behavior.
                if (reconnectDebounceRef.current) {
                    clearTimeout(reconnectDebounceRef.current);
                }

                reconnectDebounceRef.current = setTimeout(() => {
                    reconnectDebounceRef.current = null;

                    // Clear stuck rolling/animation state ONCE (not on every connect event)
                    setIsRolling(false);
                    setIsOpponentRolling(false);
                    diceStateRef.current = 'IDLE';
                    animationLockRef.current = false;

                    // DO NOT reset lastEventIdRef — the watermark must persist across
                    // reconnects to prevent stale events from replaying and causing
                    // the TV static / reconnect loop issue.

                    socketService.recoverLudoGame(currentGame.id);
                    // Also fetch full state via polling as a backup
                    dispatch(fetchGameState(currentGame.id));
                }, 1500); // Wait 1500ms — gives Render/mobile network time to fully stabilize
            });

            // 4. Listen for game ended (forfeit, normal win)
            const unsubscribeEnded = socketService.onGameEnded((data: any) => {
                const latestGame = currentGameRef.current;
                
                if (data?.reason === 'rage_quit') {
                    Alert.alert('Out of Rage Quit', 'The player was inactive for too long and has automatically forfeited.');
                } else if (data?.reason === 'forfeit') {
                    Alert.alert('Match Forfeited', 'The opponent has surrendered.');
                }

                if (data?.winnerId && latestGame) {
                    // Immediately block polling/socket updates
                    gameOverProcessedRef.current = true;
                    dispatch(setCurrentGame({
                        ...latestGame,
                        status: 'COMPLETED',
                        winnerId: data.winnerId
                    }));
                }
            });

            // 5. Chat Hooks
            socketService.joinMatchChat(currentGame.id);

            const unsubscribeChatHistory = socketService.onChatHistory((payload: any) => {
                const latestGame = currentGameRef.current;
                if (latestGame && payload.matchId === latestGame.id) {
                    dispatch(setHistory(payload.messages || []));
                }
            });

            const unsubscribeChatMessage = socketService.onReceiveMatchMessage((payload: any) => {
                dispatch(addMessage({
                    message: payload,
                    currentUserId: userProfile.id
                }));
            });

            // Instant game connection bypasses match countdown logic like Whot does
            
            const unsubscribeVersionMismatch = socketService.onLogicVersionMismatch(() => {
                 Alert.alert(
                     'Update Required', 
                     'Your game logic is out of date. Please update the app to continue playing.', 
                     [{ text: 'OK', onPress: () => {
                         dispatch(clearCurrentGame());
                         (navigation as any).navigate('GameLobby', { gameId: 'ludo' });
                     } }]
                 );
            });

            return () => {
                // Cancel any pending reconnect recovery to prevent state updates after unmount
                if (reconnectDebounceRef.current) {
                    clearTimeout(reconnectDebounceRef.current);
                    reconnectDebounceRef.current = null;
                }
                unsubscribe();
                unsubscribeTurn();
                unsubscribeActionUpdate();
                unsubscribeConnect();
                unsubscribeDisconnect();
                unsubscribeEnded();
                unsubscribeChatHistory();
                unsubscribeChatMessage();
                unsubscribeVersionMismatch();
                socketService.leaveGame(currentGame.id);
                socketService.leaveMatchChat(currentGame.id);
                dispatch(clearChat());
                
                // Force kill all Skia surfaces on unmount
                setIsRolling(false);
                setIsOpponentRolling(false);
            };
        }
    }, [currentGame?.id, userProfile?.id]);

    // --- Matchmaking Handlers ---
    const startAutomaticMatchmaking = async () => {
        try {
            setIsMatchmaking(true);
            setMatchmakingMessage('Finding match...');
            const response = await matchmakingService.startMatchmaking('ludo');

            if (response.matched && response.game) {
                setIsMatchmaking(false);
                dispatch(setCurrentGame(response.game));
            } else {
                setMatchmakingMessage(response.message);
                startMatchmakingPolling();
            }
        } catch (error: any) {
            console.error('Failed to start matchmaking:', error);
            setIsMatchmaking(false);
            Alert.alert('Error', error.message || 'Failed to start matchmaking.');
            navigation.goBack();
        }
    };

    const startMatchmakingPolling = () => {
        matchmakingIntervalRef.current = setInterval(async () => {
            try {
                const response = await matchmakingService.checkMatchmakingStatus('ludo');
                if (response.matched && response.game) {
                    if (matchmakingIntervalRef.current) clearInterval(matchmakingIntervalRef.current);
                    setIsMatchmaking(false);
                    dispatch(setCurrentGame(response.game));
                } else if (!response.inQueue) {
                    if (matchmakingIntervalRef.current) clearInterval(matchmakingIntervalRef.current);
                    setIsMatchmaking(false);
                }
            } catch (error) {
                console.error('Matchmaking polling error:', error);
            }
        }, 2000);
    };

    const handleCancelMatchmaking = async () => {
        try {
            if (matchmakingIntervalRef.current) clearInterval(matchmakingIntervalRef.current);
            await matchmakingService.cancelMatchmaking();
            setIsMatchmaking(false);
            navigation.goBack();
        } catch (error) {
            setIsMatchmaking(false);
            navigation.goBack();
        }
    };

    // --- Game State Transformation ---
    // LudoCoreUI always expects 'p1' to be the local player.
    // We need to map the server state (logical players) to the visual state (p1/p2).

    // PERF FIX: Parse JSON only when the board string reference changes, not on every render.
    // Doing JSON.parse inside the visualGameState memo caused it to fire on every Redux update
    // (even timer ticks), blocking the JS thread and causing missed socket pong responses.
    const parsedBoard = useMemo(() => {
        if (!currentGame?.board) return null;
        return typeof currentGame.board === 'string' ? JSON.parse(currentGame.board) : currentGame.board;
    }, [currentGame?.board]);

    const visualGameState = useMemo(() => {
        if (!currentGame || !parsedBoard) return null;
        const serverState = (parsedBoard as unknown as LudoGameState) || initializeGame('blue', 'green');

        // Swap server state if we are Player 2
        let processedState = serverState;
        if (isPlayer2) {
            const p1 = serverState.players && serverState.players[0];
            const p2 = serverState.players && serverState.players[1];

            // Robust Swap: Even if one player is null, we can still reconstruct enough for LudoCoreUI to not crash.
            // LudoCoreUI needs 'p1' and 'p2' ids to render correctly.
            const swappedPlayers = [
                { ...(p2 || (serverState.players && serverState.players[1])), id: 'p1' },
                { ...(p1 || (serverState.players && serverState.players[0])), id: 'p2' }
            ].filter(p => p.id); // Ensure we don't have empty objects if possible

            if (swappedPlayers.length > 0) {
                processedState = {
                    ...serverState,
                    players: swappedPlayers as any,
                    currentPlayerIndex: serverState.currentPlayerIndex === 1 ? 0 : 1,
                };
            }
        }

        return processedState;
    }, [currentGame, isPlayer2]);

    const handleOnlineAction = async (newState: LudoGameState) => {
        // Obsolete function, replaced by handleRoll and handleMove
    };

    const triggerRollback = useCallback(() => {
        // Rollback removed due to pure event-driven architecture
    }, []);

    const handleRoll = () => {
        console.log("[LudoSync] User triggered ROLL");
        // Block if already rolling OR if an animation is locking the UI
        if (!currentGame || !userProfile || !visualGameState || isRolling || animationLockRef.current) {
            console.log(`[LudoSync] Roll blocked: cur=${!!currentGame}, prof=${!!userProfile}, vis=${!!visualGameState}, rolling=${isRolling}, lock=${animationLockRef.current}`);
            return;
        }

        // CRITICAL: Block if socket is disconnected — don't start spinning with no server
        if (!socketService.isConnected()) {
            console.warn(`[LudoSync] Roll blocked: Socket disconnected. Waiting for reconnect.`);
            socketService.connect();
            return;
        }

        // Strict Turn Validation
        if (visualGameState.currentPlayerIndex !== 0 || !visualGameState.waitingForRoll) {
            return;
        }

        try {
            setIsRolling(true);
            diceStateRef.current = 'ROLLING';
            lastActionTimeRef.current = Date.now();
            socketService.emitAction(currentGame.id, 'ludo', { type: 'ROLL_DICE', expectedStateVersion: visualGameState.stateVersion });
        } catch (error) {
            console.error("Failed to emit roll", error);
            setIsRolling(false);
            diceStateRef.current = 'IDLE';
        }
    };

    const handleMove = (move: any) => {
        if (!currentGame || !userProfile || !visualGameState || animationLockRef.current) {
            if (animationLockRef.current) console.log("[LudoSync] Move blocked: Animation Lock active");
            return;
        }

        if (!socketService.isConnected()) {
            console.warn('[LudoSync] Cannot emit move - reconnecting first');
            socketService.connect();
            return;
        }

        // Strict Turn Validation
        if (visualGameState.currentPlayerIndex !== 0) {
            return;
        }

        // CRITICAL: Block if socket is disconnected — don't allow piece movement offline
        if (!socketService.isConnected()) {
            console.warn(`[LudoSync] Move blocked: Socket disconnected. Waiting for reconnect.`);
            return;
        }

        // --- Step 1: Per-Seed Interaction Lock ---
        // Prevent double-tapping the same seed while its move result is in-flight
        if (move.seedIndex !== undefined && pendingSeedIndices.includes(move.seedIndex)) {
            console.log(`[LudoSync] Move blocked: Seed ${move.seedIndex} is already locked (in-flight)`);
            return;
        }
        if (move.seedIndex !== undefined) {
            setPendingSeedIndices(prev => [...prev, move.seedIndex]);
        }

        // Set the global animation lock locally to prevent double-taps on ANY seed
        animationLockRef.current = true;
        
        lastActionTimeRef.current = Date.now();

        // Generate a unique ID for this action so we know when the server processes it
        const actionId = `move_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const moveWithId = { ...move, moveId: actionId };

        try {
            if (!currentGameRef.current) return;
            // PREDICTION LAYER
            // CRITICAL FIX: NEVER predict upon the SWAPPED visualGameState. Use pristine server string.
            const rawCurrentBoard = typeof currentGameRef.current.board === 'string' ? JSON.parse(currentGameRef.current.board) : currentGameRef.current.board;
            const predictedBoard = applyMove(rawCurrentBoard, moveWithId);
            if (predictedBoard.stateVersion) localStateVersionRef.current = predictedBoard.stateVersion;
            
            if (currentGameRef.current) {
                dispatch(setCurrentGame({
                    ...currentGameRef.current,
                    board: predictedBoard
                }));
            }

            socketService.emitAction(currentGame.id, 'ludo', { type: 'MOVE_PIECE', move: moveWithId, moveId: actionId, expectedStateVersion: visualGameState.stateVersion });
            
            // Release animation lock shortly after prediction is dispatched.
            // The optimistic state is already applied — we only need to prevent
            // rapid double-taps on the same render cycle (300ms debounce).
            setTimeout(() => {
                animationLockRef.current = false;
            }, 300);

        } catch (error) {
            animationLockRef.current = false;
            if (move.seedIndex !== undefined) {
                setPendingSeedIndices(prev => prev.filter(id => id !== move.seedIndex));
            }
            console.error("Failed to emit move", error);
        }
    };

    const handlePassTurn = () => {
        if (!currentGame || !userProfile || !visualGameState) return;

        if (visualGameState.currentPlayerIndex !== 0) return;

        lastActionTimeRef.current = Date.now();
        try {
            socketService.emitAction(currentGame.id, 'ludo', { type: 'PASS_TURN', expectedStateVersion: visualGameState.stateVersion });
        } catch (error) {
            console.error("Failed to emit pass turn", error);
        }
    };

    const handleExit = () => {
        // If game is still in progress, show forfeit confirmation
        if (currentGame && (currentGame.status === 'IN_PROGRESS' || (currentGame.status as string) === 'MATCHED')) {
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
            dispatch(clearCurrentGame());
            (navigation as any).navigate('GameLobby', { gameId: 'ludo' });
        }
    };

    const handleRematch = () => {
        // Clear current game state
        dispatch(clearCurrentGame());
        // Reset matchmaking ref so it can restart
        hasStartedMatchmaking.current = false;
        // Reset pending state and all new intent-architecture refs
        pendingStateRef.current = null;
        lastActionTimeRef.current = 0;
        gameOverProcessedRef.current = false;
        setPendingSeedIndices([]);
        localStateVersionRef.current = 0;
        setIsOpponentRolling(false);
        setTimerSync(null);
        // Restart matchmaking — will show "Looking for Opponent" UI
        hasStartedMatchmaking.current = true;
        startAutomaticMatchmaking();
    };

    const handleNewBattle = () => {
        dispatch(clearCurrentGame());
        (navigation as any).navigate('GameLobby', { gameId: 'ludo' });
    };

    const renderLobbyMatchmaking = () => (
        <View style={styles.matchmakingContainer}>
            <View style={styles.matchmakingContent}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.matchmakingTitle}>{matchmakingMessage}</Text>
                <Text style={styles.matchmakingSub}>Pairing you with an opponent...</Text>
                <TouchableOpacity style={styles.cancelMatchmakingButton} onPress={handleCancelMatchmaking}>
                    <Text style={styles.cancelMatchmakingText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderGame = () => {
        if (!currentGame || !visualGameState) return null;

        const opponent = isPlayer1 ? currentGame.player2 : currentGame.player1;

        if (!opponent) {
            return (
                <View style={styles.waitingContainer}>
                    <ActivityIndicator size="large" color="#4CAF50" />
                    <Text style={styles.waitingTitle}>Waiting for Opponent...</Text>
                    <Text style={styles.waitingSub}>Your game is visible in the lobby.</Text>
                    <TouchableOpacity style={styles.cancelButton} onPress={handleExit}>
                        <Text style={styles.cancelText}>Cancel Game</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <View style={styles.gameContainer}>
                <LudoCoreUI
                    gameState={visualGameState}
                    player={{
                        name: userProfile?.name || "You",
                        rating: getPlayerGameRating(userProfile),
                        avatar: userProfile?.avatar
                    }}
                    opponent={{
                        name: opponent.name,
                        rating: getPlayerGameRating(opponent),
                    }}
                    onMove={handleMove}
                    onRoll={handleRoll}
                    onPassTurn={handlePassTurn}
                    timerSync={timerSync || undefined}
                    isOpponentRolling={isOpponentRolling}
                    isRolling={isRolling}
                    pendingSeedIndices={pendingSeedIndices}
                    localPlayerId={isPlayer1 ? 'p1' : 'p2'}
                    onGameOver={() => { }} // Handled by status in update
                />


                {currentGame.status === 'COMPLETED' && (
                    <LudoGameOver
                        result={currentGame.winnerId === userProfile?.id ? "win" : "loss"}
                        level={visualGameState.level}
                        onRematch={handleRematch}
                        onNewBattle={handleNewBattle}
                        playerName={userProfile?.name || "You"}
                        opponentName={opponent.name}
                        playerRating={getPlayerGameRating(userProfile)}
                        isOnline={true}
                    />
                )}

                {/* Global Match Actions (Challenge & Chat) */}
                <MatchActionButtons />
                <MatchChatOverlay matchId={currentGame.id} />

            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            {isMatchmaking ? renderLobbyMatchmaking() : (currentGame ? renderGame() : <ActivityIndicator size="large" color="#fff" style={{ flex: 1 }} />)}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#1a1a1a' },
    matchmakingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    matchmakingContent: { alignItems: 'center', backgroundColor: '#2a2a2a', padding: 40, borderRadius: 20, width: '100%', maxWidth: 400 },
    matchmakingTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', marginTop: 20, textAlign: 'center' },
    matchmakingSub: { color: '#aaa', marginTop: 10, fontSize: 14, textAlign: 'center' },
    cancelMatchmakingButton: { marginTop: 30, padding: 15, borderWidth: 1, borderColor: '#d32f2f', borderRadius: 8, width: '100%' },
    cancelMatchmakingText: { color: '#ef5350', textAlign: 'center', fontSize: 16, fontWeight: '600' },
    gameContainer: { flex: 1 },
    waitingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    waitingTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', marginTop: 20 },
    waitingSub: { color: '#ccc', marginTop: 10, fontSize: 16 },
    cancelButton: { marginTop: 50, padding: 15, borderWidth: 1, borderColor: '#d32f2f', borderRadius: 8 },
    cancelText: { color: '#ef5350' },
    countdownOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 100
    },
    countdownText: {
        color: '#4CAF50',
        fontSize: 96,
        fontWeight: 'bold'
    },
    countdownLabel: {
        color: '#fff',
        fontSize: 24,
        marginTop: 10,
        fontWeight: '600'
    },
    // Step 4: Reconciliation Toast
    reconcileToast: {
        position: 'absolute',
        top: '45%', // Center-ish
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 25,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 9999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    reconcileToastText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 8,
    },
});

export default LudoOnline;
