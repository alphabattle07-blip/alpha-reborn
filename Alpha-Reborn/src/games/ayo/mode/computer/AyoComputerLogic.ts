// AyoComputerLogic.ts - computer opponent logic
import { AyoGameState, initializeGame, calculateMoveResult } from "../core/AyoCoreLogic";
import {
  randomMove,
  greedyMove,
  captureMove,
  scatterMove,
  alphaMove,
} from "./aiStrategies";

export type ComputerLevel = 1 | 2 | 3 | 4 | 5;

export interface AyoComputerState {
  game: AyoGameState;
  level: ComputerLevel;
  isPlayerWinner: boolean | null;
  reward: number;
}

export function initializeComputerGame(level: ComputerLevel): AyoComputerState {
  return {
    game: initializeGame(),
    level,
    isPlayerWinner: null,
    reward: 0,
  };
}

export function playComputerTurn(
  state: AyoComputerState,
  pitIndex: number
): AyoComputerState {
  const { nextState: game } = calculateMoveResult(state.game, pitIndex);

  const isPlayerWinner =
    game.scores[1] > 24
      ? true
      : game.scores[2] > 24
      ? false
      : null;
  const reward = isPlayerWinner ? 10 * state.level : 0;

  return { ...state, game, isPlayerWinner, reward };
}

export function getComputerMove(game: AyoGameState, level: ComputerLevel): number {
  switch (level) {
    case 1:
      return randomMove(game);
    case 2:
      return greedyMove(game);
    case 3:
      return captureMove(game);
    case 4:
      return scatterMove(game);
    case 5:
      return alphaMove(game, 4);
    default:
      return randomMove(game);
  }
}
