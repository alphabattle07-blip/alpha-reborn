import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withLinear,
    Easing,
    cancelAnimation,
    useDerivedValue,
    interpolateColor
} from 'react-native-reanimated';
import { Svg, Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;

    const progress = useSharedValue(1); // 1 = full, 0 = empty
    const [currentColor, setCurrentColor] = useState('#00FF00'); // Default Green

    useEffect(() => {
        if (!isActive || !turnStartTime || !turnDuration) {
            cancelAnimation(progress);
            progress.value = 0;
            setCurrentColor('#888888'); // Inactive color
            return;
        }

        const nowServer = Date.now() - serverTimeOffset;
        const elapsedAtStart = Math.max(0, nowServer - turnStartTime);
        const remainingTime = Math.max(0, turnDuration - elapsedAtStart);

        // Calculate starting progress ratio
        const initialProgress = remainingTime / turnDuration;
        progress.value = initialProgress;

        // Animate to 0 linearly over the remaining time
        if (remainingTime > 0) {
            progress.value = withTiming(0, {
                duration: remainingTime,
                easing: Easing.linear,
            });
        }

        // Set up a simple JS interval to check warning thresholds 
        // We only use this for color swapping to avoid Reanimated color interpolation overhead
        const colorCheckInterval = setInterval(() => {
            const currentServerTime = Date.now() - serverTimeOffset;
            if (warningRedAt > 0 && currentServerTime >= warningRedAt) {
                setCurrentColor('#FF0000'); // Red
            } else if (warningYellowAt > 0 && currentServerTime >= warningYellowAt) {
                setCurrentColor('#FFD700'); // Yellow
            } else {
                setCurrentColor('#00FF00'); // Green
            }
        }, 200);

        return () => {
            cancelAnimation(progress);
            clearInterval(colorCheckInterval);
        };
    }, [isActive, turnStartTime, turnDuration, warningYellowAt, warningRedAt, serverTimeOffset]);

    const animatedProps = useAnimatedStyle(() => {
        return {
            strokeDashoffset: circumference * (1 - progress.value),
        };
    });

    if (!isActive) return null; // Only show ring on active player to reduce UI clutter

    return (
        <View style={[{ width: size, height: size }, styles.container]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <AnimatedCircle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={currentColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeLinecap="round"
                    fill="none"
                    style={animatedProps}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`} // Start from top
                />
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1, // Behind the avatar
    },
});
