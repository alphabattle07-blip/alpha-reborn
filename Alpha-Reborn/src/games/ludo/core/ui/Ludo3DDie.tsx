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
    withRepeat,
    Easing,
    useDerivedValue,
    cancelAnimation,
    SharedValue,
} from 'react-native-reanimated';

interface Ludo3DDieProps {
    value: number;
    size?: number;
    isUsed?: boolean;
    isRolling?: boolean; // Indefinite spin mode (waiting for server result)
    style?: ViewStyle;
}

// --- Isolated Pip Component ---
// We render each pip in its own component. This safely isolates `useDerivedValue` 
// preventing "Rules of Hooks" crashes that occur when using hooks inside an inline .map() loop.
const PipSpot = ({ spot, internalValue, pipRadius, pipColor }: { 
    spot: { id: string, cx: number, cy: number, visibleOn: number[] }, 
    internalValue: SharedValue<number>, 
    pipRadius: number, 
    pipColor: string 
}) => {
    const pipOpacity = useDerivedValue(() => {
        return spot.visibleOn.includes(internalValue.value) ? 1 : 0;
    });

    return (
        <Group opacity={pipOpacity}>
            <Circle cx={spot.cx} cy={spot.cy} r={pipRadius} color={pipColor}>
                <Shadow dx={0} dy={1} blur={0.5} color="rgba(255,255,255,0.5)" />
                <Shadow dx={0} dy={-0.5} blur={1} color="black" inner />
            </Circle>
        </Group>
    );
};

export const Ludo3DDie: React.FC<Ludo3DDieProps> = ({
    value,
    size = 40,
    isUsed = false,
    isRolling = false,
    style,
}) => {
    // Measurements
    const r = size * 0.18;
    const pipRadius = size * 0.11;
    const padding = size * 0.22;

    // --- Animation State ---
    // internalValue controls the visual number shown during the rolling animation
    const internalValue = useSharedValue(value > 0 ? value : 1);
    const lastIsRollingRef = useRef(isRolling);

    useEffect(() => {
        if (value > 0) internalValue.value = value;
    }, [value]);

    // Shared values for physics
    const bounce = useSharedValue(0);
    const rotation = useSharedValue(0);
    const scale = useSharedValue(1);

    // Ref to manage the timeout loop for cleanup
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ===========================================
    // CRITICAL: Unmount Cleanup Loop
    // ===========================================
    // Reanimated leaks `withRepeat` and `withTiming` worklets if the component
    // unmounts mid-animation (e.g. game navigation). A leaked `bounce` value
    // causes the dice to be permanently displaced (-Y) in the NEXT match.
    useEffect(() => {
        return () => {
            cancelAnimation(bounce);
            cancelAnimation(rotation);
            cancelAnimation(scale);
        };
    }, []);

    useEffect(() => {
        // --- INDEFINITE ROLLING MODE ---
        if (isRolling && value <= 0) {
            // Continuously looping bounce
            bounce.value = withRepeat(
                withSequence(
                    withTiming(-size * 0.5, { duration: 400, easing: Easing.out(Easing.quad) }),
                    withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) }),
                    withTiming(-size * 0.2, { duration: 250, easing: Easing.out(Easing.quad) }),
                    withTiming(0, { duration: 250, easing: Easing.bounce })
                ),
                -1
            );
            rotation.value = withRepeat(
                withTiming(Math.PI * 2, { duration: 800, easing: Easing.linear }),
                -1
            );
            scale.value = withRepeat(
                withSequence(
                    withTiming(1.1, { duration: 400 }),
                    withTiming(1, { duration: 400 })
                ),
                -1
            );

            // Face switching loop
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            const rollFace = () => {
                let next;
                do { next = Math.floor(Math.random() * 6) + 1; } while (next === internalValue.value);
                internalValue.value = next;
                timeoutRef.current = setTimeout(rollFace, 80 + Math.random() * 40);
            };
            rollFace();

            return () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
            };
        }

        // --- IMMEDIATE STOP: If we were rolling and now we are NOT ---
        if (!isRolling && value > 0) {
            // Instantly stop animations on JS thread bridging
            cancelAnimation(bounce);
            cancelAnimation(rotation);
            cancelAnimation(scale);
            bounce.value = 0;
            rotation.value = 0;
            scale.value = 1;
        }

        // GUARD: If the die is already used or value is 0, DO NOT animate.
        if (isUsed || value <= 0) {
            if (value > 0) internalValue.value = value;
            bounce.value = 0;
            rotation.value = 0;
            scale.value = 1;
            return;
        }

        // --- Normal Animation Sequence (value arrived) ---
        bounce.value = 0;
        rotation.value = 0;
        scale.value = 1;

        // Punchier settle animation (reduced from 1000ms)
        const TOTAL_DURATION = 400;

        bounce.value = withSequence(
            withTiming(-size * 0.8, { duration: TOTAL_DURATION * 0.3, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: TOTAL_DURATION * 0.3, easing: Easing.in(Easing.quad) }),
            withSequence(
                withTiming(-size * 0.2, { duration: TOTAL_DURATION * 0.2, easing: Easing.out(Easing.quad) }),
                withTiming(0, { duration: TOTAL_DURATION * 0.2, easing: Easing.bounce })
            )
        );

        rotation.value = withTiming(Math.PI * 2, {
            duration: TOTAL_DURATION * 0.8,
            easing: Easing.out(Easing.cubic)
        });

        scale.value = withSequence(
            withTiming(1.1, { duration: TOTAL_DURATION * 0.3 }),
            withTiming(1, { duration: TOTAL_DURATION * 0.7 })
        );

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        let elapsedTime = 0;
        let currentDelay = 50;

        const rollFace = () => {
            if (elapsedTime >= TOTAL_DURATION) {
                internalValue.value = value;
                return;
            }

            let next;
            do { next = Math.floor(Math.random() * 6) + 1; } while (next === internalValue.value);
            internalValue.value = next;

            elapsedTime += currentDelay;
            currentDelay = Math.min(currentDelay * 1.2, 250);
            timeoutRef.current = setTimeout(rollFace, currentDelay);
        };

        rollFace();

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [value, size, isUsed, isRolling]);

    // Derived transform for the Skia Group
    const transform = useDerivedValue(() => {
        return [
            { translateY: bounce.value },
            { rotate: rotation.value },
            { scale: scale.value }
        ];
    });

    // --- UI Thread Pip Calculation ---
    const center = size / 2;
    const left = padding;
    const right = size - padding;
    const top = padding;
    const bottom = size - padding;

    // Spots definitions (7 typical spots)
    const spots = [
        { id: 'tl', cx: left, cy: top, visibleOn: [2, 3, 4, 5, 6] },
        { id: 'tr', cx: right, cy: top, visibleOn: [4, 5, 6] },
        { id: 'cl', cx: left, cy: center, visibleOn: [6] },
        { id: 'cr', cx: right, cy: center, visibleOn: [6] },
        { id: 'bl', cx: left, cy: bottom, visibleOn: [4, 5, 6] },
        { id: 'br', cx: right, cy: bottom, visibleOn: [2, 3, 4, 5, 6] },
        { id: 'cc', cx: center, cy: center, visibleOn: [1, 3, 5] },
    ];

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

                    {/* Pips rendered statically, opacity controlled via SharedValue */}
                    {spots.map((spot) => (
                        <PipSpot
                            key={spot.id}
                            spot={spot}
                            internalValue={internalValue}
                            pipRadius={pipRadius}
                            pipColor={pipColor}
                        />
                    ))}
                </Group>
            </Canvas>
        </View>
    );
};