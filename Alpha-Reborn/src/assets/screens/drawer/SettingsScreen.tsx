import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';

export default function SettingsScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Settings</Text>

            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Background Music</Text>
                <Switch value={true} onValueChange={() => { }} />
            </View>

            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Dark Theme</Text>
                <Switch value={true} onValueChange={() => { }} />
            </View>

            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Language (English)</Text>
            </View>

            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Change Password</Text>
            </View>
        </View>
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
        marginBottom: 30,
        textAlign: 'center',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#ffffff20',
        padding: 15,
        borderRadius: 8,
        marginBottom: 10,
    },
    settingLabel: {
        fontSize: 16,
        color: '#fff',
    },
});
