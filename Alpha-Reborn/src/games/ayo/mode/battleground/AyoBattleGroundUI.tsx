import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const AyoBattleGroundUI: React.FC<any> = ({ toast }) => {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Ayo Battle Mode Under Development</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0b1f3a',
    },
    text: {
        color: '#fff',
        fontSize: 18,
    },
});

export default AyoBattleGroundUI;
