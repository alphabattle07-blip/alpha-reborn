import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withTiming,
    Easing,
    interpolateColor,
    useDerivedValue,
    useAnimatedStyle,
    cancelAnimation,
} from 'react-native-reanimated';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedView = Animated.createAnimatedComponent(View);

interface LudoTimerRingProps {
    isActive: boolean;
    turnStartTime?: number;
    turnDuration?: number;
    yellowAt?: number;
    redAt?: number;
    serverTimeOffset?: number;
    size?: number; // Kept for compatibility, width/height preferred
    width?: number;
    height?: number;
    borderRadius?: number;
    strokeWidth?: number;
}

/**
 * A timer ring for Ludo dice house.
 * Uses SVG and Reanimated to smoothly shrink a borderline progress bar over the duration.
 * Shape follows a rounded rectangle to match the DiceHouse.
 */
export const LudoTimerRing: React.FC<LudoTimerRingProps> = ({
    isActive,
    turnStartTime = 0,
    turnDuration = 15000,
    yellowAt = 0,
    redAt = 0,
    serverTimeOffset = 0,
    size = 100,
    width: propWidth,
    height: propHeight,
    borderRadius = 15,
    strokeWidth = 3,
}) => {
    const W = propWidth || size;
    const H = propHeight || size;
    const R = borderRadius;

    // Perimeter of a rounded rectangle: 2(W-2R) + 2(H-2R) + 2*PI*R
    const perimeter = useMemo(() => {
        return 2 * (W - 2 * R) + 2 * (H - 2 * R) + 2 * Math.PI * R;
    }, [W, H, R]);

    const progress = useSharedValue(isActive ? 1 : 0);

    // ===========================================
    // CRITICAL: Unmount Cleanup Loop
    // ===========================================
    useEffect(() => {
        return () => cancelAnimation(progress);
    }, []);

    useEffect(() => {
        if (!isActive || !turnStartTime || !turnDuration) {
            progress.value = withTiming(0, { duration: 300 });
            return;
        }

        const currentServerTime = Date.now() - serverTimeOffset;
        const elapsed = currentServerTime - turnStartTime;
        const remaining = Math.max(0, turnDuration - elapsed);

        // Snap to current progress
        progress.value = remaining / turnDuration;

        // Animate remaining time
        if (remaining > 0) {
            progress.value = withTiming(0, {
                duration: remaining,
                easing: Easing.linear,
            });
        }
    }, [isActive, turnStartTime, turnDuration, serverTimeOffset]);

    const isWarningZone = useDerivedValue(() => {
        if (!isActive || !turnStartTime) return false;
        const currentServerTime = Date.now() - serverTimeOffset;
        const threshold = redAt || (turnStartTime + turnDuration * 0.7);
        return currentServerTime >= threshold;
    });

    const strokeColor = useDerivedValue(() => {
        if (!isActive) return '#555555';
        if (isWarningZone.value) return '#FF3B30';
        
        const remainingMs = progress.value * turnDuration;
        const yellowThreshold = (turnDuration - (yellowAt - turnStartTime)) || 8000;

        return interpolateColor(
            remainingMs,
            [0, yellowThreshold, yellowThreshold + 1000],
            ['#FF3B30', '#FFCC00', '#34C759']
        );
    });

    const animatedProps = useAnimatedProps(() => {
        return {
            strokeDashoffset: -perimeter * (1 - progress.value),
            stroke: strokeColor.value,
        };
    });

    const containerStyle = useAnimatedStyle(() => {
        if (!isWarningZone.value) return { transform: [{ scale: 1 }] };
        
        // Simple pulsing effect in warning zone
        const pulse = 1 + Math.sin(Date.now() / 200) * 0.03;
        return {
            transform: [{ scale: pulse }]
        };
    });

    const svgStyles = [
        styles.container,
        { width: W, height: H }
    ];

    if (!isActive) return null;

    return (
        <AnimatedView pointerEvents="none" style={[svgStyles, containerStyle]}>
            <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                <AnimatedRect
                    x={strokeWidth / 2}
                    y={strokeWidth / 2}
                    width={W - strokeWidth}
                    height={H - strokeWidth}
                    rx={R}
                    ry={R}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={perimeter}
                    animatedProps={animatedProps}
                    strokeLinecap="round"
                />
            </Svg>
        </AnimatedView>
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
    const [currentColor, setCurrentColor] = React.useState('rgba(255,255,255,0.2)');

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
            if (props.redAt && currentServerTime >= props.redAt) {
                setCurrentColor('#FF3B30');
            } else {
                setCurrentColor('#34C759');
            }
        };

        checkColor();
        const intervalId = setInterval(checkColor, 1000);
        return () => clearInterval(intervalId);
    }, [props?.isActive, props?.turnStartTime, props?.turnDuration, props?.redAt, props?.serverTimeOffset]);

    return currentColor;
};
