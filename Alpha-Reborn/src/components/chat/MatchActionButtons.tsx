import React, { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Animated, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ChatToggleButton } from './ChatToggleButton';
import { useAppSelector } from '../../store/hooks';
import { getRankFromRating } from '../../utils/rank';

export const MatchActionButtons = () => {
    const { profile } = useAppSelector(state => state.user);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const slideAnim = useRef(new Animated.Value(0)).current;

    // Determine user's rank. Warrior requires 1750+ rating
    const rating = profile?.rating ?? 1000;
    const isWarriorOrAbove = rating >= 1750;
    const panelText = isWarriorOrAbove ? "Coming Soon" : "Warrior+";

    const handleChallengePress = () => {
        if (isPanelOpen) {
            // Close panel
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }).start(() => setIsPanelOpen(false));
        } else {
            // Open panel
            setIsPanelOpen(true);
            Animated.timing(slideAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();

            // Auto close after 3 seconds
            setTimeout(() => {
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }).start(() => setIsPanelOpen(false));
            }, 3000);
        }
    };

    return (
        <View style={styles.container} pointerEvents="box-none">
            {/* Chat Button (Bottom Left) */}
            <ChatToggleButton />

            {/* Challenge Block (Bottom Right) */}
            <View style={styles.challengeWrapper}>
                {/* Slide-out Panel */}
                <Animated.View style={[
                    styles.challengePanel,
                    {
                        opacity: slideAnim,
                        transform: [{
                            translateX: slideAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [20, -10] // Slide out to the left of the button
                            })
                        }]
                    }
                ]} pointerEvents="none">
                    <Text style={styles.panelText}>{panelText}</Text>
                </Animated.View>

                {/* Challenge Button */}
                <TouchableOpacity style={styles.challengeButton} onPress={handleChallengePress} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="boxing-glove" size={28} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 45 : 30, // Safely above the bottom edge
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: '15%', // 15% padding from left and right edges as requested
        zIndex: 100, // Ensure it sits above the board
    },
    challengeWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    challengeButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#e63946', // Red color for challenge
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
        zIndex: 10,
    },
    challengePanel: {
        position: 'absolute',
        right: 40, // Anchor it behind the button, sliding left
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#e63946',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 4,
        zIndex: 5,
        minWidth: 100,
        alignItems: 'center',
    },
    panelText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    }
});
