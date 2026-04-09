export const LOGIC_VERSION = "v1.0.1";

export type PlayerColor = 'red' | 'yellow' | 'green' | 'blue';
export type LudoZone = 'HOME' | 'TRACK' | 'FINISH';

export const START_OFFSETS: Record<PlayerColor, number> = {
    red: 0,
    green: 13,
    yellow: 26,
    blue: 39
};

export const SAFE_TILES = [0, 8, 13, 21, 26, 34, 39, 47];

export const getAbsoluteIndex = (color: PlayerColor, tileIndex: number): number => {
    return (START_OFFSETS[color] + tileIndex) % 52;
};

export interface LudoSeed {
    id: string;
    zone: LudoZone;
    tileIndex: number;
    landingZone: LudoZone;
    landingIndex: number;
    animationDelay: number;
}

export interface LudoPlayer {
    id: string;
    color: PlayerColor;
    seeds: LudoSeed[];
    lastProcessedMoveId?: string;
    consecutiveNoSixes?: number;
    timeouts?: number;
}

export interface LudoGameState {
    players: LudoPlayer[];
    currentPlayerIndex: number;
    dice: number[];
    diceUsed: boolean[];
    waitingForRoll: boolean;
    winner: string | null;
    log?: string[]; 
    level: number;
    stateVersion?: number;
    eventId?: number;
    pendingMoveId?: string;
}

export const initializeGame = (p1Color: PlayerColor = 'red', p2Color: PlayerColor = 'yellow', level: number = 1): LudoGameState => {
    return {
        players: [
            {
                id: 'p1',
                color: p1Color,
                seeds: Array.from({ length: 4 }).map((_, i) => ({ 
                    id: `${p1Color}-${i}`, 
                    zone: 'HOME', 
                    tileIndex: -1, 
                    landingZone: 'HOME', 
                    landingIndex: -1, 
                    animationDelay: 0 
                })),
                consecutiveNoSixes: 0,
            },
            {
                id: 'p2',
                color: p2Color,
                seeds: Array.from({ length: 4 }).map((_, i) => ({ 
                    id: `${p2Color}-${i}`, 
                    zone: 'HOME', 
                    tileIndex: -1, 
                    landingZone: 'HOME', 
                    landingIndex: -1, 
                    animationDelay: 0 
                })),
                consecutiveNoSixes: 0,
            },
        ],
        currentPlayerIndex: 0,
        dice: [],
        diceUsed: [],
        waitingForRoll: true,
        winner: null,
        level: level,
        stateVersion: 0,
        eventId: 0
    };
};

export const rollDice = (state: LudoGameState): LudoGameState => {
    if (!state.waitingForRoll) return state;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    let dice = state.level >= 3 ? [d1, d2] : [d1];
    const diceUsed = state.level >= 3 ? [false, false] : [false];

    const newPlayers = JSON.parse(JSON.stringify(state.players));
    const player = newPlayers[state.currentPlayerIndex];
    let consecutiveNoSixes = player.consecutiveNoSixes || 0;
    
    const activeCount = player.seeds.filter((s: LudoSeed) => s.zone !== 'HOME' && !(s.zone === 'FINISH' && s.tileIndex === 56)).length;

    if (activeCount === 0) {
        if (!dice.includes(6)) {
            consecutiveNoSixes++;
            let forceSix = false;
            if (consecutiveNoSixes >= 5) forceSix = true;
            else if (consecutiveNoSixes === 4 && Math.random() < 0.40) forceSix = true;
            else if (consecutiveNoSixes === 3 && Math.random() < 0.20) forceSix = true;
            else if (consecutiveNoSixes === 2 && Math.random() < 0.10) forceSix = true;

            if (forceSix) {
                dice[0] = 6;
                consecutiveNoSixes = 0;
            }
        } else {
            consecutiveNoSixes = 0; 
        }
    } else {
        consecutiveNoSixes = 0;
    }
    
    player.consecutiveNoSixes = consecutiveNoSixes;

    return {
        ...state,
        players: newPlayers,
        dice,
        diceUsed,
        waitingForRoll: false,
        stateVersion: (state.stateVersion || 0) + 1,
        eventId: (state.eventId || 0) + 1,
    };
};

export interface MoveAction {
    seedIndex: number;
    diceIndices: number[];
    targetZone: LudoZone;
    targetPos: number;
    isCapture: boolean;
}

const pushSingleMove = (state: LudoGameState, singleMoves: MoveAction[], player: LudoPlayer, sIdx: number, dIdx: number, nextPos: number) => {
    let nextZone: LudoZone = 'TRACK';
    if (nextPos > 51) {
        nextZone = 'FINISH';
    }

    if (nextPos <= 56) {
        let isCapture = false;

        if (nextZone === 'TRACK') {
            const opponentIndex = (state.currentPlayerIndex + 1) % 2;
            const opponent = state.players[opponentIndex];
            
            const absIndex = getAbsoluteIndex(player.color, nextPos);
            const isSafeTile = state.level < 3 && SAFE_TILES.includes(absIndex);

            if (!isSafeTile) {
                isCapture = opponent.seeds.some(oppSeed => {
                    if (oppSeed.zone !== 'TRACK') return false;
                    return absIndex === getAbsoluteIndex(opponent.color, oppSeed.tileIndex);
                });
            }
        }
        
        singleMoves.push({ 
            seedIndex: sIdx, 
            diceIndices: [dIdx], 
            targetZone: nextZone, 
            targetPos: nextPos, 
            isCapture 
        });
    }
};

export const getValidMoves = (state: LudoGameState): MoveAction[] => {
    if (state.waitingForRoll || state.winner) return [];
    if (!state.dice || !state.diceUsed) return []; // Defensive: corrupted state from partial server event

    const player = state.players[state.currentPlayerIndex];
    const singleMoves: MoveAction[] = [];

    state.dice.forEach((die, dIdx) => {
        if (state.diceUsed[dIdx]) return;

        player.seeds.forEach((seed, sIdx) => {
            if (seed.zone === 'HOME') {
                if (die === 6) {
                    singleMoves.push({ seedIndex: sIdx, diceIndices: [dIdx], targetZone: 'TRACK', targetPos: 0, isCapture: false });
                }
                return;
            }

            if (seed.zone === 'FINISH' && seed.tileIndex === 56) return;

            const nextPos = seed.tileIndex + die;
            pushSingleMove(state, singleMoves, player, sIdx, dIdx, nextPos);
        });
    });

    const activeDiceCount = state.dice.filter((_, i) => !state.diceUsed[i]).length;
    if (activeDiceCount === 2) {
        const d0_moves = singleMoves.filter(m => m.diceIndices.includes(0));
        const d1_moves = singleMoves.filter(m => m.diceIndices.includes(1));
        const movableSeedIndices = [...new Set(singleMoves.map(m => m.seedIndex))];

        const canSplit = movableSeedIndices.length > 1 && d0_moves.length > 0 && d1_moves.length > 0;

        if (!canSplit) {
            const combinedMoves = [];
            for (const seedIndex of movableSeedIndices) {
                const seed = player.seeds[seedIndex];
                let combinedTarget: number | undefined;

                if (seed.zone === 'HOME') {
                    if (state.dice.includes(6)) {
                        const totalDiceValue = state.dice[0] + state.dice[1];
                        combinedTarget = totalDiceValue - 6;
                    }
                } else {
                    const totalDiceValue = state.dice[0] + state.dice[1];
                    combinedTarget = seed.tileIndex + totalDiceValue;
                }

                if (combinedTarget !== undefined && combinedTarget <= 56) {
                    let nextZone: LudoZone = combinedTarget > 51 ? 'FINISH' : 'TRACK';
                    let isCapture = false;

                    if (nextZone === 'TRACK') {
                        const opponentIndex = (state.currentPlayerIndex + 1) % 2;
                        const opponent = state.players[opponentIndex];
                        const absIndex = getAbsoluteIndex(player.color, combinedTarget);
                        const isSafeTile = state.level < 3 && SAFE_TILES.includes(absIndex);

                        if (!isSafeTile) {
                            isCapture = opponent.seeds.some(oppSeed => {
                                if (oppSeed.zone !== 'TRACK') return false;
                                return absIndex === getAbsoluteIndex(opponent.color, oppSeed.tileIndex);
                            });
                        }
                    }

                    combinedMoves.push({
                        seedIndex: seedIndex,
                        diceIndices: [0, 1], 
                        targetZone: nextZone,
                        targetPos: combinedTarget,
                        isCapture: isCapture
                    });
                }
            }
            if (combinedMoves.length > 0) return combinedMoves;
        }
    }

    return singleMoves;
};

export const applyMove = (state: LudoGameState, move: MoveAction): LudoGameState => {
    if (!state || !state.players || !state.diceUsed || !move || !move.diceIndices) {
        return state;
    }

    const player = state.players[state.currentPlayerIndex];
    if (!player || !player.seeds) return state;

    const newDiceUsed = [...state.diceUsed];
    move.diceIndices.forEach(idx => newDiceUsed[idx] = true);

    const newPlayers = JSON.parse(JSON.stringify(state.players));
    const activePlayer = newPlayers[state.currentPlayerIndex];
    const targetSeed = activePlayer.seeds[move.seedIndex];

    if (!targetSeed) return state;

    const oldPosition = targetSeed.tileIndex;
    targetSeed.landingZone = move.targetZone;
    targetSeed.landingIndex = move.targetPos;
    targetSeed.animationDelay = 0;
    
    targetSeed.zone = move.targetZone;
    targetSeed.tileIndex = move.targetPos;

    let stateChanged = true;

    if (move.targetZone === 'TRACK') {
        const opponentIndex = (state.currentPlayerIndex + 1) % 2;
        const opponent = newPlayers[opponentIndex];

        const absIndex = getAbsoluteIndex(activePlayer.color, move.targetPos);
        const isSafeTile = state.level < 3 && SAFE_TILES.includes(absIndex);

        if (!isSafeTile) {
            const capturedOpponentSeed = opponent.seeds.find((oppSeed: LudoSeed) => {
                if (oppSeed.zone !== 'TRACK') return false;
                return absIndex === getAbsoluteIndex(opponent.color, oppSeed.tileIndex);
            });

            if (capturedOpponentSeed) {
                capturedOpponentSeed.zone = 'HOME';
                capturedOpponentSeed.tileIndex = -1;
                capturedOpponentSeed.landingZone = 'HOME';
                capturedOpponentSeed.landingIndex = -1;

                const steps = oldPosition === -1 ? 1 : Math.max(0, move.targetPos - oldPosition);
                capturedOpponentSeed.animationDelay = steps * 200;

                if (state.level >= 3) {
                    targetSeed.zone = 'FINISH';
                    targetSeed.tileIndex = 56;
                }
            }
        }
    }

    let winner = state.winner;
    if (activePlayer.seeds.every((s: LudoSeed) => s.zone === 'FINISH' && s.tileIndex === 56)) {
        winner = activePlayer.id;
    }

    let nextTurn = state.currentPlayerIndex;
    let waiting = state.waitingForRoll;
    let resetDice = newDiceUsed;

    if (resetDice.every(u => u)) {
        const rolledDoubleSix = state.level >= 3 && state.dice[0] === 6 && state.dice[1] === 6;
        const rolledSingleSix = state.level < 3 && state.dice[0] === 6;
        const captureBonus = move.isCapture && state.level < 3;

        if ((rolledDoubleSix || rolledSingleSix || captureBonus) && !winner) {
            waiting = true;
            resetDice = state.level >= 3 ? [false, false] : [false];
        } else {
            nextTurn = (state.currentPlayerIndex + 1) % 2;
            waiting = true;
            resetDice = state.level >= 3 ? [false, false] : [false];
        }
    } else {
        waiting = false;
    }

    return {
        ...state,
        players: newPlayers,
        currentPlayerIndex: nextTurn,
        diceUsed: resetDice,
        waitingForRoll: waiting,
        dice: waiting ? [] : state.dice,
        winner: winner,
        stateVersion: stateChanged ? (state.stateVersion || 0) + 1 : state.stateVersion,
        eventId: (state.eventId || 0) + 1,
    };
};

export const passTurn = (state: LudoGameState): LudoGameState => {
    return {
        ...state,
        currentPlayerIndex: (state.currentPlayerIndex + 1) % 2,
        waitingForRoll: true,
        diceUsed: state.level >= 3 ? [false, false] : [false],
        dice: [],
        stateVersion: (state.stateVersion || 0) + 1,
        eventId: (state.eventId || 0) + 1,
    };
};