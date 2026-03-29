// Ludo3DDieGroup.tsx
// ─────────────────────────────────────────────────────────────────────────────
// A "Sub-Canvas" component — it has NO <Canvas> of its own.
// It emits only Skia Group/Shape primitives that a parent Canvas renders.
// This is the fundamental fix for the EGL Bad Surface (12301) crash:
// every Canvas = 1 GPU surface. Fewer canvases = fewer surface leaks.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import {
    Group,
    RoundedRect,
    LinearGradient,
    vec,
    Circle,
} from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';

interface Ludo3DDieGroupProps {
    // The dice face value (1-6). SharedValue so pips update on the UI thread.
    value: SharedValue<number>;
    // Die size in pixels — must match the layout reservation.
    size: number;
    // Animation shared values driven by DiceHouseMaster
    bounce: SharedValue<number>;
    rotation: SharedValue<number>;
    scale: SharedValue<number>;
    // Visual state
    isUsed?: boolean;
    // Pixel offset within the parent Canvas so we can draw two dice side-by-side
    offsetX?: number;
    offsetY?: number;
}

// Spot definitions — each spot knows which face values it should appear on, represented as a generic bitmask for fast UI thread evaluation.
// Bitmask: sum of (1 << faceValue) for each visible face.
const SPOTS = [
    { id: 'tl', cx: 0.22, cy: 0.22, visibleMask: (1<<2)|(1<<3)|(1<<4)|(1<<5)|(1<<6) },
    { id: 'tr', cx: 0.78, cy: 0.22, visibleMask: (1<<4)|(1<<5)|(1<<6) },
    { id: 'cl', cx: 0.22, cy: 0.50, visibleMask: (1<<6) },
    { id: 'cr', cx: 0.78, cy: 0.50, visibleMask: (1<<6) },
    { id: 'bl', cx: 0.22, cy: 0.78, visibleMask: (1<<4)|(1<<5)|(1<<6) },
    { id: 'br', cx: 0.78, cy: 0.78, visibleMask: (1<<2)|(1<<3)|(1<<4)|(1<<5)|(1<<6) },
    { id: 'cc', cx: 0.50, cy: 0.50, visibleMask: (1<<1)|(1<<3)|(1<<5) },
];

// Each pip is isolated so useDerivedValue is legal (hooks inside .map is illegal).
const Pip = ({
    cx,
    cy,
    visibleMask,
    value,
    pipRadius,
    pipColor,
}: {
    cx: number;
    cy: number;
    visibleMask: number;
    value: SharedValue<number>;
    pipRadius: number;
    pipColor: string;
}) => {
    // High-performance bitwise evaluation on the UI thread — prevents array copying
    const opacity = useDerivedValue(() => {
        const v = Math.round(value.value);
        return (visibleMask & (1 << v)) !== 0 ? 1 : 0;
    });
    return (
        <Group opacity={opacity}>
            {/* Fake bevel — cheap inner shadow without Gaussian Blur */}
            <Circle cx={cx} cy={cy - 0.5} r={pipRadius} color="rgba(0,0,0,0.8)" />
            <Circle cx={cx} cy={cy} r={pipRadius * 0.9} color={pipColor} />
        </Group>
    );
};

export const Ludo3DDieGroup: React.FC<Omit<Ludo3DDieGroupProps, 'offsetX' | 'offsetY'>> = ({
    value,
    size,
    bounce,
    rotation,
    scale,
    isUsed = false,
}) => {
    const r = size * 0.18;
    const pipRadius = size * 0.11;
    const pipColor = isUsed ? 'rgba(0,0,0,0.4)' : 'black';
    const startColor = isUsed ? '#d6d6d6' : '#ffffff';
    const endColor = isUsed ? '#a8a8a8' : '#e0e0e0';

    // Die body transform — purely driven by shared values, no static closures
    const transform = useDerivedValue(() => [
        { translateX: size / 2 },
        { translateY: size / 2 + bounce.value },
        { rotate: rotation.value },
        { scale: scale.value },
        { translateX: -(size / 2) },
        { translateY: -(size / 2) },
    ]);

    return (
        <Group transform={transform}>
            {/* Static shadow (no Gaussian Blur = zero GPU memory cost) */}
            <RoundedRect
                x={1}
                y={4}
                width={size - 2}
                height={size - 2}
                r={r}
                color="rgba(0,0,0,0.35)"
            />
            {/* Die face */}
            <RoundedRect x={0} y={0} width={size - 1} height={size - 1} r={r}>
                <LinearGradient
                    start={vec(0, 0)}
                    end={vec(size, size)}
                    colors={[startColor, endColor]}
                />
            </RoundedRect>
            {/* Pips */}
            {SPOTS.map((s) => (
                <Pip
                    key={s.id}
                    cx={s.cx * size}
                    cy={s.cy * size}
                    visibleMask={s.visibleMask}
                    value={value}
                    pipRadius={pipRadius}
                    pipColor={pipColor}
                />
            ))}
        </Group>
    );
};
