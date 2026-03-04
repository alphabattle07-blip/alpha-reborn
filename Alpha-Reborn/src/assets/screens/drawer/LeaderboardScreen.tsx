import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LeaderboardScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Leaderboard</Text>
            <Text style={styles.subtitle}>Global Top 100</Text>
            <View style={styles.rankBox}>
                <Text style={styles.rankText}>My Rank: 1</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#0b1f3a',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 18,
        color: '#ccc',
        marginBottom: 20,
    },
    rankBox: {
        backgroundColor: '#ffffff20',
        padding: 15,
        borderRadius: 8,
    },
    rankText: {
        fontSize: 18,
        color: '#fff',
        fontWeight: 'bold',
    },
});
