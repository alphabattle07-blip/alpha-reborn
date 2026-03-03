import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { toggleSound } from '../store/slices/soundSettingsSlice';

type SoundControlProps = {
    gameId: 'whot' | 'ludo';
};

const SoundDropdownPanel: React.FC<SoundControlProps> = ({ gameId }) => {
    const dispatch = useDispatch();
    const soundSettings = useSelector((state: RootState) => state.soundSettings[gameId]);
    const [isOpen, setIsOpen] = useState(false);

    const handleToggle = (setting: 'voice' | 'sfx' | 'bgm') => {
        dispatch(toggleSound({ game: gameId, setting }));
    };

    return (
        <View style={styles.container}>
            {/* Main Icon Button */}
            <TouchableOpacity
                style={styles.mainBtn}
                onPress={() => setIsOpen(!isOpen)}
            >
                <Ionicons name="settings" size={24} color="#FFF" />
            </TouchableOpacity>

            {/* Dropdown Panel */}
            {isOpen && (
                <View style={styles.dropdown}>
                    <Text style={styles.title}>Sound Settings</Text>

                    <View style={styles.row}>
                        <Text style={styles.label}>Music</Text>
                        <Switch
                            value={soundSettings.bgm}
                            onValueChange={() => handleToggle('bgm')}
                            trackColor={{ false: "#4A4A4A", true: "#FFD700" }}
                            thumbColor={soundSettings.bgm ? "#FFF" : "#f4f3f4"}
                        />
                    </View>

                    <View style={styles.row}>
                        <Text style={styles.label}>Effects</Text>
                        <Switch
                            value={soundSettings.sfx}
                            onValueChange={() => handleToggle('sfx')}
                            trackColor={{ false: "#4A4A4A", true: "#FFD700" }}
                            thumbColor={soundSettings.sfx ? "#FFF" : "#f4f3f4"}
                        />
                    </View>

                    {gameId === 'whot' && 'voice' in soundSettings && (
                        <View style={styles.row}>
                            <Text style={styles.label}>Voice</Text>
                            <Switch
                                value={(soundSettings as { voice?: boolean }).voice}
                                onValueChange={() => handleToggle('voice')}
                                trackColor={{ false: "#4A4A4A", true: "#FFD700" }}
                                thumbColor={(soundSettings as { voice?: boolean }).voice ? "#FFF" : "#f4f3f4"}
                            />
                        </View>
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'flex-end',
    },
    mainBtn: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 8,
        borderRadius: 20,
    },
    dropdown: {
        marginTop: 5,
        backgroundColor: 'rgba(11, 31, 58, 0.95)',
        borderRadius: 12,
        padding: 15,
        width: 180,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        elevation: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
    },
    title: {
        color: '#FFD700',
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 10,
        textAlign: 'center',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 5,
    },
    label: {
        color: '#FFF',
        fontSize: 14,
    }
});

export default SoundDropdownPanel;
