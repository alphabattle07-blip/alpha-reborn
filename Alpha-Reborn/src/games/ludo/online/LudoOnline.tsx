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
        if (currentGame?.id) {
            // 1. Join the game room
            socketService.joinGame(currentGame.id);

            // 2. Listen for opponent moves
            const unsubscribe = socketService.onOpponentMove((newState: LudoGameState) => {
                // console.log("[LudoOnline] ⚡ Socket update received");

                // Only process if it's NOT our action (redundant safety)
                // Actually, the server broadcasts to others, so we shouldn't receive our own moves usually,
                // unless we join with multiple sockets or server logic changes.
                // We'll trust the swap logic in useMemo to handle the perspective.

                // Update local store immediately
                // We need to dispatch updateOnlineGameState or just update slice?
                // updateOnlineGameState works, but it might be heavy if it triggers another fetch.
                // Ideally, we just update the simple store.

                // For now, let's treat it as a "fetch success"
                dispatch(setCurrentGame({
                    ...currentGame,
                    board: newState
                }));
            });

            return () => {
                unsubscribe();
                socketService.leaveGame(currentGame.id);
            };
        }
    }, [currentGame?.id]);

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
        if (!currentGame || !userProfile || !visualGameState) return;

        // Strict Turn Validation: Only the player whose turn it is should update the server.
        // visualGameState.currentPlayerIndex 0 is always the local player.
        if (visualGameState.currentPlayerIndex !== 0) {
            console.log("[LudoOnline] Action ignored: Not your turn to update server");
            return;
        }

        // Transform back to logical state before sending to server
        let logicalState = newState;
        if (isPlayer2) {
            const swappedPlayers = [
                { ...newState.players[1], id: 'p1' },
                { ...newState.players[0], id: 'p2' }
            ];
            logicalState = {
                ...newState,
                players: swappedPlayers,
                currentPlayerIndex: newState.currentPlayerIndex === 1 ? 0 : 1,
            };
        }

        // --- Optimistic Update ---
        pendingStateRef.current = newState;
        lastActionTimeRef.current = Date.now();

        try {
            // Determine the current turn ID based on the updated logical state
            const nextTurnId = logicalState.currentPlayerIndex === 0
                ? currentGame.player1.id
                : (currentGame.player2?.id || '');

            await dispatch(updateOnlineGameState({
                gameId: currentGame.id,
                updates: {
                    board: logicalState as any,
                    currentTurn: nextTurnId || undefined,
                    winnerId: newState.winner === 'p1' ? userProfile.id : (newState.winner === 'p2' ? (isPlayer1 ? currentGame.player2?.id : currentGame.player1?.id) : undefined),
                    status: newState.winner ? 'COMPLETED' : 'IN_PROGRESS'
                }
            })).unwrap();

            // --- Socket Emit ---
            // Broadcast the move to the opponent instantly
            socketService.emitMove(currentGame.id, logicalState);

        } catch (error) {
            console.error("Failed to update server", error);
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
                    onMove={handleOnlineAction}
                    onRoll={handleOnlineAction}
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
