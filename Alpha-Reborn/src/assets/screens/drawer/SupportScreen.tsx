import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

export default function SupportScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Support / Report Issue</Text>
            <Text style={styles.subtitle}>Version 1.0.0 Alpha</Text>

            <View style={styles.formContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Contact Email"
                    placeholderTextColor="#aaa"
                />
                <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Describe your issue..."
                    placeholderTextColor="#aaa"
                    multiline
                    numberOfLines={6}
                />

                <TouchableOpacity style={styles.button}>
                    <Text style={styles.buttonText}>Attach Screenshot</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, styles.submitButton]}>
                    <Text style={styles.buttonText}>Submit Report</Text>
                </TouchableOpacity>
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
        marginBottom: 5,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: '#ccc',
        textAlign: 'center',
        marginBottom: 30,
    },
    formContainer: {
        backgroundColor: '#ffffff20',
        padding: 20,
        borderRadius: 10,
    },
    input: {
        backgroundColor: '#ffffff10',
        color: '#fff',
        padding: 15,
        borderRadius: 8,
        marginBottom: 15,
        fontSize: 16,
    },
    textArea: {
        height: 120,
        textAlignVertical: 'top',
    },
    button: {
        backgroundColor: '#ffffff30',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 10,
    },
    submitButton: {
        backgroundColor: '#2E86DE',
        marginTop: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
