import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';

interface WhotTimerRingProps {
    isActive: boolean;
    turnStartTime?: number;
    turnDuration?: number;
    warningYellowAt?: number;
    warningRedAt?: number;
    serverTimeOffset?: number; // local time - server time
    size?: number;
    strokeWidth?: number;
}

/**
 * A simple timer ring implemented using View borders.
 * Changes border color based on warning thresholds.
 * No external SVG dependency required.
 */
export const WhotTimerRing: React.FC<WhotTimerRingProps> = ({
    isActive,
    turnStartTime = 0,
    turnDuration = 30000,
    warningYellowAt = 0,
    warningRedAt = 0,
    serverTimeOffset = 0,
    size = 72,
    strokeWidth = 4,
}) => {
    const [currentColor, setCurrentColor] = useState('#00FF00'); // Default Green
    const [opacity, setOpacity] = useState(1);
    const colorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!isActive || !turnStartTime || !turnDuration) {
            setCurrentColor('#555555'); // Inactive color
            setOpacity(0.3);
            if (colorIntervalRef.current) clearInterval(colorIntervalRef.current);
            return;
        }

        setOpacity(1);

        // Set up a JS interval to check warning thresholds (200ms resolution) 
        colorIntervalRef.current = setInterval(() => {
            const currentServerTime = Date.now() - serverTimeOffset;
            const elapsed = currentServerTime - turnStartTime;
            const remaining = turnDuration - elapsed;

            if (remaining <= 0) {
                setCurrentColor('#FF0000'); // Expired
                setOpacity(0.5);
                return;
            }

            if (warningRedAt > 0 && currentServerTime >= warningRedAt) {
                setCurrentColor('#FF0000'); // Red
            } else if (warningYellowAt > 0 && currentServerTime >= warningYellowAt) {
                setCurrentColor('#FFD700'); // Yellow  
            } else {
                setCurrentColor('#00FF00'); // Green
            }
        }, 200);

        return () => {
            if (colorIntervalRef.current) clearInterval(colorIntervalRef.current);
        };
    }, [isActive, turnStartTime, turnDuration, warningYellowAt, warningRedAt, serverTimeOffset]);

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
        zIndex: 1,
    },
});
