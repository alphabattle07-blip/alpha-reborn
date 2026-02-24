export type PlayerColor = 'red' | 'yellow' | 'green' | 'blue';

export interface LudoSeed {
    id: string;
    position: number;
    // -1 = House
    // 0 - 55 = Active Path (Unique to the player color)
    // 56 = Finished (Goal)
    landingPos: number; // The tile index it lands on before any rules like "Capture" jump it to another spot
    animationDelay: number; // Delay in ms before starting the movement animation
}

export interface LudoPlayer {
    id: string;
    color: PlayerColor;
    seeds: LudoSeed[];
}

export interface LudoGameState {
    players: LudoPlayer[];
    currentPlayerIndex: number;
    dice: number[];
    diceUsed: boolean[];
    waitingForRoll: boolean;
    winner: string | null;
    log: string[];
    level: number;
    stateVersion?: number;
}

const HOUSE_POS = -1;
const FINISH_POS = 56;

export const initializeGame = (p1Color: PlayerColor = 'red', p2Color: PlayerColor = 'yellow', level: number = 2): LudoGameState => {
    return {
        players: [
            {
                id: 'p1',
                color: p1Color,
                seeds: Array.from({ length: 4 }).map((_, i) => ({ id: `${p1Color}-${i}`, position: HOUSE_POS, landingPos: HOUSE_POS, animationDelay: 0 })),
            },
            {
                id: 'p2',
                color: p2Color,
                seeds: Array.from({ length: 4 }).map((_, i) => ({ id: `${p2Color}-${i}`, position: HOUSE_POS, landingPos: HOUSE_POS, animationDelay: 0 })),
            },
        ],
        currentPlayerIndex: 0,
        dice: [],
        diceUsed: [],
        waitingForRoll: true,
        winner: null,
        log: ['Game Started'],
        level: level,
    };
};

export const rollDice = (state: LudoGameState): LudoGameState => {
    if (!state.waitingForRoll) return state;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

    const dice = state.level >= 3 ? [d1, d2] : [d1];
    const diceUsed = state.level >= 3 ? [false, false] : [false];

    return {
        ...state,
        dice,
        diceUsed,
        waitingForRoll: false,
        log: [...state.log, `Rolled [${dice.join(', ')}]`],
    };
};

export interface MoveAction {
    seedIndex: number;
    diceIndices: number[];
    targetPos: number;
    isCapture: boolean;
}

export const getValidMoves = (state: LudoGameState): MoveAction[] => {
    if (state.waitingForRoll || state.winner) return [];

    const player = state.players[state.currentPlayerIndex];
    const singleMoves: MoveAction[] = [];

    // 1. Generate all possible Single Die moves first
    state.dice.forEach((die, dIdx) => {
        if (state.diceUsed[dIdx]) return;

        player.seeds.forEach((seed, sIdx) => {
            // A. Move out of House
            if (seed.position === HOUSE_POS) {
                if (die === 6) {
                    singleMoves.push({ seedIndex: sIdx, diceIndices: [dIdx], targetPos: 0, isCapture: false });
                }
                return;
            }

            // B. Already Finished
            if (seed.position === FINISH_POS) return;

            // C. Move on Track
            const nextPos = seed.position + die;
            if (nextPos <= FINISH_POS) {
                // Check capture logic for single move
                let isCapture = false;
                if (nextPos >= 0 && nextPos <= 51) {
                    const opponentIndex = (state.currentPlayerIndex + 1) % 2;
                    const opponent = state.players[opponentIndex];
                    const { LudoBoardData } = require('./LudoCoordinates');
                    const activePlayerPath = LudoBoardData.getPathForColor(player.color);
                    const targetCoord = activePlayerPath[nextPos];

                    if (targetCoord) {
                        const isSafeTile = state.level < 3 && LudoBoardData.shieldPositions.some((pos: any) =>
                            Math.abs(pos.x - targetCoord.x) < 0.01 && Math.abs(pos.y - targetCoord.y) < 0.01
                        );

                        if (!isSafeTile) {
                            isCapture = opponent.seeds.some(oppSeed => {
                                if (oppSeed.position < 0 || oppSeed.position >= 52) return false;
                                const opponentPath = LudoBoardData.getPathForColor(opponent.color);
                                const oppCoord = opponentPath[oppSeed.position];
                                if (!oppCoord) return false;
                                return Math.abs(targetCoord.x - oppCoord.x) < 0.01 &&
                                    Math.abs(targetCoord.y - oppCoord.y) < 0.01;
                            });
                        }
                    }
                }
                singleMoves.push({ seedIndex: sIdx, diceIndices: [dIdx], targetPos: nextPos, isCapture });
            }
        });
    });

    // 2. CHECK FOR COMBINATION LOGIC
    // We only combine if:
    // a. We have 2 unused dice (implied level >= 3)
    // b. Exactly ONE seed is capable of moving (meaning no other seed can use the "remaining" die)
    const activeDiceCount = state.dice.filter((_, i) => !state.diceUsed[i]).length;

    if (activeDiceCount === 2) {
        // Get unique seed indices that have valid moves
        const movableSeedIndices = [...new Set(singleMoves.map(m => m.seedIndex))];

        if (movableSeedIndices.length === 1) {
            const seedIndex = movableSeedIndices[0];
            const seed = player.seeds[seedIndex];

            // EXCEPTION: If the seed is in the HOUSE, we do NOT combine (Move Out + Move is sequential, not atomic)
            if (seed.position !== HOUSE_POS) {

                // Calculate Combined Move
                const totalDiceValue = state.dice[0] + state.dice[1];
                const combinedTarget = seed.position + totalDiceValue;

                if (combinedTarget <= FINISH_POS) {
                    // Recalculate Capture for the FINAL destination
                    let isCapture = false;
                    if (combinedTarget >= 0 && combinedTarget <= 51) {
                        const opponentIndex = (state.currentPlayerIndex + 1) % 2;
                        const opponent = state.players[opponentIndex];
                        const { LudoBoardData } = require('./LudoCoordinates');
                        const activePlayerPath = LudoBoardData.getPathForColor(player.color);
                        const targetCoord = activePlayerPath[combinedTarget];

                        if (targetCoord) {
                            const isSafeTile = state.level < 3 && LudoBoardData.shieldPositions.some((pos: any) =>
                                Math.abs(pos.x - targetCoord.x) < 0.01 && Math.abs(pos.y - targetCoord.y) < 0.01
                            );
                            if (!isSafeTile) {
                                isCapture = opponent.seeds.some(oppSeed => {
                                    if (oppSeed.position < 0 || oppSeed.position >= 52) return false;
                                    const opponentPath = LudoBoardData.getPathForColor(opponent.color);
                                    const oppCoord = opponentPath[oppSeed.position];
                                    if (!oppCoord) return false;
                                    return Math.abs(targetCoord.x - oppCoord.x) < 0.01 &&
                                        Math.abs(targetCoord.y - oppCoord.y) < 0.01;
                                });
                            }
                        }
                    }

                    // Return ONLY the combined move (forces the player to move the full distance)
                    return [{
                        seedIndex: seedIndex,
                        diceIndices: [0, 1], // Mark both dice as used
                        targetPos: combinedTarget,
                        isCapture: isCapture
                    }];
                }
            }
        }
    }

    return singleMoves;
};

export const applyMove = (state: LudoGameState, move: MoveAction): LudoGameState => {
    const player = state.players[state.currentPlayerIndex];
    const newDiceUsed = [...state.diceUsed];
    move.diceIndices.forEach(idx => newDiceUsed[idx] = true);

    const newPlayers = JSON.parse(JSON.stringify(state.players));
    const activePlayer = newPlayers[state.currentPlayerIndex];
    const targetSeed = activePlayer.seeds[move.seedIndex];

    // Always track landing position (where the move logically ends)
    const oldPosition = targetSeed.position;
    targetSeed.landingPos = move.targetPos;
    targetSeed.animationDelay = 0; // Reset delay for the moving seed
    // Set the new position for the moving seed
    targetSeed.position = move.targetPos;

    // --- CAPTURE LOGIC ---
    // Only check for captures on the main track (positions 0-51), not in victory lane (52-57) or finish (58)
    if (move.targetPos >= 0 && move.targetPos <= 51) {
        const opponentIndex = (state.currentPlayerIndex + 1) % 2;
        const opponent = newPlayers[opponentIndex];

        // Get the physical coordinates of the capturing seed's target position
        const { LudoBoardData } = require('./LudoCoordinates');
        const activePlayerPath = LudoBoardData.getPathForColor(activePlayer.color);
        const targetCoord = activePlayerPath[move.targetPos];

        if (targetCoord) {
            // Check if this is a safe tile (Shield) - only for level < 3
            const isSafeTile = state.level < 3 && LudoBoardData.shieldPositions.some((pos: any) => {
                const tolerance = 0.01;
                return Math.abs(pos.x - targetCoord.x) < tolerance &&
                    Math.abs(pos.y - targetCoord.y) < tolerance;
            });

            if (!isSafeTile) {
                // Check each opponent seed - find only the first one to capture
                const capturedOpponentSeed = opponent.seeds.find((oppSeed: LudoSeed) => {
                    // Skip seeds in house, finished, or in victory lane
                    if (oppSeed.position < 0 || oppSeed.position >= 52) return false;

                    // Get opponent seed's physical coordinates
                    const opponentPath = LudoBoardData.getPathForColor(opponent.color);
                    const oppCoord = opponentPath[oppSeed.position];

                    if (oppCoord) {
                        // Compare physical coordinates (with small tolerance for floating point)
                        const tolerance = 0.01;
                        const sameX = Math.abs(targetCoord.x - oppCoord.x) < tolerance;
                        const sameY = Math.abs(targetCoord.y - oppCoord.y) < tolerance;
                        return sameX && sameY;
                    }
                    return false;
                });

                if (capturedOpponentSeed) {
                    console.log(`CAPTURE! Player ${activePlayer.id} captured opponent seed ${capturedOpponentSeed.id} at position ${capturedOpponentSeed.position}`);
                    capturedOpponentSeed.position = HOUSE_POS; // Send opponent seed back to house
                    capturedOpponentSeed.landingPos = HOUSE_POS;

                    // Calculate delay based on how many steps the capturing seed takes
                    const steps = oldPosition === HOUSE_POS ? 1 : Math.max(0, move.targetPos - oldPosition);
                    // 200ms per tile (TILE_ANIMATION_DURATION)
                    capturedOpponentSeed.animationDelay = steps * 200;

                    // AS PER AGGRESSIVE MODE: Capturing seed moves to finish! (Only for Warrior level and above)
                    if (state.level >= 3) {
                        targetSeed.position = FINISH_POS;
                    }
                }
            }
        }
    }

    // Check Win
    let winner = state.winner;
    if (activePlayer.seeds.every((s: LudoSeed) => s.position === FINISH_POS)) {
        winner = activePlayer.id;
    }

    // Turn Logic
    let nextTurn = state.currentPlayerIndex;
    let waiting = state.waitingForRoll;
    let resetDice = newDiceUsed;

    // If all dice are used:
    if (resetDice.every(u => u)) {

        // --- NEW RULE: ONLY 6 AND 6 GIVES ANOTHER TURN (Multi-die) ---
        // --- OR ROLLED 6 (Single-die) ---
        // --- OR CAPTURE (Only for level 1 & 2) ---
        const rolledDoubleSix = state.level >= 3 && state.dice[0] === 6 && state.dice[1] === 6;
        const rolledSingleSix = state.level < 3 && state.dice[0] === 6;
        const captureBonus = move.isCapture && state.level < 3;

        if ((rolledDoubleSix || rolledSingleSix || captureBonus) && !winner) {
            // BONUS TURN (Same Player)
            waiting = true;
            resetDice = state.level >= 3 ? [false, false] : [false];
            // nextTurn remains current
        } else {
            // PASS TURN
            nextTurn = (state.currentPlayerIndex + 1) % 2;
            waiting = true;
            resetDice = state.level >= 3 ? [false, false] : [false];
        }
    } else {
        // STILL MOVING (One die remaining)
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
        log: [...state.log, `Moved seed`],
    };
};

export const passTurn = (state: LudoGameState): LudoGameState => {
    return {
        ...state,
        currentPlayerIndex: (state.currentPlayerIndex + 1) % 2,
        waitingForRoll: true,
        diceUsed: state.level >= 3 ? [false, false] : [false],
        dice: [],
        log: [...state.log, `Turn passed`],
    };
};