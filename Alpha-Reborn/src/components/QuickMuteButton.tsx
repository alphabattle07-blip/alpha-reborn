import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { toggleAllSounds } from '../store/slices/soundSettingsSlice';

type QuickMuteProps = {
    gameId: 'whot' | 'ludo';
};

const QuickMuteButton: React.FC<QuickMuteProps> = ({ gameId }) => {
    const dispatch = useDispatch();
    const soundSettings = useSelector((state: RootState) => state.soundSettings[gameId]);

    const isAllMuted = Object.values(soundSettings).every(val => val === false);

    const handlePress = () => {
        dispatch(toggleAllSounds({ game: gameId }));
    };

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={handlePress}
        >
            <Ionicons
                name={isAllMuted ? 'volume-mute' : 'volume-high'}
                size={26}
                color={isAllMuted ? '#FF4444' : '#FFF'}
            />
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 8,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

export default QuickMuteButton;
