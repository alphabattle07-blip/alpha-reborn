// ../computer/LudoComputerLogic.ts
import { LudoGameState, MoveAction, getValidMoves } from "../core/ui/LudoGameLogic"
// Level 1: Random
// Level 2: Prioritize Captures
// Level 3: Prioritize Captures + Safety (simple version)

export const getComputerMove = (gameState: LudoGameState, level: number = 2): MoveAction | null => {
    const validMoves = getValidMoves(gameState);
    
    if (validMoves.length === 0) return null;

    // Level 1: Pure Random
    if (level === 1) {
        const randomIndex = Math.floor(Math.random() * validMoves.length);
        return validMoves[randomIndex];
    }

    // Level 2: Aggressive (Always capture if possible)
    if (level >= 2) {
        const captureMove = validMoves.find(m => m.isCapture);
        if (captureMove) return captureMove;

        // If no capture, prioritize moving out of house (6)
        const exitMove = validMoves.find(m => m.targetPos !== -1 && gameState.players[gameState.currentPlayerIndex].seeds[m.seedIndex].position === -1);
        if (exitMove) return exitMove;

        // Otherwise random
        const randomIndex = Math.floor(Math.random() * validMoves.length);
        return validMoves[randomIndex];
    }

    return validMoves[0];
};