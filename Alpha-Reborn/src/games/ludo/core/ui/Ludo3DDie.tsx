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
    runOnUI,
} from 'react-native-reanimated';

interface Ludo3DDieProps {
    value: number;
    size?: number;
    isUsed?: boolean;
    isRolling?: boolean; // Indefinite spin mode (waiting for server result)
    style?: ViewStyle;
}

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
    const [internalValue, setInternalValue] = useState(value);
    const lastIsRollingRef = useRef(isRolling);

    useEffect(() => {
        if (value > 0) setInternalValue(value);
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
                setInternalValue(prev => {
                    let next;
                    do { next = Math.floor(Math.random() * 6) + 1; } while (next === prev);
                    return next;
                });
                timeoutRef.current = setTimeout(rollFace, 80 + Math.random() * 40);
            };
            rollFace();

            return () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
            };
        }

        // --- IMMEDIATE STOP: If we were rolling and now we are NOT ---
        if (!isRolling && value > 0) {
            // Hard stop on UI thread to bypass React delay
            const stopAnims = () => {
                'worklet';
                cancelAnimation(bounce);
                cancelAnimation(rotation);
                cancelAnimation(scale);
                bounce.value = 0;
                rotation.value = 0;
                scale.value = 1;
            };
            runOnUI(stopAnims)();
        }

        // GUARD: If the die is already used or value is 0, DO NOT animate.
        if (isUsed || value <= 0) {
            setInternalValue(value);
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
                setInternalValue(value);
                return;
            }

            setInternalValue(prev => {
                let next;
                do { next = Math.floor(Math.random() * 6) + 1; } while (next === prev);
                return next;
            });

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
    const transformArray = useMemo(() => [
        { translateY: 0 },
        { rotate: 0 },
        { scale: 1 }
    ], []);
    
    const transform = useDerivedValue(() => {
        transformArray[0].translateY = bounce.value;
        transformArray[1].rotate = rotation.value;
        transformArray[2].scale = scale.value;
        return transformArray;
    });

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