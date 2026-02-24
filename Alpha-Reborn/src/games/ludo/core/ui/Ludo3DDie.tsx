// Ludo3DDie.tsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
    Canvas,
    RoundedRect,
    LinearGradient,
    vec,
    Circle,
    Group,
    Shadow,
} from '@shopify/react-native-skia';
import { ViewStyle, View } from 'react-native';
import {
    useSharedValue,
    withSequence,
    withTiming,
    Easing,
    useDerivedValue,
} from 'react-native-reanimated';

interface Ludo3DDieProps {
    value: number;
    size?: number;
    isUsed?: boolean;
    style?: ViewStyle;
}

export const Ludo3DDie: React.FC<Ludo3DDieProps> = ({
    value,
    size = 40,
    isUsed = false,
    style,
}) => {
    // Measurements
    const r = size * 0.18;
    const pipRadius = size * 0.11;
    const padding = size * 0.22;

    // --- Animation State ---
    // internalValue controls the visual number shown during the rolling animation
    const [internalValue, setInternalValue] = useState(value);

    // Shared values for physics
    const bounce = useSharedValue(0);
    const rotation = useSharedValue(0);
    const scale = useSharedValue(1);

    // Ref to manage the timeout loop for cleanup
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // GUARD: If the die is already used or value is 0, DO NOT animate.
        // This prevents re-rolling when the component remounts or receives unrelated updates.
        if (isUsed || value <= 0) {
            setInternalValue(value);
            // Reset physics to rest state immediately
            bounce.value = 0;
            rotation.value = 0;
            scale.value = 1;
            return;
        }

        // --- Start Animation Sequence ---
        // (Only runs for valid, unused, new rolls)

        // 1. Reset Physics
        bounce.value = 0;
        rotation.value = 0;
        scale.value = 1;

        const TOTAL_DURATION = 1000; // 1 second total roll time

        // 2. Physics Animation (Reanimated)

        // Bounce: Hop Up High -> Drop -> Settle Bounce
        bounce.value = withSequence(
            withTiming(-size * 0.8, { duration: TOTAL_DURATION * 0.3, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: TOTAL_DURATION * 0.3, easing: Easing.in(Easing.quad) }),
            withSequence(
                withTiming(-size * 0.2, { duration: TOTAL_DURATION * 0.2, easing: Easing.out(Easing.quad) }),
                withTiming(0, { duration: TOTAL_DURATION * 0.2, easing: Easing.bounce })
            )
        );

        // Rotation: Spin 360 degrees (2 PI)
        rotation.value = withTiming(Math.PI * 2, {
            duration: TOTAL_DURATION * 0.8,
            easing: Easing.out(Easing.cubic)
        });

        // Scale: Slight breath
        scale.value = withSequence(
            withTiming(1.1, { duration: TOTAL_DURATION * 0.3 }),
            withTiming(1, { duration: TOTAL_DURATION * 0.7 })
        );

        // 3. Face Switching Logic (JS Loop)
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        let elapsedTime = 0;
        let currentDelay = 50; // Start fast (50ms)

        const rollFace = () => {
            // If duration exceeded, settle on the FINAL value
            if (elapsedTime >= TOTAL_DURATION) {
                setInternalValue(value);
                return;
            }

            // Show a random face (1-6) ensuring it's different from previous
            setInternalValue(prev => {
                let next;
                do {
                    next = Math.floor(Math.random() * 6) + 1;
                } while (next === prev);
                return next;
            });

            // Increase elapsed time and slow down loop (simulate friction)
            elapsedTime += currentDelay;
            currentDelay = Math.min(currentDelay * 1.2, 250);

            timeoutRef.current = setTimeout(rollFace, currentDelay);
        };

        rollFace();

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [value, size, isUsed]); // Dependency ensures this runs when value updates

    // Derived transform for the Skia Group
    const transform = useDerivedValue(() => [
        { translateY: bounce.value },
        { rotate: rotation.value },
        { scale: scale.value }
    ]);

    // --- Pip Calculation (Based on internalValue) ---
    const pips = useMemo(() => {
        const center = size / 2;
        const left = padding;
        const right = size - padding;
        const top = padding;
        const bottom = size - padding;

        const positions: { cx: number; cy: number }[] = [];
        const add = (cx: number, cy: number) => positions.push({ cx, cy });

        // Use internalValue for display, default to 1 if something goes wrong
        const val = internalValue > 0 ? internalValue : 1;

        switch (val) {
            case 1:
                add(center, center);
                break;
            case 2:
                add(left, bottom); add(right, top);
                break;
            case 3:
                add(left, bottom); add(center, center); add(right, top);
                break;
            case 4:
                add(left, top); add(right, top);
                add(left, bottom); add(right, bottom);
                break;
            case 5:
                add(left, top); add(right, top);
                add(center, center);
                add(left, bottom); add(right, bottom);
                break;
            case 6:
                add(left, top); add(right, top);
                add(left, center); add(right, center);
                add(left, bottom); add(right, bottom);
                break;
        }
        return positions;
    }, [internalValue, size, padding]);

    // Colors
    const startColor = isUsed ? '#d6d6d6' : '#ffffff';
    const endColor = isUsed ? '#a8a8a8' : '#e0e0e0';
    const pipColor = isUsed ? 'rgba(0,0,0,0.4)' : 'black';

    return (
        <View style={[{ width: size, height: size }, style]}>
            <Canvas style={{ flex: 1 }}>
                {/* Static Shadow (stays on ground) */}
                <RoundedRect
                    x={2}
                    y={3}
                    width={size - 4}
                    height={size - 4}
                    r={r}
                    color="rgba(0,0,0,0.2)"
                >
                    <Shadow dx={0} dy={2} blur={4} color="rgba(0,0,0,0.3)" />
                </RoundedRect>

                {/* Animated Die Body */}
                <Group transform={transform} origin={{ x: size / 2, y: size / 2 }}>
                    <RoundedRect x={0} y={0} width={size - 1} height={size - 1} r={r}>
                        <LinearGradient
                            start={vec(0, 0)}
                            end={vec(size, size)}
                            colors={[startColor, endColor]}
                        />
                        {/* Inner Bevel Highlight */}
                        <Shadow dx={-1} dy={-1} blur={2} color="white" inner />
                        <Shadow dx={2} dy={2} blur={3} color="rgba(0,0,0,0.2)" inner />
                    </RoundedRect>

                    {/* Pips */}
                    {pips.map((p, i) => (
                        <Group key={i}>
                            <Circle cx={p.cx} cy={p.cy} r={pipRadius} color={pipColor}>
                                <Shadow dx={0} dy={1} blur={0.5} color="rgba(255,255,255,0.5)" />
                                <Shadow dx={0} dy={-0.5} blur={1} color="black" inner />
                            </Circle>
                        </Group>
                    ))}
                </Group>
            </Canvas>
        </View>
    );
};