// LudoGameOver.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppDispatch } from '../../../store/hooks';
import { updateGameStatsThunk } from '../../../store/thunks/gameStatsThunks';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

const levels = [
    { label: "Apprentice (Easy)", value: 1, rating: 1250, reward: 2 },
    { label: "Knight (Normal)", value: 2, rating: 1500, reward: 4 },
    { label: "Warrior (Hard)", value: 3, rating: 1700, reward: 6 },
    { label: "Master (Expert)", value: 4, rating: 1900, reward: 8 },
    { label: "Alpha (Legend)", value: 5, rating: 2100, reward: 10 },
];

const BATTLE_BONUS = 15;

interface LudoGameOverProps {
    result: 'win' | 'loss';
    level?: number;
    isOnline?: boolean;
    onRematch?: () => void;
    onNewBattle?: () => void;
    playerName: string;
    opponentName: string;
    playerRating: number;
    onStatsUpdate?: (result: 'win' | 'loss' | 'draw', newRating: number) => void;
}

const ONLINE_BATTLE_BONUS = 25;
const ONLINE_WIN_PRIZE = 50;
const ONLINE_LOSS_PENALTY = 50;
const OFFLINE_BATTLE_BONUS = 15;

const LudoGameOver: React.FC<LudoGameOverProps> = ({
    result,
    level,
    onRematch,
    onNewBattle,
    playerName,
    opponentName,
    playerRating,
    isOnline,
    onStatsUpdate,
}) => {
    const dispatch = useAppDispatch();
    const isWin = result === 'win';
    const isLoss = result === 'loss';


    const [calculatedData, setCalculatedData] = useState<{
        levelReward: number;
        finalRating: number;
        bonus: number;
        isOnline?: boolean;
    } | null>(null);

    // Guard: ensure reward dispatch fires exactly ONCE per game-over instance
    const hasDispatchedReward = useRef(false);

    // Capture the initial playerRating so Redux updates don't change the display mid-view
    const initialRatingRef = useRef(playerRating);
    // Only update if this is a fresh mount (hasDispatchedReward hasn't fired yet)
    if (!hasDispatchedReward.current && playerRating !== initialRatingRef.current) {
        initialRatingRef.current = playerRating;
    }

    useEffect(() => {
        // Initial calculation when result is available and visible
        if (result && !calculatedData) {
            let reward = 0;
            let totalChange = 0;
            let bonus = 0;

            if (isOnline) {
                bonus = 10; 
                reward = isWin ? 40 : -50; 
                totalChange = bonus + reward;
            } else {
                bonus = 5; 
                if (isWin && level) {
                    const levelData = levels.find((l) => l.value === level);
                    reward = levelData?.reward ?? 0;
                    totalChange = reward + bonus;
                }
            }

            const finalRating = initialRatingRef.current + totalChange;

            setCalculatedData({
                levelReward: reward,
                finalRating: finalRating,
                bonus: bonus,
                isOnline: isOnline
            });

            // Dispatch to backend ONLY ONCE per game-over instance
            if (!hasDispatchedReward.current && (isWin || isLoss)) {
                hasDispatchedReward.current = true;
                dispatch(
                    updateGameStatsThunk({
                        gameId: 'ludo',
                        result: isWin ? 'win' : 'loss',
                        newRating: finalRating,
                    })
                );
            }

            onStatsUpdate?.(result, finalRating);
        }
    }, [result, isWin, isLoss, isOnline, level, dispatch]); // removed calculatedData from deps

    const displayLevelReward = calculatedData?.levelReward ?? 0;
    const displayNewRating = calculatedData?.finalRating ?? playerRating;
    const displayBonus = calculatedData?.bonus ?? 0;

    const getMatchRewardLabel = () => {
        if (!isOnline) return 'Level Reward';
        if (isWin) return 'Match Win';
        if (isLoss) return 'Match Loss';
        return 'Match Draw';
    };

    return (
        <Animated.View 
            entering={FadeIn.duration(400)} 
            exiting={FadeOut.duration(300)} 
            style={styles.overlay}
        >
            <Animated.View 
                entering={ZoomIn.delay(200).duration(500)}
                style={styles.container}
            >
                <ScrollView contentContainerStyle={{ alignItems: 'center', width: '100%' }} showsVerticalScrollIndicator={false}>
                    {isWin && <Text style={styles.winText}>You Won!</Text>}
                    {isLoss && <Text style={styles.loseText}>You Lost!</Text>}

                    <Text style={styles.winnerText}>
                        Winner: {isWin ? playerName : opponentName}
                    </Text>

                    {(isWin || isOnline) && (
                        <View style={styles.rewardSection}>
                            {displayBonus > 0 && (
                                <View style={styles.rewardRow}>
                                    <Text style={styles.rewardLabel}>Battle Bonus</Text>
                                    <Text style={styles.rewardValue}>
                                        <Ionicons name="trophy" size={16} color="#FFD700" /> +
                                        {displayBonus} R-Coin
                                    </Text>
                                </View>
                            )}

                            {(!isOnline || isWin || isLoss) && (
                                <View style={styles.rewardRow}>
                                    <Text style={styles.rewardLabel}>{getMatchRewardLabel()}</Text>
                                    <Text style={[styles.rewardValue, isOnline && !isWin && { color: '#ef5350' }]}>
                                        <Ionicons name="trophy" size={16} color="#FFD700" /> {displayLevelReward > 0 ? '+' : ''}
                                        {displayLevelReward} R-Coin
                                    </Text>
                                </View>
                            )}

                            <View style={styles.rewardRow}>
                                <Text style={styles.rewardLabel}>Rapid Rating</Text>
                                <Text style={[styles.rewardValue, styles.totalRewardValue]}>
                                    <Ionicons name="medal" size={16} color="#FFD700" /> {initialRatingRef.current} {displayBonus + displayLevelReward >= 0 ? '+' : ''}{displayBonus + displayLevelReward} = {displayNewRating}
                                </Text>
                            </View>
                        </View>
                    )}

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

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    container: {
        backgroundColor: '#333',
        borderRadius: 15,
        padding: 20,
        width: '90%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#555',
    },
    winText: { fontSize: 32, fontWeight: 'bold', color: '#4CAF50' },
    loseText: { fontSize: 32, fontWeight: 'bold', color: '#F44336' },
    winnerText: {
        fontSize: 18,
        color: '#FFFFFF',
        fontWeight: '500',
        marginVertical: 10,
    },
    rewardSection: {
        width: '100%',
        backgroundColor: '#444',
        borderRadius: 10,
        padding: 15,
        marginBottom: 25,
    },
    rewardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
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
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        minWidth: 120,
    },
    rematchButton: { backgroundColor: '#FFD700' },
    newBattleButton: { backgroundColor: '#666' },
    buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});

export default LudoGameOver;
