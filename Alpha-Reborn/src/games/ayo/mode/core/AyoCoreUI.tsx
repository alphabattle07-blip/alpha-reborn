import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigation } from '@react-navigation/native'; // Import useNavigation
import { View, StyleSheet } from "react-native";
import { AyoSkiaImageBoard } from "./AyoSkiaBoard";
import GamePlayerProfile from "./GamePlayerProfile";
import {
  AyoGameState,
  initializeGame,
  calculateMoveResult,
  getValidMoves,
  Capture,
} from "./AyoCoreLogic";
import AyoGameOver from "../computer/AyoGameOver"; // ✅ import overlay
import { usePlayerProfile } from "../../../../../scripts/hooks/usePlayerProfile"; // Import the hook

type AyoGameProps = {
  initialGameState?: AyoGameState;
  onPitPress?: (pitIndex: number) => void;
  player?: { name: string; country?: string; rating?: number; isAI?: boolean };
  opponent?: { name: string; country?: string; rating?: number; isAI?: boolean };
  onGameStatsUpdate?: (result: 'win' | 'loss' | 'draw', newRating: number) => void;
  level?: import('../computer/AyoComputerLogic').ComputerLevel; // Add level prop with correct type
};

export const AyoGame: React.FC<AyoGameProps> = ({
  initialGameState,
  onPitPress,
  player: propPlayer,
  opponent: propOpponent,
  onGameStatsUpdate,
  level,
}) => {
  // No longer need updateGameStats directly here as it's handled in AyoGameOver
  // const { updateGameStats } = usePlayerProfile('ayo');
  const navigation = useNavigation(); // Initialize navigation
  const [gameState, setGameState] = useState<AyoGameState>(
    initialGameState ?? initializeGame()
  );
  const [showGameOver, setShowGameOver] = useState(false); // New state for controlling overlay visibility
  const [boardBeforeMove, setBoardBeforeMove] = useState<number[]>(gameState.board);
  const [animatingPaths, setAnimatingPaths] = useState<number[][]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);

  const defaultPlayer = { name: "Player", country: "NG", rating: 1200, isAI: false };
  const defaultOpponent = { name: "Opponent", country: "US", rating: 1500, isAI: true };

  const player = propPlayer ?? defaultPlayer;
  const opponent = propOpponent ?? defaultOpponent;

  const isAnimating = animatingPaths.length > 0;

  // --- AI Move (opponent is currentPlayer 1) ---
  useEffect(() => {
    if (gameState.currentPlayer === 1 && !gameState.isGameOver && !isAnimating) {
      const validMoves = getValidMoves(gameState);
      if (validMoves.length === 0) return;
      const aiMove = validMoves.reduce((best, pit) =>
        gameState.board[pit] > gameState.board[best] ? pit : best
      );
      const timerId = setTimeout(() => {
        setBoardBeforeMove(gameState.board);
        const moveResult = calculateMoveResult(gameState, aiMove);
        setAnimatingPaths(moveResult.animationPaths);
        setCaptures(moveResult.captures);
        setGameState(moveResult.nextState);
      }, 800);
      return () => clearTimeout(timerId);
    }
  }, [gameState, isAnimating]);

  // --- Game State Sync ---
  useEffect(() => {
    if (gameState.isGameOver) {
      setShowGameOver(true);
    }
  }, [gameState.isGameOver]);

  const handlePlayerMove = useCallback(
    (pitIndex: number) => {
      if (gameState.currentPlayer !== 2 || isAnimating) return;
      setBoardBeforeMove(gameState.board);
      const moveResult = calculateMoveResult(gameState, pitIndex);
      setAnimatingPaths(moveResult.animationPaths);
      setCaptures(moveResult.captures);
      setGameState(moveResult.nextState);

      if (onPitPress) onPitPress(pitIndex);
    },
    [gameState, isAnimating]
  );

  const handleCaptureDuringAnimation = useCallback(
    (pitIndex: number) => {
      const captureInfo = captures.find((c) => c.pitIndex === pitIndex);
      if (!captureInfo) return;
      setGameState((prevState) => {
        const newScores = { ...prevState.scores };
        newScores[captureInfo.awardedTo] += 4;
        return { ...prevState, scores: newScores };
      });
    },
    [captures]
  );

  const handleAnimationEnd = useCallback(() => {
    setAnimatingPaths([]);
    setCaptures([]);
  }, []);

  const memoizedPaths = useMemo(() => animatingPaths, [animatingPaths]);
  const memoizedCaptures = useMemo(() => captures.map((c) => c.pitIndex), [captures]);

  // --- Compute result for GameOver popup ---
  let result: "win" | "loss" | "draw" | null = null;
  if (gameState.isGameOver) {
    if (gameState.scores[2] > gameState.scores[1]) result = "win";
    else if (gameState.scores[1] > gameState.scores[2]) result = "loss";
    else result = "draw";
  }

  // Removed handleGameStatsUpdate as it's now handled directly in AyoGameOver
  // const handleGameStatsUpdate = useCallback((result: 'win' | 'loss' | 'draw', newRating: number) => {
  //   if (onGameStatsUpdate) {
  //     onGameStatsUpdate(result, newRating);
  //   }
  //   // Also update through the hook for local state management
  //   updateGameStats(result, newRating);
  // }, [onGameStatsUpdate, updateGameStats]);

  return (
    <View style={styles.container}>
      <View style={styles.profileContainer}>
        <GamePlayerProfile
          {...opponent}
          score={gameState.scores[1]}
          isActive={gameState.currentPlayer === 1 && !isAnimating}
          country={opponent.country || "NG"}
          rating={opponent.rating || 1200}
        />
      </View>

      <View style={styles.boardContainer}>
        <AyoSkiaImageBoard
          board={gameState.board}
          boardBeforeMove={boardBeforeMove}
          onPitPress={handlePlayerMove}
          animatingPaths={memoizedPaths}
          captures={memoizedCaptures}
          onAnimationEnd={handleAnimationEnd}
          onCaptureDuringAnimation={handleCaptureDuringAnimation}
        />
      </View>

      <View style={styles.profileContainer}>
        <GamePlayerProfile
          {...player}
          score={gameState.scores[2]}
          isActive={gameState.currentPlayer === 2 && !isAnimating}
          country={player.country || "NG"}
          rating={player.rating || 1200}
        />
      </View>

      {result && showGameOver && ( // Conditionally render based on showGameOver state
        <AyoGameOver
          result={result}
          playerName={player.name}
          opponentName={opponent.name}
          playerRating={player.rating || 1200}
          level={level} // Pass level prop
          onRematch={() => {
            setGameState(initializeGame());
            setShowGameOver(false); // Hide the overlay
          }}
          onNewBattle={() => {
            setShowGameOver(false); // Hide the overlay
            navigation.goBack(); // Navigate back to the previous screen (e.g., game selection)
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "space-between", padding: 1, backgroundColor: "#222" },
  profileContainer: { alignItems: "center", marginBottom: 0 },
  boardContainer: { flex: 1, justifyContent: "center" },
});

export default AyoGame;
