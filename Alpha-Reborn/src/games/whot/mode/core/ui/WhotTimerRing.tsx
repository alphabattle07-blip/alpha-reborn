import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Path, Skia, BlurMask } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';

interface WhotTimerRingProps {
    isActive: boolean;
    turnEndTime?: number;    // Absolute server timestamp when turn expires
    warningRedAt?: number;   // Absolute server timestamp when timer turns red
    turnDuration?: number;   // Total turn duration in ms (for progress calculation)
    serverTimeOffset?: number; // Date.now() - serverTime (positive = client ahead)
    size?: number;
    strokeWidth?: number;
}

/**
 * An animated timer ring implemented using Skia.
 * Uses absolute server timestamps (turnEndTime) for perfect cross-device sync.
 * Both players see the exact same timer state because they compare against
 * the same server-provided deadline, adjusted by their individual clock offset.
 */
export const WhotTimerRing: React.FC<WhotTimerRingProps> = ({
    isActive,
    turnEndTime = 0,
    warningRedAt = 0,
    turnDuration = 30000,
    serverTimeOffset = 0,
    size = 72,
    strokeWidth = 4,
}) => {
    // 1 to 0 for a reducing circle
    const progress = useSharedValue(1);
    const isRed = useSharedValue(false);

    useEffect(() => {
        if (!isActive || !turnEndTime || !turnDuration) {
            cancelAnimation(progress);
            progress.value = 1;
            isRed.value = false;
            return;
        }

        // Convert server timestamps to local time
        // serverTimeOffset = Date.now() - serverTime  =>  serverTime = Date.now() - offset
        // localEquivalent = serverTimestamp + offset
        const localEndTime = turnEndTime + serverTimeOffset;
        const localRedAt = warningRedAt ? warningRedAt + serverTimeOffset : localEndTime - 5000;

        const now = Date.now();
        const remaining = localEndTime - now;

        if (remaining <= 0) {
            cancelAnimation(progress);
            progress.value = 0;
            isRed.value = true;
            return;
        }

        const initialProgress = remaining / turnDuration;
        progress.value = Math.min(1, Math.max(0, initialProgress));
        isRed.value = now >= localRedAt;

        // Set up exact timing to turn red
        const timeUntilRed = localRedAt - now;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        if (timeUntilRed > 0) {
            timeoutId = setTimeout(() => {
                isRed.value = true;
            }, timeUntilRed);
        }

        // Animate progress from current to 0 over the remaining time
        progress.value = withTiming(0, {
            duration: remaining,
            easing: Easing.linear
        });

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [isActive, turnEndTime, warningRedAt, turnDuration, serverTimeOffset, progress, isRed]);

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
