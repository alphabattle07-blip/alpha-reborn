import React, { useEffect, useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, useWindowDimensions, ScrollView } from "react-native";
import Animated, { FadeIn, BounceIn, FadeOut } from "react-native-reanimated";
import { Player, WHOT_LEVELS as levels, ComputerLevel } from "../types";
import { Ionicons } from '@expo/vector-icons';
import { useAppDispatch } from "../../../../../store/hooks";
import { updateGameStatsThunk } from "../../../../../store/thunks/gameStatsThunks";


const BATTLE_BONUS = 15;

interface GameOverModalProps {
  winner: Player | null;
  onRematch: () => void;
  onNewBattle: () => void;
  visible: boolean;
  level?: ComputerLevel;
  playerName: string;
  opponentName: string;
  playerRating: number;
  result: 'win' | 'loss' | 'draw';
  isOnline?: boolean;
  children?: React.ReactNode;
  onStatsUpdate?: (result: 'win' | 'loss' | 'draw', newRating: number) => void;
}

const GameOverModal = ({
  winner,
  onRematch,
  onNewBattle,
  visible,
  level,
  playerName,
  opponentName,
  playerRating,
  result,
  isOnline,
  children,
  onStatsUpdate,
}: GameOverModalProps) => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height; // Detect Landscape
  const dispatch = useAppDispatch();
  const isWin = result === 'win';
  const isLoss = result === 'loss';
  const isDraw = result === 'draw';

  const [calculatedData, setCalculatedData] = useState<{
    levelReward: number;
    finalRating: number;
    bonus: number;
    isOnline?: boolean;
  } | null>(null);

  const ONLINE_BATTLE_BONUS = 25;
  const ONLINE_WIN_PRIZE = 50;
  const ONLINE_LOSS_PENALTY = 50;
  const OFFLINE_BATTLE_BONUS = 15;

  useEffect(() => {
    if (visible && winner && !calculatedData) {
      let reward = 0;
      let totalChange = 0;
      let bonus = 0;

      if (isOnline) {
        bonus = ONLINE_BATTLE_BONUS;
        if (isWin) reward = ONLINE_WIN_PRIZE;
        else if (isLoss) reward = -ONLINE_LOSS_PENALTY;
        else if (isDraw) reward = 0;
        totalChange = bonus + reward;
      } else {
        bonus = isWin ? OFFLINE_BATTLE_BONUS : 0;
        if (isWin && level) {
          const levelData = levels.find((l) => l.value === level);
          reward = levelData?.reward ?? 0;
          totalChange = reward + bonus;
        }
      }

      const finalRating = playerRating + totalChange;

      setCalculatedData({
        levelReward: reward,
        finalRating: finalRating,
        bonus: bonus,
        isOnline: isOnline
      });

      // Only auto-update stats if NOT online (online is server-authoritative)
      if (!isOnline && isWin) {
        dispatch(
          updateGameStatsThunk({
            gameId: 'whot',
            result: 'win',
            newRating: finalRating,
          })
        );
      }

      onStatsUpdate?.(result, finalRating);
    }
  }, [visible, winner, isWin, isLoss, isDraw, level, playerRating, result, dispatch, onStatsUpdate, calculatedData, isOnline]);

  useEffect(() => {
    if (!visible) {
      setCalculatedData(null);
    }
  }, [visible]);

  if (!visible || !winner || !calculatedData) return null;

  const { levelReward, finalRating, bonus } = calculatedData;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      style={[styles.overlay, { width, height }]}
    >
      <View style={styles.backdrop} />

      <Animated.View
        entering={BounceIn.delay(100).duration(600)}
        style={[
          styles.modalContainer,
          // ✅ FIX: Dynamic width based on orientation to prevent "too wide" landscape
          { width: isLandscape ? '60%' : '90%', maxHeight: isLandscape ? '90%' : 'auto' }
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Header Text */}
          <View style={styles.headerSection}>
            {isWin && <Text style={styles.winText}>You Won!</Text>}
            {isLoss && <Text style={styles.loseText}>You Lost!</Text>}
            {isDraw && <Text style={styles.drawText}>It’s a Draw!</Text>}
          </View>

          {/* 2. Profiles (Children) - ✅ Moved ABOVE winner text */}
          <View style={styles.profilesSection}>
            {children}
          </View>

          {/* 3. Winner Name - ✅ Moved BELOW profiles */}
          <Text style={styles.winnerText}>
            {isDraw
              ? `${playerName} and ${opponentName} tied`
              : `Winner: ${isWin ? playerName : opponentName}`}
          </Text>

          {/* 4. Rewards Section */}
          {(isWin || isDraw || isOnline) && (
            <View style={styles.rewardSection}>
              <View style={styles.rewardRow}>
                <Text style={styles.rewardLabel}>Battle Bonus</Text>
                <Text style={styles.rewardValue}>
                  <Ionicons name="diamond" size={16} color="#FFD700" /> +
                  {bonus} R-Coin
                </Text>
              </View>

              <View style={styles.rewardRow}>
                <Text style={styles.rewardLabel}>{isOnline ? 'Match Reward' : 'Level Reward'}</Text>
                <Text style={[styles.rewardValue, isOnline && isLoss && { color: '#ef5350' }]}>
                  <Ionicons name="diamond" size={16} color="#FFD700" /> {levelReward >= 0 ? '+' : ''}
                  {levelReward} R-Coin
                </Text>
              </View>

              <View style={styles.rewardRow}>
                <Text style={styles.rewardLabel}>Rapid Rating</Text>
                <Text style={[styles.rewardValue, styles.totalRewardValue]}>
                  <Ionicons name="diamond" size={16} color="#FFD700" /> {playerRating} {bonus + levelReward >= 0 ? '+' : ''} {bonus + levelReward} = {finalRating}
                </Text>
              </View>
            </View>
          )}

          {/* 5. Buttons */}
          <View style={styles.buttonContainer}>
            {onRematch && (
              <TouchableOpacity
                style={[styles.button, styles.rematchButton]}
                onPress={onRematch}
              >
                <Text style={styles.buttonText}>Rematch</Text>
              </TouchableOpacity>
            )}
            {onNewBattle && (
              <TouchableOpacity
                style={[styles.button, styles.newBattleButton]}
                onPress={onNewBattle}
              >
                <Text style={styles.buttonText}>New Battle</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
};

export default GameOverModal;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalContainer: {
    backgroundColor: '#333',
    borderRadius: 15,
    padding: 20,
    // width: '90%' removed here, handled inline for logic
    maxWidth: 600, // ✅ FIX: Prevents it from getting absurdly wide on tablets
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555',
  },
  scrollContent: {
    alignItems: 'center',
    width: '100%',
    paddingBottom: 10,
  },
  headerSection: {
    marginBottom: 10,
  },
  winText: { fontSize: 32, fontWeight: 'bold', color: '#4CAF50', textAlign: 'center' },
  loseText: { fontSize: 32, fontWeight: 'bold', color: '#F44336', textAlign: 'center' },
  drawText: { fontSize: 32, fontWeight: 'bold', color: '#FFD700', textAlign: 'center' },

  profilesSection: {
    marginVertical: 10,
    width: '100%',
    alignItems: 'center',
  },

  winnerText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '500',
    marginVertical: 10,
    textAlign: 'center',
  },

  rewardSection: {
    width: '100%',
    backgroundColor: '#444',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  rewardRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  rewardLabel: { color: '#E0E0E0', fontSize: 16 },
  rewardValue: { color: '#FFD700', fontSize: 16, fontWeight: '600' },
  totalRewardValue: { fontSize: 18, fontWeight: 'bold' },

  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    gap: 10, // Adds space if buttons wrap
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 120,
  },
  rematchButton: { backgroundColor: '#4A90E2' },
  newBattleButton: { backgroundColor: '#666' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});