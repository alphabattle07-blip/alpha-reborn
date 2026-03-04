import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TournamentsScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Tournaments</Text>
            <Text style={styles.comingSoon}>Coming Soon</Text>
            <View style={styles.infoBox}>
                <Text style={styles.infoText}>• Weekly tournaments</Text>
                <Text style={styles.infoText}>• Prize pools</Text>
                <Text style={styles.infoText}>• Entry requirements</Text>
                <Text style={styles.infoText}>• Rank restrictions</Text>
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
    comingSoon: {
        fontSize: 22,
        color: '#f02e2e',
        fontWeight: 'bold',
        marginBottom: 20,
    },
    infoBox: {
        backgroundColor: '#ffffff20',
        padding: 20,
        borderRadius: 10,
        alignItems: 'flex-start',
    },
    infoText: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 8,
    },
});
