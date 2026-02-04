// AyoComputerUI.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Button } from 'react-native';
import { initializeComputerGame, playComputerTurn, AyoComputerState, ComputerLevel, getComputerMove } from "./AyoComputerLogic";
import { calculateMoveResult } from "../core/AyoCoreLogic";
import { AyoGame } from "../core/AyoCoreUI";
import { usePlayerProfile } from "../../../../hooks/usePlayerProfile"
import AyoGameOver from "./AyoGameOver";
import { useAppDispatch } from "../../../../store/hooks";

const levels = [
  { label: "Apprentice (Easy)", value: 1, rating: 1250, reward: 10 },
  { label: "Knight (Normal)", value: 2, rating: 1500, reward: 15 },
  { label: "Warrior (Hard)", value: 3, rating: 1700, reward: 20 },
  { label: "Master (Expert)", value: 4, rating: 1900, reward: 25 },
  { label: "Alpha (Legend)", value: 5, rating: 2100, reward: 30 },
];

const BATTLE_BONUS = 15;

export default function AyoComputerUI() {
  const [gameState, setGameState] = useState<AyoComputerState | null>(null);
  const [level, setLevel] = useState<ComputerLevel | null>(null);
  const [animationPaths, setAnimationPaths] = useState<number[][]>([]);
  const [aiThinking, setAiThinking] = useState(false);

  // --- FIX: Destructure the player profile and the new isLoading flag ---
  const playerProfile = usePlayerProfile('ayo'); // Assuming 'ayo' is the gameId
  const dispatch = useAppDispatch();
  const [isAnimating, setIsAnimating] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ player: 1 | 2; pit: number } | null>(null);

  // --- Function to handle Rematch ---
  const handleRematch = () => {
    if (level) {
      startGame(level);
    }
  };

  // --- Function to handle New Battle ---
  const handleNewBattle = () => {
    setGameState(null);
    setLevel(null);
  };

  // --- Effect to award R-coins on win ---
  useEffect(() => {
    if (gameState?.isPlayerWinner === true && level) {
      const levelData = levels.find(l => l.value === level);
      const totalReward = (levelData?.reward ?? 0) + BATTLE_BONUS;

      console.log(`Player won! Awarding ${totalReward} R-coins.`);
      // dispatch(updateUserRcoin(totalReward)); // <-- UNCOMMENT THIS when your Redux action is ready
    }
  }, [gameState?.isPlayerWinner, level]);

  // ... (startGame, onAnimationDone, handleMove, useEffect logic remains the same)
  const startGame = (lvl: ComputerLevel) => {
    setLevel(lvl);
    setGameState(initializeComputerGame(lvl));
  };



  const onAnimationDone = () => {
    if (pendingMove && gameState) {
      const newState = playComputerTurn(gameState, pendingMove.pit);
      setGameState(newState);
      if (pendingMove.player === 1) setAiThinking(false);
    }
    setIsAnimating(false);
    setPendingMove(null);
    setAnimationPaths([]);
  };

  const handleMove = (pitIndex: number) => {
    if (!gameState || isAnimating || gameState.game.currentPlayer !== 2) return;

    const moveResult = calculateMoveResult(gameState.game, pitIndex);
    if (moveResult.animationPaths.length > 0) {
      setIsAnimating(true);
      setPendingMove({ player: 2, pit: pitIndex });
      setAnimationPaths(moveResult.animationPaths);
    } else {
      const newState = playComputerTurn(gameState, pitIndex);
      setGameState(newState);
    }
  };

  useEffect(() => {
    if (!gameState || !level || isAnimating || gameState.game.currentPlayer !== 1 || gameState.isPlayerWinner !== null) {
      return;
    }

    setAiThinking(true);
    const timer = setTimeout(() => {
      if (!gameState || gameState.game.currentPlayer !== 1) {
        setAiThinking(false);
        return;
      }

      const aiMove = getComputerMove(gameState.game, level);
      const moveResult = calculateMoveResult(gameState.game, aiMove);

      if (moveResult.animationPaths.length > 0) {
        setIsAnimating(true);
        setPendingMove({ player: 1, pit: aiMove });
        setAnimationPaths(moveResult.animationPaths);
      } else {
        const newState = playComputerTurn(gameState, aiMove);
        setGameState(newState);
        setAiThinking(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [gameState, level, isAnimating]);

  const opponent = useMemo(() => {
    if (!level) return null;
    const levelData = levels.find(l => l.value === level);
    return {
      name: `${levelData?.label.split(' ')[0]} AI`,
      country: "NG",
      rating: levelData?.rating || 1000,
      isAI: true,
    };
  }, [level]);

  // --- FIX: Remove loading state check to allow immediate game over display ---
  // Profile loading should not block the game UI

  return (
    <View style={styles.container}>
      {!gameState ? (
        <View style={styles.levelSelector}>
          <Text style={styles.title}>Choose Difficulty</Text>
          {levels.map((lvl) => (
            <TouchableOpacity
              key={lvl.value}
              style={styles.levelButton}
              onPress={() => startGame(lvl.value as ComputerLevel)}
            >
              <Text style={styles.levelText}>{lvl.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.gameContainer}>
          <AyoGame
            initialGameState={gameState.game}
            onPitPress={handleMove}
            opponent={opponent || { name: 'AI', country: 'NG', rating: 1000, isAI: true }} // Provide a default opponent
            player={playerProfile} // using the simplified playerProfile object
            level={level || 1} // Provide a default level if null
          />


          {gameState.isPlayerWinner !== null && level && (
            <AyoGameOver
              result={gameState.isPlayerWinner ? "win" : "loss"}
              level={level}
              onRematch={handleRematch}
              onNewBattle={handleNewBattle}
              playerName={playerProfile.name}
              opponentName={opponent?.name || 'AI'}
              playerRating={playerProfile.rating} // ✅ pass rating
            />

          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8, backgroundColor: '#222', justifyContent: 'center', },
  levelSelector: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  title: { color: 'white', fontSize: 20, marginBottom: 20 },
  levelButton: { backgroundColor: '#444', padding: 12, borderRadius: 8, marginVertical: 6, width: '80%', alignItems: 'center' },
  levelText: { color: 'white', fontSize: 18 },
  gameContainer: { flex: 1 },
  loadingText: { marginTop: 10, color: '#fff', fontSize: 16 },
});