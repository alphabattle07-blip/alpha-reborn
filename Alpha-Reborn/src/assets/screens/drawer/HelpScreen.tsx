import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function HelpScreen() {
    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>Help / How to Play</Text>

            <Text style={styles.sectionTitle}>Ludo</Text>
            <View style={styles.card}>
                <Text style={styles.bullet}>• Basic rules</Text>
                <Text style={styles.bullet}>• How to win</Text>
                <Text style={styles.bullet}>• competitive rule set</Text>
            </View>

            <Text style={styles.sectionTitle}>Whot</Text>
            <View style={styles.card}>
                <Text style={styles.bullet}>• Card types explanation</Text>
                <Text style={styles.bullet}>• Action cards meaning</Text>
                <Text style={styles.bullet}>• Stacking rules</Text>
                <Text style={styles.bullet}>• Win condition</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#0b1f3a',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 20,
        textAlign: 'center',
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#2E86DE',
        marginTop: 10,
        marginBottom: 10,
    },
    card: {
        backgroundColor: '#ffffff20',
        padding: 15,
        borderRadius: 8,
        marginBottom: 20,
    },
    bullet: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 6,
    },
});
