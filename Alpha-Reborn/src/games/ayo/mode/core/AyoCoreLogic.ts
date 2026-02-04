// AyoCoreLogic.ts - core game logic
export interface AyoGameState {
  board: number[];
  scores: { [key: number]: number };
  currentPlayer: 1 | 2;
  isGameOver: boolean;
}

export interface Capture {
  pitIndex: number;
  awardedTo: 1 | 2;
}

export interface MoveResult {
  nextState: AyoGameState;
  animationPaths: number[][];
  captures: Capture[];
}

export const PLAYER_ONE_PITS = [0, 1, 2, 3, 4, 5];
export const PLAYER_TWO_PITS = [6, 7, 8, 9, 10, 11];
export const CCW_ORDER = [5, 4, 3, 2, 1, 0, 6, 7, 8, 9, 10, 11];

const getNextPit = (currentIndex: number): number => {
  const currentPos = CCW_ORDER.indexOf(currentIndex);
  const nextPos = (currentPos + 1) % 12;
  return CCW_ORDER[nextPos];
};

export const initializeGame = (): AyoGameState => {
  const startingPlayer = Math.random() < 0.5 ? 1 : 2;
  return {
    board: Array(12).fill(4),
    scores: { 1: 0, 2: 0 },
    currentPlayer: startingPlayer,
    isGameOver: false,
  };
};

export const calculateMoveResult = (
  state: AyoGameState,
  pitIndex: number
): MoveResult => {
  let { board, scores, currentPlayer } = state;
  board = [...board];
  scores = { ...scores };

  let seeds = board[pitIndex];
  if (
    seeds === 0 ||
    (currentPlayer === 1 && !PLAYER_ONE_PITS.includes(pitIndex)) ||
    (currentPlayer === 2 && !PLAYER_TWO_PITS.includes(pitIndex))
  ) {
    return { nextState: state, animationPaths: [], captures: [] };
  }

  const initialTotalSeeds = board.reduce((a, b) => a + b, 0);
  const isEightSeedRuleActive = initialTotalSeeds === 8;

  const animationPaths: number[][] = [];
  const captures: Capture[] = [];
  let currentIndex = pitIndex;

  const handleCapture = (pitIdx: number, isLastSeedOfSow: boolean) => {
    const pitOwner: 1 | 2 = PLAYER_ONE_PITS.includes(pitIdx) ? 1 : 2;
    let awardedTo: 1 | 2 = isLastSeedOfSow && pitOwner !== currentPlayer ? currentPlayer : pitOwner;
    captures.push({ pitIndex: pitIdx, awardedTo });
    board[pitIdx] = 0;
  };

  // Initial sow
  let currentPath: number[] = [pitIndex];
  board[pitIndex] = 0;
  while (seeds > 0) {
    currentIndex = getNextPit(currentIndex);
    board[currentIndex]++;
    seeds--;
    currentPath.push(currentIndex);
    if (board[currentIndex] === 4) {
      if (isEightSeedRuleActive) {
        scores[currentPlayer] += 8;
        return {
          nextState: { ...state, scores, board: Array(12).fill(0), isGameOver: true },
          animationPaths: [currentPath],
          captures: [],
        };
      }
      handleCapture(currentIndex, seeds === 0);
    }
  }
  animationPaths.push(currentPath);

  // Relay sowing
  let shouldRelay = board[currentIndex] > 1;
  while (shouldRelay) {
    seeds = board[currentIndex];
    currentPath = [currentIndex];
    board[currentIndex] = 0;
    while (seeds > 0) {
      currentIndex = getNextPit(currentIndex);
      board[currentIndex]++;
      seeds--;
      currentPath.push(currentIndex);
      if (board[currentIndex] === 4) {
        handleCapture(currentIndex, seeds === 0);
      }
    }
    animationPaths.push(currentPath);
    const wasLastPitCaptured = captures.some(c => c.pitIndex === currentIndex);
    shouldRelay = board[currentIndex] > 1 && !wasLastPitCaptured;
  }

  const isGameOver = board.reduce((a, b) => a + b, 0) === 0;
  let nextPlayer: 1 | 2 = currentPlayer === 1 ? 2 : 1;

  if (!isGameOver) {
    const opponentPits = nextPlayer === 1 ? PLAYER_ONE_PITS : PLAYER_TWO_PITS;
    const opponentHasMoves = opponentPits.some((pit) => board[pit] > 0);
    if (!opponentHasMoves) {
      nextPlayer = currentPlayer;
    }
  }

  return {
    nextState: {
      ...state,
      board,
      scores,
      currentPlayer: isGameOver ? currentPlayer : nextPlayer,
      isGameOver,
    },
    animationPaths,
    captures,
  };
};

export const getValidMoves = (state: AyoGameState): number[] => {
  const pits = state.currentPlayer === 1 ? PLAYER_ONE_PITS : PLAYER_TWO_PITS;
  return pits.filter((idx) => state.board[idx] > 0);
};
