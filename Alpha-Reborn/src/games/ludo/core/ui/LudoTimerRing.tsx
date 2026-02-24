import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';

interface LudoTimerRingProps {
    isActive: boolean;
    turnStartTime?: number;
    turnDuration?: number;
    yellowAt?: number;
    redAt?: number;
    serverTimeOffset?: number;
    size?: number;
    strokeWidth?: number;
}

/**
 * A timer ring for Ludo dice house.
 * Changes color from Green -> Yellow -> Red based on server-provided thresholds.
 */
export const LudoTimerRing: React.FC<LudoTimerRingProps> = ({
    isActive,
    turnStartTime = 0,
    turnDuration = 25000,
    yellowAt = 0,
    redAt = 0,
    serverTimeOffset = 0,
    size = 72,
    strokeWidth = 4,
}) => {
    const [currentColor, setCurrentColor] = useState('#00FF00'); // Green
    const [opacity, setOpacity] = useState(1);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!isActive || !turnStartTime || !turnDuration) {
            setCurrentColor('#555555');
            setOpacity(0.3);
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        setOpacity(1);

        intervalRef.current = setInterval(() => {
            const currentServerTime = Date.now() - serverTimeOffset;
            const elapsed = currentServerTime - turnStartTime;

            if (elapsed >= turnDuration) {
                setCurrentColor('#FF0000'); // Expired
                setOpacity(0.5);
                return;
            }

            if (redAt > 0 && currentServerTime >= redAt) {
                setCurrentColor('#FF3B30'); // Red
            } else if (yellowAt > 0 && currentServerTime >= yellowAt) {
                setCurrentColor('#FFCC00'); // Yellow  
            } else {
                setCurrentColor('#34C759'); // Green
            }
        }, 300);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isActive, turnStartTime, turnDuration, yellowAt, redAt, serverTimeOffset]);

    if (!isActive) return null;

    return (
        <View
            style={[
                styles.container,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    borderWidth: strokeWidth,
                    borderColor: currentColor,
                    opacity,
                },
            ]}
        />
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: -1, // Behind the dice house content
    },
});
