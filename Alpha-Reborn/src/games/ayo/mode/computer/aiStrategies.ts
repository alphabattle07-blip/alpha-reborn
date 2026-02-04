// aiStrategies.ts - AI strategies implementation
import { AyoGameState, PLAYER_ONE_PITS, PLAYER_TWO_PITS, calculateMoveResult } from "../core/AyoCoreLogic";

export function getValidMoves(game: AyoGameState): number[] {
  const side = game.currentPlayer === 1 ? PLAYER_ONE_PITS : PLAYER_TWO_PITS;
  return side.filter((idx) => game.board[idx] > 0);
}

export function randomMove(game: AyoGameState): number {
  const validMoves = getValidMoves(game);
  return validMoves[Math.floor(Math.random() * validMoves.length)];
}

export function greedyMove(game: AyoGameState): number {
  const validMoves = getValidMoves(game);
  return validMoves.reduce((best, curr) =>
    game.board[curr] > game.board[best] ? curr : best
  );
}

export function captureMove(game: AyoGameState): number {
  const validMoves = getValidMoves(game);
  const opponentStart = game.currentPlayer === 1 ? 6 : 0;
  const found = validMoves.find((move) => ((move + game.board[move]) % 12) >= opponentStart && ((move + game.board[move]) % 12) < opponentStart + 6);
  return found ?? randomMove(game);
}

export function scatterMove(game: AyoGameState): number {
  const validMoves = getValidMoves(game);

  const ownSideStart = game.currentPlayer === 1 ? 0 : 6;
  const safeMove = validMoves.find(
    (move) => {
      const lastIdx = (move + game.board[move]) % 12;
      return lastIdx >= ownSideStart && lastIdx < ownSideStart + 6;
    }
  );

  return safeMove ?? greedyMove(game);
}

function evaluateGame(game: AyoGameState, player: 1 | 2): number {
  const opponent = player === 1 ? 2 : 1;
  const scoreDiff = (game.scores[player] - game.scores[opponent]) * 10;

  const playerPits = player === 1 ? PLAYER_ONE_PITS : PLAYER_TWO_PITS;
  const opponentPits = player === 1 ? PLAYER_TWO_PITS : PLAYER_ONE_PITS;
  const seedsPlayerSide = playerPits.reduce((s, i) => s + game.board[i], 0);
  const seedsOpponentSide = opponentPits.reduce((s, i) => s + game.board[i], 0);
  const sideDiff = seedsPlayerSide - seedsOpponentSide;

  return scoreDiff + sideDiff;
}

function minimaxAlphaBeta(
  game: AyoGameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  player: 1 | 2
): number {
  const isTerminal = game.isGameOver || game.board.every((p) => p === 0);
  if (depth === 0 || isTerminal) {
    return evaluateGame(game, player);
  }

  const moves = getValidMoves(game);
  if (moves.length === 0) {
    return evaluateGame(game, player);
  }

  if (maximizing) {
    let value = -Infinity;
    for (const move of moves) {
      const { nextState } = calculateMoveResult(game, move);
      const evalScore = minimaxAlphaBeta(nextState, depth - 1, alpha, beta, false, player);
      value = Math.max(value, evalScore);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  } else {
    let value = Infinity;
    for (const move of moves) {
      const { nextState } = calculateMoveResult(game, move);
      const evalScore = minimaxAlphaBeta(nextState, depth - 1, alpha, beta, true, player);
      value = Math.min(value, evalScore);
      beta = Math.min(beta, value);
      if (beta <= alpha) break;
    }
    return value;
  }
}

export function alphaMove(game: AyoGameState, depth = 4): number {
  const validMoves = getValidMoves(game);
  const player = game.currentPlayer;
  let bestMove = validMoves[0];
  let bestScore = -Infinity;

  for (const move of validMoves) {
    const { nextState } = calculateMoveResult(game, move);
    const score = minimaxAlphaBeta(nextState, depth - 1, -Infinity, Infinity, false, player);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}
