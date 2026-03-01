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

        console.log("[LudoTimerRing] Active:", { isActive, turnStartTime, turnDuration, yellowAt, redAt });
        const checkColor = () => {
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
        };

        checkColor(); // initial check
        intervalRef.current = setInterval(checkColor, 1000); // Check every second

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isActive, turnStartTime, turnDuration, yellowAt, redAt, serverTimeOffset]);

    if (!isActive) return null;

    return (
        <View
            pointerEvents="none"
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
    },
});

export const useLudoTimerColor = (props?: Omit<LudoTimerRingProps, 'size' | 'strokeWidth'>) => {
    const [currentColor, setCurrentColor] = useState('rgba(255,255,255,0.2)');

    useEffect(() => {
        if (!props?.isActive || !props?.turnStartTime || !props?.turnDuration) {
            setCurrentColor('rgba(255,255,255,0.2)');
            return;
        }

        const checkColor = () => {
            const currentServerTime = Date.now() - (props.serverTimeOffset || 0);
            const elapsed = currentServerTime - props.turnStartTime!;

            if (elapsed >= props.turnDuration!) {
                setCurrentColor('#FF0000');
                return;
            }

            if (props.redAt && props.redAt > 0 && currentServerTime >= props.redAt) {
                setCurrentColor('#FF3B30');
            } else if (props.yellowAt && props.yellowAt > 0 && currentServerTime >= props.yellowAt) {
                setCurrentColor('#FFCC00');
            } else {
                setCurrentColor('#34C759');
            }
        };

        checkColor();
        const intervalId = setInterval(checkColor, 1000);

        return () => clearInterval(intervalId);
    }, [props?.isActive, props?.turnStartTime, props?.turnDuration, props?.yellowAt, props?.redAt, props?.serverTimeOffset]);

    return currentColor;
};
