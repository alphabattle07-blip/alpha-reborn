// LudoCoreUI.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigation } from "@react-navigation/native";
import { useWindowDimensions, View, StyleSheet, Text, TouchableOpacity, Alert } from "react-native";
import { LudoSkiaBoard } from "./LudoSkiaBoard";
import LudoPlayerProfile from "./LudoPlayerProfile";
import {
    initializeGame,
    rollDice,
    getValidMoves,
    applyMove,
    LudoGameState,
    passTurn
} from "./LudoGameLogic";
import { getRankFromRating } from '../../../../utils/rank';
import { getComputerMove } from "../../computer/LudoComputerLogic";
import { Ludo3DDie } from "./Ludo3DDie";
import { useLudoTimerColor } from "./LudoTimerRing";
import { useLudoSoundEffects } from "../useLudoSoundEffects";
import QuickMuteButton from '../../../../components/QuickMuteButton';

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#222" },
    boardContainer: { flex: 1, justifyContent: "center", alignItems: 'center' },

    // Dice House Styles
    diceHouse: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        padding: 4,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        minWidth: 80,
        alignItems: 'center',
        justifyContent: 'center'
    },
    diceRow: { flexDirection: 'row', gap: 5 },
    diceOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rankIconOverlay: {
        fontSize: 28,
    },

    // Profile Arrangement
    opponentUIContainer: {
        position: 'absolute',
        top: 40,
        right: 20,
        alignItems: 'flex-start',
        zIndex: 10,
    },
    playerUIContainer: {
        position: 'absolute',
        bottom: 50,
        left: 20,
        alignItems: 'flex-start',
        zIndex: 10,
    },
    soundControlContainer: {
        position: 'absolute',
        top: 100,
        right: 20,
        zIndex: 9999,
        elevation: 100,
    }
});

const DiceHouse = ({
    dice,
    diceUsed,
    onPress,
    waitingForRoll,
    rankIcon,
    disabled,
    isRolling,
    timerProps
}: {
    dice: number[],
    diceUsed: boolean[],
    onPress: () => void,
    waitingForRoll: boolean,
    rankIcon: string,
    disabled?: boolean,
    isRolling?: boolean,
    timerProps?: {
        isActive: boolean;
        turnStartTime?: number;
        turnDuration?: number;
        yellowAt?: number;
        redAt?: number;
        serverTimeOffset?: number;
    }
}) => {
    const timerBorderColor = useLudoTimerColor(timerProps);
    const hasTimer = timerProps?.isActive;
    // Determine dice count for rolling placeholder (1 die for level < 3, 2 for >= 3)
    const rollingDiceCount = dice?.length > 0 ? dice.length : 1;

    return (
        <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
            <TouchableOpacity
                style={[
                    styles.diceHouse,
                    hasTimer && { borderColor: timerBorderColor, borderWidth: 3 }
                ]}
                onPress={onPress}
                disabled={disabled || !waitingForRoll || isRolling}
                activeOpacity={0.8}
            >
                <View style={styles.diceRow}>
                    {isRolling ? (
                        // Optimistic rolling: show spinning dice immediately
                        Array.from({ length: rollingDiceCount }).map((_, i) => (
                            <Ludo3DDie
                                key={`rolling-${i}`}
                                value={0}
                                size={35}
                                isRolling={true}
                            />
                        ))
                    ) : dice?.length > 0 ? (
                        (dice || []).map((d, i) => (
                            <Ludo3DDie
                                key={i}
                                value={d}
                                size={35}
                                isUsed={diceUsed[i]}
                            />
                        ))
                    ) : (
                        <View style={{ width: 35, height: 35 }} />
                    )}
                </View>

                {waitingForRoll && !isRolling && (
                    <View style={styles.diceOverlay}>
                        <Text style={styles.rankIconOverlay}>{rankIcon}</Text>
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );
};

type LudoGameProps = {
    gameState?: LudoGameState;
    player?: { name: string; country?: string; rating?: number; isAI?: boolean; avatar?: string | null };
    opponent?: { name: string; country?: string; rating?: number; isAI?: boolean; avatar?: string | null };
    onGameStatsUpdate?: (result: "win" | "loss" | "draw", newRating: number) => void;
    onGameOver?: (winnerId: string) => void;
    onMove?: (state: LudoGameState) => void;
    onRoll?: (state: LudoGameState) => void;
    onPassTurn?: () => void;
    level?: any;
    timerSync?: {
        turnStartTime?: number;
        turnDuration?: number;
        yellowAt?: number;
        redAt?: number;
        serverTimeOffset?: number;
    };
};

// --- Dice Positioning Configuration ---
const DICE_POS_CONFIG = {
    blue: { x: 0.385, y: 0.800 },   // Final Position: 0.800
    green: { x: 0.600, y: 0.270 },  // Final Position: 0.270
};

export const LudoCoreUI: React.FC<LudoGameProps> = ({
    gameState: propGameState,
    player: propPlayer,
    opponent: propOpponent,
    onGameStatsUpdate,
    onGameOver,
    onMove,
    onRoll,
    onPassTurn,
    level,
    timerSync,
}) => {
    const navigation = useNavigation();
    const [internalGameState, setInternalGameState] = useState<LudoGameState>(
        propGameState ?? initializeGame('blue', 'green', level || 2)
    );

    // Sync internal state with prop if controlled
    useEffect(() => {
        if (propGameState) {
            setInternalGameState(propGameState);
        }
    }, [propGameState]);

    const gameState = internalGameState;
    const setGameState = setInternalGameState;

    const defaultPlayer = { name: "Player", country: "NG", rating: 1200, isAI: false, avatar: null as string | null };
    const defaultOpponent = { name: "Opponent", country: "US", rating: 1500, isAI: true, avatar: null as string | null };

    const player = propPlayer ?? defaultPlayer;
    const opponent = propOpponent ?? defaultOpponent;

    // --- Sound Effects ---
    useLudoSoundEffects(gameState);

    // --- Derived State for Board ---
    const boardPositions = useMemo(() => {
        const posMap: { [key: string]: { pos: number, land: number, delay: number, isActive: boolean }[] } = {};
        const isHumanTurn = gameState.currentPlayerIndex === 0;
        const showHumanIndicators = isHumanTurn && !gameState.waitingForRoll && gameState.dice.length > 0 && !gameState.winner;
        const currentValidMoves = showHumanIndicators ? getValidMoves(gameState) : [];

        gameState.players.forEach((p) => {
            const isP1 = p.id === 'p1';
            posMap[p.id] = (p.seeds || []).map((s, idx) => {
                const seedCanMove = showHumanIndicators && isP1 && currentValidMoves.some(m => m.seedIndex === idx);
                return {
                    pos: s.position,
                    land: s.landingPos,
                    delay: s.animationDelay || 0,
                    isActive: !!seedCanMove
                };
            });
        });
        return posMap;
    }, [gameState.players, gameState.currentPlayerIndex, gameState.waitingForRoll, gameState.dice, gameState.winner]);

    useEffect(() => {
        if (gameState.winner) {
            onGameOver?.(gameState.winner);
        }
    }, [gameState.winner, onGameOver]);

    const p1Score = useMemo(() => gameState.players[0].seeds.filter(s => s.position === 56).length, [gameState.players[0].seeds]);
    const p2Score = useMemo(() => gameState.players[1].seeds.filter(s => s.position === 56).length, [gameState.players[1].seeds]);

    const playerRank = useMemo(() => getRankFromRating(player.rating || 1200) || { icon: '🌱' }, [player.rating]);
    const opponentRank = useMemo(() => getRankFromRating(opponent.rating || 1500) || { icon: '🌱' }, [opponent.rating]);

    // --- Optimistic Dice Rolling State (Online only) ---
    const [isRolling, setIsRolling] = useState(false);

    // Clear isRolling when real dice values arrive from server
    useEffect(() => {
        if (isRolling && !gameState.waitingForRoll && gameState.dice.length > 0) {
            setIsRolling(false);
        }
    }, [isRolling, gameState.waitingForRoll, gameState.dice]);

    // Reset isRolling on turn change (e.g. opponent's turn)
    useEffect(() => {
        setIsRolling(false);
    }, [gameState.currentPlayerIndex]);

    // --- Handlers ---
    const handleRollDice = useCallback(() => {
        if (gameState.winner) return;
        const isPlayerTurn = gameState.currentPlayerIndex === 0;
        const isComputerTurn = !onMove && gameState.currentPlayerIndex === 1;

        if (!isPlayerTurn && !isComputerTurn) {
            return;
        }

        if (onRoll) {
            // Online mode: Start optimistic rolling animation immediately
            setIsRolling(true);
            onRoll(gameState);
        } else {
            // Local computer game: Apply immediately (no optimistic needed)
            const newState = rollDice(gameState);
            setGameState(newState);
        }
    }, [gameState, onRoll, onMove]);

    // --- Auto Pass & Turn Logic ---
    useEffect(() => {
        // Auto-pass conditions:
        // 1. Game is not over
        // 2. Dice have been rolled (!waitingForRoll)
        // 3. Either local computer game (no onMove) or online game where it's local turn
        const isLocalTurn = gameState.currentPlayerIndex === 0;
        const isOnline = !!onMove || !!onPassTurn;
        const canAutoPass = !gameState.waitingForRoll && !gameState.winner && (!isOnline || isLocalTurn);

        if (canAutoPass) {
            const moves = getValidMoves(gameState);
            if (moves.length === 0) {
                const timer = setTimeout(() => {
                    if (onPassTurn) {
                        onPassTurn();
                    } else {
                        const newState = passTurn(gameState);
                        setGameState(newState);
                    }
                }, 1000);
                return () => clearTimeout(timer);
            }
        }
    }, [gameState.waitingForRoll, gameState.winner, gameState.currentPlayerIndex, onMove, onPassTurn]);

    // AI Turn Loop
    useEffect(() => {
        // AI only plays in local computer games (no onMove prop)
        const isAiTurn = !onMove && gameState.currentPlayerIndex === 1 && !gameState.winner;
        if (isAiTurn) {
            const aiDelay = 1000;
            if (gameState.waitingForRoll) {
                const timer = setTimeout(() => {
                    handleRollDice();
                }, aiDelay);
                return () => clearTimeout(timer);
            } else {
                const timer = setTimeout(() => {
                    const moves = getValidMoves(gameState);
                    if (moves.length > 0) {
                        const aiMove = getComputerMove(gameState, level || 2);
                        if (aiMove) {
                            setGameState(prev => applyMove(prev, aiMove));
                        }
                    }
                }, aiDelay);
                return () => clearTimeout(timer);
            }
        }
    }, [gameState, handleRollDice, level, onMove]);

    const handleBoardPress = useCallback((x: number, y: number, tappedSeed?: { playerId: string; seedIndex: number; position: number } | null) => {
        if (tappedSeed) {
            if (tappedSeed.playerId !== 'p1') return;
            if (gameState.currentPlayerIndex !== 0) return;

            if (!gameState.waitingForRoll) {
                const moves = getValidMoves(gameState);
                const matchingMove = moves.find(move => move.seedIndex === tappedSeed.seedIndex);
                if (matchingMove) {
                    // Apply move locally FIRST for instant animation
                    const newState = applyMove(gameState, matchingMove);
                    setGameState(newState);

                    if (onMove) {
                        // Online mode: also emit to server (server validates & broadcasts)
                        onMove(matchingMove as any);
                    }
                }
            }
        }
    }, [gameState, onMove]);


    const { width: windowWidth, height: windowHeight } = useWindowDimensions();

    const getDicePositionStyle = (playerColor: 'blue' | 'green') => {
        const checkPos = DICE_POS_CONFIG[playerColor];
        const pos = checkPos || { x: 0.5, y: 0.5 };
        return {
            position: 'absolute' as const,
            left: pos.x * windowWidth - 40,
            top: pos.y * windowHeight - 40,
        };
    };

    // Determine active color for persistent dice house
    const activePlayerColor = gameState.currentPlayerIndex === 0 ? 'blue' : 'green';
    const diceHouseStyle = getDicePositionStyle(activePlayerColor);

    return (
        <View style={styles.container}>
            {/* 1. Opponent Profile - Top-Right */}
            <View style={styles.opponentUIContainer}>
                <LudoPlayerProfile
                    name={opponent.name}
                    rating={opponent.rating || 1500}
                    isAI={true}
                    isActive={gameState.currentPlayerIndex === 1}
                    color="#34C759"
                    score={p2Score}
                />
            </View>

            {/* Game Board */}
            <View style={styles.boardContainer}>
                <LudoSkiaBoard
                    onBoardPress={handleBoardPress}
                    positions={boardPositions}
                    level={level || gameState.level}
                />
            </View>

            {/* 2. Player Profile - Bottom-Left */}
            <View style={styles.playerUIContainer}>
                <LudoPlayerProfile
                    name={player.name}
                    rating={player.rating || 1200}
                    isActive={gameState.currentPlayerIndex === 0}
                    color="#007AFF"
                    avatar={player.avatar}
                    score={p1Score}
                />
            </View>

            {/* Persistent Dice House - Moves instead of remounting */}
            {!gameState.winner && (
                <View style={diceHouseStyle}>
                    <DiceHouse
                        dice={gameState.dice}
                        diceUsed={gameState.diceUsed}
                        waitingForRoll={gameState.waitingForRoll}
                        onPress={handleRollDice}
                        rankIcon={gameState.currentPlayerIndex === 0 ? playerRank.icon : opponentRank.icon}
                        disabled={gameState.currentPlayerIndex !== 0}
                        isRolling={isRolling}
                        timerProps={timerSync ? {
                            isActive: true,
                            ...timerSync
                        } : undefined}
                    />
                </View>
            )}

            <View style={styles.soundControlContainer} pointerEvents="box-none">
                <QuickMuteButton gameId="ludo" />
            </View>
        </View>
    );
};

export default LudoCoreUI;