// LudoComputerGameScreen.tsx
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import LudoComputerUI from './LudoComputerUI';

const LudoComputerGameScreen = () => {
    return (
        <View style={styles.container}>
            <LudoComputerUI />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
    },
    header: {
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 40,
    },
    title: {
        color: '#FFD700',
        fontSize: 24,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 2
    }
});

export default LudoComputerGameScreen;