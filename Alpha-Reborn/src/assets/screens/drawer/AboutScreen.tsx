import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function AboutScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>About Alpha-Reborn</Text>

            <View style={styles.card}>
                <Text style={styles.infoText}>Version: v1.0.0 Alpha</Text>
                <Text style={styles.infoText}>
                    The ultimate competitive multiplayer platform for Ludo and Whot enthusiasts.
                </Text>
                <View style={styles.divider} />
                <Text style={styles.infoText}>Developed by Alpha Studio</Text>
                <Text style={styles.infoText}>Copyright © 2026</Text>
                <Text style={styles.infoText}>Contact: support@alphareborn.com</Text>
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
        marginBottom: 30,
    },
    card: {
        backgroundColor: '#ffffff20',
        padding: 20,
        borderRadius: 10,
        width: '100%',
    },
    infoText: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 10,
        lineHeight: 24,
    },
    divider: {
        height: 1,
        backgroundColor: '#ffffff40',
        marginVertical: 15,
    },
});
