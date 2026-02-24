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
import { LudoGameState, initializeGame } from '../core/ui/LudoGameLogic';
import LudoGameOver from '../computer/LudoGameOver';
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

    // Matchmaking State
    const [isMatchmaking, setIsMatchmaking] = useState(false);
    const [matchmakingMessage, setMatchmakingMessage] = useState('Finding match...');
    const matchmakingIntervalRef = useRef<any>(null);
    const turnTimer = useRef<any>(null);
    const hasStartedMatchmaking = useRef(false);

    // --- Optimistic State Protection ---
    // Stores our local state after an action until the server confirms it
    const pendingStateRef = useRef<LudoGameState | null>(null);
    const lastActionTimeRef = useRef<number>(0);
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

    // Handle Game Polling
    useEffect(() => {
        if (currentGame?.id) {
            const interval = setInterval(() => {
                dispatch(fetchGameState(currentGame.id));
            }, 15000); // Reduce poll frequency to 15s (fallback only)
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

            // 2. Listen for game state updates
            const unsubscribe = socketService.onGameStateUpdate((newState: any) => {
                // Update local store immediately
                dispatch(setCurrentGame({
                    ...currentGame,
                    board: newState
                }));

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
            });

            // 3. Listen for turn starts (Timer Sync)
            const unsubscribeTurn = socketService.onTurnStarted((data: any) => {
                console.log("[LudoOnline] Turn Started Event:", data);
                setTimerSync({
                    turnStartTime: data.turnStartTime || (data.serverTime - (data.timeLimit - (data.remainingTime || data.timeLimit))),
                    turnDuration: data.timeLimit,
                    yellowAt: data.yellowAt,
                    redAt: data.redAt,
                    serverTimeOffset: Date.now() - data.serverTime
                });
            });

            return () => {
                unsubscribe();
                unsubscribeTurn();
                socketService.leaveGame(currentGame.id);
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
    const visualGameState = useMemo(() => {
        if (!currentGame) return null;
        const board = typeof currentGame.board === 'string' ? JSON.parse(currentGame.board) : currentGame.board;
        const serverState = (board as unknown as LudoGameState) || initializeGame('blue', 'green');

        // Swap server state if we are Player 2
        let processedState = serverState;
        if (isPlayer2) {
            const swappedPlayers = [
                { ...serverState.players[1], id: 'p1' },
                { ...serverState.players[0], id: 'p2' }
            ];
            processedState = {
                ...serverState,
                players: swappedPlayers,
                currentPlayerIndex: serverState.currentPlayerIndex === 1 ? 0 : 1,
            };
        }

        // --- RUBBER-BANDING PROTECTION ---
        // If we have a pending local state, check if we should prefer it over the server state
        if (pendingStateRef.current) {
            const now = Date.now();
            const timeSinceAction = now - lastActionTimeRef.current;

            // If it's been more than 10 seconds, drop the pending state (stale)
            if (timeSinceAction > 10000) {
                pendingStateRef.current = null;
            } else {
                // Check if the server has "caught up"
                // We compare current turn and dice state roughly
                const isServerEquivalent =
                    processedState.currentPlayerIndex === pendingStateRef.current.currentPlayerIndex &&
                    processedState.waitingForRoll === pendingStateRef.current.waitingForRoll;

                if (isServerEquivalent) {
                    // Server matched our optimistic expectation! Clear pending state.
                    pendingStateRef.current = null;
                } else {
                    // Server is still behind. Ignore server state and use our pending state.
                    console.log("[LudoOnline] Ignoring outdated server state (Rubber-banding protection)");
                    return pendingStateRef.current;
                }
            }
        }

        return processedState;
    }, [currentGame, isPlayer2]);

    const handleOnlineAction = async (newState: LudoGameState) => {
        // Obsolete function, replaced by handleRoll and handleMove
    };

    const handleRoll = () => {
        if (!currentGame || !userProfile || !visualGameState) return;

        // Strict Turn Validation
        if (visualGameState.currentPlayerIndex !== 0) {
            console.log("[LudoOnline] Action ignored: Not your turn to roll");
            return;
        }

        // protection against fast taps / double rolls
        if (Date.now() - lastActionTimeRef.current < 1000) {
            console.log("[LudoOnline] Action ignored: Too fast / duplicate roll");
            return;
        }
        lastActionTimeRef.current = Date.now();

        try {
            socketService.emitAction(currentGame.id, 'ludo', { type: 'ROLL_DICE' });
        } catch (error) {
            console.error("Failed to emit roll", error);
        }
    };

    const handleMove = (move: any) => {
        if (!currentGame || !userProfile || !visualGameState) return;

        // Strict Turn Validation
        if (visualGameState.currentPlayerIndex !== 0) {
            console.log("[LudoOnline] Action ignored: Not your turn to move");
            return;
        }

        lastActionTimeRef.current = Date.now();

        try {
            socketService.emitAction(currentGame.id, 'ludo', { type: 'MOVE_PIECE', move: move });
        } catch (error) {
            console.error("Failed to emit move", error);
        }
    };

    const handlePassTurn = () => {
        if (!currentGame || !userProfile || !visualGameState) return;

        if (visualGameState.currentPlayerIndex !== 0) return;

        lastActionTimeRef.current = Date.now();
        try {
            socketService.emitAction(currentGame.id, 'ludo', { type: 'PASS_TURN' });
        } catch (error) {
            console.error("Failed to emit pass turn", error);
        }
    };

    const handleExit = () => {
        dispatch(clearCurrentGame());
        navigation.goBack();
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
                        rating: userProfile?.rating || 1200,
                        avatar: userProfile?.avatar
                    }}
                    opponent={{
                        name: opponent.name,
                        rating: opponent.rating,
                    }}
                    onMove={handleMove}
                    onRoll={handleRoll}
                    onPassTurn={handlePassTurn}
                    timerSync={timerSync || undefined}
                    onGameOver={() => { }} // Handled by status in update
                />

                {currentGame.status === 'COMPLETED' && (
                    <LudoGameOver
                        result={currentGame.winnerId === userProfile?.id ? "win" : "loss"}
                        level={visualGameState.level}
                        onRematch={() => handleExit()} // Rematch logic can be added later
                        onNewBattle={handleExit}
                        playerName={userProfile?.name || "You"}
                        opponentName={opponent.name}
                        playerRating={userProfile?.rating || 1200}
                        isOnline={true}
                    />
                )}
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
});

export default LudoOnline;
