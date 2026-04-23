import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Path, Skia, BlurMask } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';

interface WhotTimerRingProps {
    isActive: boolean;
    turnStartTime?: number;
    turnDuration?: number;
    warningYellowAt?: number; // Kept for interface compatibility but ignored in logic
    warningRedAt?: number; // Kept for interface compatibility but ignored in logic
    serverTimeOffset?: number; // local time - server time
    size?: number;
    strokeWidth?: number;
}

/**
 * An animated timer ring implemented using Skia.
 * Starts at 30 seconds green, gradually reduces, turns red at 5 seconds.
 */
export const WhotTimerRing: React.FC<WhotTimerRingProps> = ({
    isActive,
    turnStartTime = 0,
    turnDuration = 15000,
    serverTimeOffset = 0,
    size = 72,
    strokeWidth = 4,
}) => {
    // 1 to 0 for a reducing circle
    const progress = useSharedValue(1);
    const isRed = useSharedValue(false);

    useEffect(() => {
        if (!isActive || !turnStartTime || !turnDuration) {
            cancelAnimation(progress);
            progress.value = 1;
            isRed.value = false;
            return;
        }

        const currentServerTime = Date.now() - serverTimeOffset;
        const elapsed = currentServerTime - turnStartTime;
        const remaining = turnDuration - elapsed;

        if (remaining <= 0) {
            cancelAnimation(progress);
            progress.value = 0;
            isRed.value = true;
            return;
        }

        const initialProgress = remaining / turnDuration;
        progress.value = initialProgress;
        isRed.value = remaining <= 5000;

        // Set up exact timing to turn red at 5s remaining
        const timeUntilRed = remaining - 5000;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        if (timeUntilRed > 0) {
            timeoutId = setTimeout(() => {
                isRed.value = true;
            }, timeUntilRed);
        }

        progress.value = withTiming(0, {
            duration: remaining,
            easing: Easing.linear
        });

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [isActive, turnStartTime, turnDuration, serverTimeOffset, progress, isRed]);

    const strokeColor = useDerivedValue(() => {
        return isRed.value ? '#FF0000' : '#00FF00';
    });

    if (!isActive) return null;

    // Create the circle path
    const radius = (size - strokeWidth) / 2;
    
    // Create a path for a circle starting from the top (-90 degrees) and sweeping 360 degrees
    const path = Skia.Path.Make();
    path.addArc({ x: strokeWidth / 2, y: strokeWidth / 2, width: radius * 2, height: radius * 2 }, -90, 360);

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Canvas style={{ width: size, height: size }}>
                {/* Background Track (lightly visible so progress bounds are clear) */}
                <Path
                    path={path}
                    style="stroke"
                    strokeWidth={strokeWidth}
                    color="rgba(255, 255, 255, 0.1)"
                />
                
                {/* Active Progress Ring with a glowing blur mask */}
                <Path
                    path={path}
                    style="stroke"
                    strokeWidth={strokeWidth}
                    color={strokeColor}
                    strokeCap="round"
                    start={0}
                    end={progress}
                >
                    <BlurMask blur={3} style="solid" />
                </Path>
            </Canvas>
        </View>
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
