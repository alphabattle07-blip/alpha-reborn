// LudoComputerUI.tsx
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LudoCoreUI } from '../core/ui/LudoCoreUI';
import { usePlayerProfile } from "../../../hooks/usePlayerProfile";
import LudoGameOver from "./LudoGameOver";

const levels = [
    { label: "Apprentice (Easy)", value: 1, rating: 1250, reward: 2 },
    { label: "Knight (Normal)", value: 2, rating: 1700, reward: 4 },
    { label: "Warrior (Hard)", value: 3, rating: 1900, reward: 6 },
    { label: "Master (Expert)", value: 4, rating: 2000, reward: 8 },
    { label: "Alpha (Legend)", value: 5, rating: 2250, reward: 10 },
];

export default function LudoComputerUI() {
    const [gameId, setGameId] = useState<number>(0);
    const [level, setLevel] = useState<number | null>(null);
    const [winnerId, setWinnerId] = useState<string | null>(null);

    const playerProfile = usePlayerProfile('ludo');

    const startGame = (lvl: number) => {
        setLevel(lvl);
        setWinnerId(null);
        setGameId(prev => prev + 1);
    };

    const handleRematch = () => {
        if (level) startGame(level);
    };

    const handleNewBattle = () => {
        setLevel(null);
        setWinnerId(null);
    };

    const opponent = useMemo(() => {
        if (!level) return null;
        const levelData = levels.find(l => l.value === level);
        return {
            name: `${levelData?.label.split(' ')[0]} AI`,
            country: "US",
            rating: levelData?.rating || 1500,
            isAI: true,
        };
    }, [level]);

    const navigation = useNavigation();

    return (
        <View style={styles.container}>
            {!level ? (
                <LinearGradient colors={['#0a0e1a', '#101830', '#0a0e1a']} style={styles.root}>
                    <SafeAreaView style={styles.safeArea}>
                        {/* --- Header --- */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                                <Ionicons name="arrow-back" size={24} color="#fff" />
                            </TouchableOpacity>
                            <View style={styles.headerCenter}>
                                <Text style={styles.headerTitle}>CHOOSE</Text>
                                <Text style={styles.headerAccent}>OPPONENT</Text>
                            </View>
                            <View style={{ width: 42 }} />
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.levelScroll}>
                            <View style={styles.levelHeader}>
                                <Ionicons name="hardware-chip-outline" size={20} color="#64748b" />
                                <Text style={styles.levelHeaderText}>LUDO AI NETWORK</Text>
                            </View>

                            {levels.map((lvl) => {
                                const aiImage = lvl.value === 1 ? require('../../../assets/images/ai/lvl1.png') :
                                                lvl.value <= 3 ? require('../../../assets/images/ai/lvl3.png') :
                                                require('../../../assets/images/ai/lvl5.png');
                                
                                const isAdvanced = lvl.value >= 4;
                                const isIntermediate = lvl.value === 2 || lvl.value === 3;

                                return (
                                    <TouchableOpacity
                                        key={lvl.value}
                                        activeOpacity={0.85}
                                        style={styles.levelCard}
                                        onPress={() => startGame(lvl.value)}
                                    >
                                        <LinearGradient
                                            colors={isAdvanced ? ['#4c0519', '#881337'] : isIntermediate ? ['#1e1b4b', '#312e81'] : ['#064e3b', '#065f46']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.cardGradient}
                                        >
                                            <View style={styles.cardContent}>
                                                <View style={styles.aiAvatarInfo}>
                                                    <Image source={aiImage} style={styles.aiAvatar} />
                                                    <View style={styles.levelInfo}>
                                                        <Text style={styles.levelLabel}>{lvl.label.split(' (')[0]}</Text>
                                                        <View style={styles.ratingRow}>
                                                            <Ionicons name="flash-outline" size={14} color="#FFD700" />
                                                            <Text style={styles.ratingText}>RATING: {lvl.rating}</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                
                                                <View style={styles.rewardSection}>
                                                    <Text style={styles.rewardLabel}>REWARD</Text>
                                                    <View style={styles.rewardBox}>
                                                        <Text style={styles.rewardValue}>+{lvl.reward}</Text>
                                                        <Text style={styles.rewardUnit}>R-Coins</Text>
                                                    </View>
                                                </View>
                                            </View>
                                            
                                            <View style={styles.cardFooter}>
                                                <Text style={styles.aiSubtitle}>
                                                    {lvl.value === 1 ? "Simple seeds management, ideal for casual play" :
                                                     lvl.value === 3 ? "Smart captures and defensive grouping" :
                                                     lvl.value === 5 ? "Elite Ludo strategy with probability analysis" : 
                                                     "Aggressive and tactical playstyle"}
                                                </Text>
                                                <Ionicons name="play-circle-outline" size={24} color="rgba(255,255,255,0.6)" />
                                            </View>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </SafeAreaView>
                </LinearGradient>
            ) : (
                <View style={styles.gameContainer}>
                    <LudoCoreUI
                        key={gameId}
                        level={level}
                        player={playerProfile}
                        opponent={opponent || undefined}
                        onGameOver={(winnerId) => setWinnerId(winnerId)}
                    />

                    {winnerId && (
                        <LudoGameOver
                            result={winnerId === 'p1' ? 'win' : 'loss'}
                            level={level}
                            onRematch={handleRematch}
                            onNewBattle={handleNewBattle}
                            playerName={playerProfile.name}
                            opponentName={opponent?.name || 'AI'}
                            playerRating={playerProfile.rating}
                        />
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1a1a1a' },
    root: { flex: 1 },
    safeArea: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 5 : 15,
        paddingBottom: 15,
    },
    backButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 2,
    },
    headerAccent: {
        fontSize: 20,
        fontWeight: '900',
        color: '#FFD700',
        letterSpacing: 2,
        marginLeft: 6,
    },
    levelScroll: {
        paddingHorizontal: 20,
        paddingBottom: 30,
    },
    levelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 8,
    },
    levelHeaderText: {
        color: '#64748b',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    levelCard: {
        marginBottom: 16,
        borderRadius: 20,
        overflow: 'hidden',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cardGradient: {
        padding: 16,
    },
    cardContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    aiAvatarInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    aiAvatar: {
        width: 60,
        height: 60,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    levelInfo: {
        justifyContent: 'center',
    },
    levelLabel: {
        color: '#fff',
        fontSize: 19,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    ratingText: {
        color: '#FFD700',
        fontSize: 11,
        fontWeight: '800',
    },
    rewardSection: {
        alignItems: 'center',
    },
    rewardLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 9,
        fontWeight: '900',
        marginBottom: 4,
    },
    rewardBox: {
        flexDirection: 'row',
        alignItems: 'baseline',
        backgroundColor: 'rgba(0,0,0,0.3)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        gap: 2,
    },
    rewardValue: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '900',
    },
    rewardUnit: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    aiSubtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        fontWeight: '500',
        flex: 1,
        marginRight: 10,
    },
    gameContainer: { flex: 1 },
});
