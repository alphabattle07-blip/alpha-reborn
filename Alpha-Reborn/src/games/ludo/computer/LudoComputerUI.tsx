// LudoComputerUI.tsx
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LudoCoreUI } from '../core/ui/LudoCoreUI';
import { usePlayerProfile } from "../../../hooks/usePlayerProfile";
import LudoGameOver from "./LudoGameOver";

const levels = [
    { label: "Apprentice (Easy)", value: 1, rating: 1250, reward: 10 },
    { label: "Knight (Normal)", value: 2, rating: 1700, reward: 15 },
    { label: "Warrior (Hard)", value: 3, rating: 1900, reward: 20 },
    { label: "Master (Expert)", value: 4, rating: 2000, reward: 25 },
    { label: "Alpha (Legend)", value: 5, rating: 2250, reward: 30 },
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

    return (
        <View style={styles.container}>
            {!level ? (
                <View style={styles.levelSelector}>
                    <Text style={styles.title}>Choose Difficulty</Text>
                    {levels.map((lvl) => (
                        <TouchableOpacity
                            key={lvl.value}
                            style={styles.levelButton}
                            onPress={() => startGame(lvl.value)}
                        >
                            <Text style={styles.levelText}>{lvl.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
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
    levelSelector: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    title: { color: '#FFD700', fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
    levelButton: {
        backgroundColor: '#333',
        padding: 15,
        borderRadius: 10,
        marginVertical: 8,
        width: '85%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#444'
    },
    levelText: { color: 'white', fontSize: 18, fontWeight: '500' },
    gameContainer: { flex: 1 },
});
