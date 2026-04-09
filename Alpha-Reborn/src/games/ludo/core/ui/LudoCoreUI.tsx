// LudoCoreUI.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigation } from "@react-navigation/native";
import { useWindowDimensions, View, StyleSheet, Text, TouchableOpacity, Alert } from "react-native";
import { LudoNativeBoard } from "./LudoNativeBoard";
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
import { DiceHouseMaster } from "./DiceHouseMaster";
import { useDiceAnimations } from './useDiceAnimations';
import { LudoDiceOverlay } from './LudoDiceOverlay';
import { LudoTimerRing } from './LudoTimerRing';
import { useLudoSoundEffects } from "../useLudoSoundEffects";
import SoundDropdownPanel from '../../../../components/SoundDropdownPanel';


const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#222" },
    boardContainer: { 
        ...StyleSheet.absoluteFillObject,
        zIndex: 5,
    },
    opponentUIContainer: {
        position: 'absolute',
        top: 70,
        right: 20,
        alignItems: 'flex-start',
        zIndex: 10,
    },
    playerUIContainer: {
        position: 'absolute',
        bottom: 120,
        left: 20,
        alignItems: 'flex-start',
        zIndex: 10,
    },
    soundControlContainer: {
        position: 'absolute',
        top: 60,
        left: 20,
        zIndex: 9999,
        elevation: 100,
    }
});

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
    isOpponentRolling?: boolean;
    isRolling?: boolean;
    pendingSeedIndices?: number[];
    localPlayerId?: string;
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
    isOpponentRolling,
    isRolling: propIsRolling,
    pendingSeedIndices,
    localPlayerId,
}) => {
    const navigation = useNavigation();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    
    // ─── Responsive Layout Calculations (Screen-Space Origin) ────────────────
    // Now using the full screen dimensions as the absolute coordinate root.
    const boardSize = windowWidth * 0.95 * 0.96;
    const boardX = (windowWidth - boardSize) / 2;
    const boardY = (windowHeight - boardSize) / 2;

    const [internalGameState, setInternalGameState] = useState<LudoGameState>(
        propGameState ?? initializeGame('blue', 'green', level || 2)
    );

    // --- Ref: tracks when player last applied a local move, to guard propGameState sync ---
    const lastLocalMoveTimeRef = useRef<number>(0);

    // --- Turn Transition: freeze dice display for 2s after a turn switch ---
    const [frozenDice, setFrozenDice] = useState<{ dice: number[]; diceUsed: boolean[]; playerIndex: number } | null>(null);
    const turnTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- Instat Visual Feedback for Selected Seed ---
    const [selectedSeedIndex, setSelectedSeedIndex] = useState<number | null>(null);

    useEffect(() => {
        // Clear highlight if turn passed or waiting for roll
        if (internalGameState.waitingForRoll) {
            setSelectedSeedIndex(null);
        }
    }, [internalGameState.waitingForRoll, internalGameState.currentPlayerIndex]);
    // Sync internal state with prop if controlled (online mode)
    useEffect(() => {
        if (propGameState) {
            // --- Detect opponent turn-switch (online) ---
            // If the opponent just made their last move, internalGameState still holds their
            // dice values. The new propGameState has dice=[] and it's now our turn.
            const wasOpponentTurn = internalGameState?.currentPlayerIndex !== 0;
            const isNowOurTurn = propGameState?.currentPlayerIndex === 0 && propGameState?.waitingForRoll;
            const opponentHadDice = (internalGameState?.dice?.length || 0) > 0;

            if (wasOpponentTurn && isNowOurTurn && opponentHadDice && !propGameState.winner && frozenDice === null) {
                // Freeze the opponent's dice on screen for 2s so the player can read the result
                setFrozenDice({
                    dice: internalGameState.dice || [],
                    diceUsed: (internalGameState.diceUsed || []).map(() => true),
                    playerIndex: internalGameState.currentPlayerIndex,
                });
                setInternalGameState(propGameState); // apply move position NOW
                if (turnTransitionTimerRef.current) clearTimeout(turnTransitionTimerRef.current);
                turnTransitionTimerRef.current = setTimeout(() => {
                    setFrozenDice(null);
                    turnTransitionTimerRef.current = null;
                }, 2000);
            } else {
                // CRITICAL: If dice arrived for US while we were "rolling", stop the optimistic state
                if (isNowOurTurn && propGameState.dice.length > 0 && !propGameState.waitingForRoll) {
                    setIsRolling(false);
                }
                setInternalGameState(propGameState);
            }
        }
    }, [propGameState]);


    // Clear frozen dice if the human player gets a new bonus roll (his own dice arrive)
    // Do NOT clear early just because the AI/opponent rolled — the 2s timer handles that.
    useEffect(() => {
        if (frozenDice !== null && !internalGameState.waitingForRoll && internalGameState.dice.length > 0 && internalGameState.currentPlayerIndex === 0) {
            setFrozenDice(null);
            if (turnTransitionTimerRef.current) {
                clearTimeout(turnTransitionTimerRef.current);
                turnTransitionTimerRef.current = null;
            }
        }
    }, [internalGameState.waitingForRoll, internalGameState.dice, internalGameState.currentPlayerIndex]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (turnTransitionTimerRef.current) {
                clearTimeout(turnTransitionTimerRef.current);
            }
        };
    }, []);

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
        const posMap: { [key: string]: { pos: number, land: number, delay: number, isActive: boolean, isCurrent: boolean }[] } = {};
        
        // Highlights should appear for whoever's turn it is, after they roll the dice
        const showTurnIndicators = !gameState.waitingForRoll && gameState.dice.length > 0 && !gameState.winner;
        const currentValidMoves = showTurnIndicators ? getValidMoves(gameState) : [];

        if (!gameState.players || !Array.isArray(gameState.players)) return posMap;

        gameState.players.forEach((p, pIdx) => {
            if (!p) return;
            const isOurTurn = pIdx === gameState.currentPlayerIndex;
            posMap[p.id] = (p.seeds || []).map((s, idx) => {
                const seedCanMove = isOurTurn && currentValidMoves.some((m: any) => m.seedIndex === idx);
                return {
                    pos: s.tileIndex,
                    land: s.landingIndex,
                    delay: s.animationDelay || 0,
                    isActive: !!seedCanMove,
                    isCurrent: isOurTurn
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

    const p1Score = useMemo(() => gameState.players[0]?.seeds?.filter((s:any) => s.zone === 'FINISH' && s.tileIndex === 56).length || 0, [gameState.players[0]?.seeds]);
    const p2Score = useMemo(() => gameState.players[1]?.seeds?.filter((s:any) => s.zone === 'FINISH' && s.tileIndex === 56).length || 0, [gameState.players[1]?.seeds]);

    const playerRank = useMemo(() => getRankFromRating(player.rating || 1200) || { icon: '🌱' }, [player.rating]);
    const opponentRank = useMemo(() => getRankFromRating(opponent.rating || 1500) || { icon: '🌱' }, [opponent.rating]);

    // --- Optimistic Dice Rolling State ---
    // Use prop if provided (online), otherwise manage locally (offline)
    const [localIsRolling, setLocalIsRolling] = useState(false);
    const isRolling = propIsRolling !== undefined ? propIsRolling : localIsRolling;
    const setIsRolling = propIsRolling !== undefined ? () => {} : setLocalIsRolling;

    // Emergency Failsafe: 3-second max duration (Reduced from 5s as per user requirement)
    useEffect(() => {
        if (isRolling) {
            const safetyTimeout = setTimeout(() => {
                if (propIsRolling === undefined) {
                    setLocalIsRolling(false);
                }
            }, 3000);
            return () => clearTimeout(safetyTimeout);
        }
    }, [isRolling, propIsRolling]);

    // Reset local rolling on turn change
    useEffect(() => {
        if (propIsRolling === undefined) {
            setLocalIsRolling(false);
        }
    }, [gameState.currentPlayerIndex, propIsRolling]);

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
                }, 2000); // 2s so the player can read the dice result before the turn passes
                return () => clearTimeout(timer);
            }
        }
    }, [gameState.waitingForRoll, gameState.winner, gameState.currentPlayerIndex, onMove, onPassTurn]);

    // AI Turn Loop
    useEffect(() => {
        // AI only plays in local computer games (no onMove prop)
        // Ensure AI waits if optimistic dice is still spinning or another action is blocked
        const isAiTurn = !onMove && gameState.currentPlayerIndex === 1 && !gameState.winner && !isRolling;
        if (isAiTurn) {
            // Short pause before AI rolls ("thinking" feel)
            const AI_ROLL_DELAY = 800;
            // After the dice appear, wait 2s so the player can read the result before AI moves
            const AI_MOVE_DELAY = 2000;
            if (gameState.waitingForRoll) {
                const timer = setTimeout(() => {
                    handleRollDice();
                }, AI_ROLL_DELAY);
                return () => clearTimeout(timer);
            } else {
                const timer = setTimeout(() => {
                    const moves = getValidMoves(gameState);
                    if (moves.length > 0) {
                        const aiMove = getComputerMove(gameState, level || 2);
                        if (aiMove) {
                            const newState = applyMove(gameState, aiMove);
                            const isTurnSwitch = newState.currentPlayerIndex !== gameState.currentPlayerIndex;

                            if (isTurnSwitch && !newState.winner) {
                                // Freeze AI's dice on screen for 2s so player can read the result
                                setFrozenDice({
                                    dice: gameState.dice,
                                    diceUsed: gameState.diceUsed.map(() => true),
                                    playerIndex: gameState.currentPlayerIndex,
                                });
                                setGameState(newState); // seed animates NOW
                                if (turnTransitionTimerRef.current) clearTimeout(turnTransitionTimerRef.current);
                                turnTransitionTimerRef.current = setTimeout(() => {
                                    setFrozenDice(null);
                                    turnTransitionTimerRef.current = null;
                                }, 2000);
                            } else {
                                // Bonus roll — no freeze, just apply and let AI loop roll again
                                setGameState(newState);
                            }
                        }
                    }
                }, AI_MOVE_DELAY);
                return () => clearTimeout(timer);
            }
        }
    }, [gameState, handleRollDice, level, onMove]);


    const handleBoardPress = useCallback((x: number, y: number, tappedSeed?: { playerId: string; seedIndex: number; position: number } | null) => {
        // Block input during turn transition animation
        if (frozenDice !== null) return;

        // Stale-tap guard: drop any tap if the game state is not ready for a move.
        // This prevents crashes when the server auto-played and switched turns while a tap was in-flight.
        if (!gameState || !gameState.diceUsed || !Array.isArray(gameState.diceUsed) || gameState.waitingForRoll) return;

        if (tappedSeed) {
            // Only allow tapping our own seeds
            // Tapped player id should match current player's id and it should be their turn
            const currentPlayerId = gameState.players[gameState.currentPlayerIndex].id;
            if (tappedSeed.playerId !== currentPlayerId) return;
            // Online mode: additional check we shouldn't tap during opponent's physical turn broadcast
            if (onMove && gameState.currentPlayerIndex !== (gameState.players[0].id === 'p1' ? 0 : 1)) {
                 // This guard is a bit flimsy without knowing local player index but works if human is always index 0
            }

            if (!gameState.waitingForRoll) {
                const moves = getValidMoves(gameState);
                const matchingMove = moves.find(move => move.seedIndex === tappedSeed.seedIndex);
                if (matchingMove) {
                    // Mark local move time (prevents propGameState sync from reverting)
                    lastLocalMoveTimeRef.current = Date.now();

                    if (onMove) {
                        // Online Play: Let LudoOnline.handleMove manage optimistic state via pendingStateRef.
                        // We ONLY mark the dice as used here so they grey out immediately.
                        // Applying the full applyMove here AND in handleMove caused a double-update
                        // that made LudoCoreUI's propGameState sync overwrite the local state on confirmation,
                        // triggering the visible jump + 3.5s rollback timer loop.
                        setInternalGameState(prevState => {
                            const newDiceUsed = [...(prevState.diceUsed || [])];
                            matchingMove.diceIndices.forEach((idx: number) => newDiceUsed[idx] = true);
                            return { ...prevState, diceUsed: newDiceUsed };
                        });

                        onMove(matchingMove as any);
                        return;
                    }

                    // Local / Computer Play: Apply move locally FIRST for instant animation
                    const newState = applyMove(gameState, matchingMove);

                    // Check if this move results in an opponent turn switch (no bonus roll)
                    const isTurnSwitch = newState.currentPlayerIndex !== gameState.currentPlayerIndex;

                    if (isTurnSwitch && !newState.winner) {
                        // Show the result (seed moved, dice visible) for 2 seconds before switching
                        setFrozenDice({
                            dice: gameState.dice,
                            diceUsed: gameState.diceUsed.map(() => true),
                            playerIndex: gameState.currentPlayerIndex,
                        });
                        setGameState(newState);

                        if (turnTransitionTimerRef.current) clearTimeout(turnTransitionTimerRef.current);
                        turnTransitionTimerRef.current = setTimeout(() => {
                            setFrozenDice(null);
                            turnTransitionTimerRef.current = null;
                        }, 2000);
                    } else {
                        setGameState(newState);
                    }
                }
            }
        }
    }, [gameState, onMove, frozenDice]);


    // Determine active color for persistent dice house
    const activePlayerColor = gameState.currentPlayerIndex === 0 ? 'blue' : 'green';

    // ── Setup Dice Animations for the Single-Canvas Board ────────────────────────
    const currentDice = frozenDice !== null ? frozenDice.dice : gameState.dice;
    const currentDiceUsed = frozenDice !== null ? frozenDice.diceUsed : gameState.diceUsed;
    const currentIsRolling = (gameState.currentPlayerIndex === 0 ? isRolling : !!isOpponentRolling) && frozenDice === null;
    const currentDiceCount = (gameState.level >= 3) ? 2 : ((frozenDice !== null ? frozenDice.dice : gameState.dice)?.length || 1);
    const currentActiveColor = frozenDice !== null ? (frozenDice.playerIndex === 0 ? 'blue' : 'green') : activePlayerColor;

    const diceAnimState = useDiceAnimations(currentDice, currentDiceCount, currentIsRolling);

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

            {/* Game Board (now also renders the dice visuals natively!) */}
            <View style={styles.boardContainer} pointerEvents="box-none" renderToHardwareTextureAndroid={false}>
                <LudoNativeBoard
                    onBoardPress={handleBoardPress}
                    positions={boardPositions}
                    level={level || gameState.level}
                    selectedSeedIndex={selectedSeedIndex}
                    pendingSeedIndices={pendingSeedIndices}
                    localPlayerId={localPlayerId}
                    boardX={boardX}
                    boardY={boardY}
                    boardSize={boardSize}
                />

                {/* Dice rendered as React Native Animated views — NOT inside Skia.
                    This prevents dice animations from forcing 60fps redraws of the
                    full-screen Skia Canvas, which crashed Samsung Exynos GPUs. */}
                {!gameState.winner && (
                    <LudoDiceOverlay
                        anim={diceAnimState}
                        activeColor={currentActiveColor}
                        show0={currentIsRolling || (currentDice.length > 0)}
                        show1={currentDiceCount > 1 && (currentIsRolling || currentDice.length > 1)}
                        isRolling={currentIsRolling}
                        diceUsed={currentDiceUsed}
                        boardX={boardX}
                        boardY={boardY}
                        boardSize={boardSize}
                    />
                )}
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

            {/* ── Dice House Touch Target (No Canvas, just buttons & timers) ── */}
            <DiceHouseMaster
                waitingForRoll={frozenDice !== null ? false : gameState.waitingForRoll}
                onPress={handleRollDice}
                rankIcon={
                    frozenDice !== null
                        ? (frozenDice.playerIndex === 0 ? playerRank.icon : opponentRank.icon)
                        : (gameState.currentPlayerIndex === 0 ? playerRank.icon : opponentRank.icon)
                }
                disabled={frozenDice !== null || gameState.currentPlayerIndex !== 0}
                isRolling={currentIsRolling}
                activeColor={currentActiveColor}
                timerProps={frozenDice !== null ? undefined : (timerSync ? {
                    isActive: true,
                    ...timerSync
                } : undefined)}
                isShown={!gameState.winner}
                boardX={boardX}
                boardY={boardY}
                boardSize={boardSize}
                style={{ zIndex: 999 }} // Ensures it's always tappable
            />

            <View style={styles.soundControlContainer} pointerEvents="box-none">
                <SoundDropdownPanel gameId="ludo" />
            </View>
        </View>
    );
};

export default LudoCoreUI;