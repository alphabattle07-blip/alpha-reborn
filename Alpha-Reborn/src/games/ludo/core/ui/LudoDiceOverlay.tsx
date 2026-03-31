// LudoDiceOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Pure React Native Animated dice — NO Skia Canvas.
// Renders dice as Animated.Views on TOP of the Skia board.
// This eliminates 60fps forced Skia Canvas redraws during dice animations,
// which was the root cause of the Exynos GPU updateAndRelease() crash.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
    SharedValue,
    useAnimatedStyle,
    useDerivedValue,
} from 'react-native-reanimated';

// ── Layout Constants (must match DiceHouseMaster touch targets) ──────────────
const DICE_POS = {
    blue:  { x: 0.385, y: 0.800 },
    green: { x: 0.600, y: 0.270 },
} as const;

const HOUSE_W = 90;
const HOUSE_H = 60;
const DIE_PADDING_X = 7.5;
const DIE_PADDING_Y = 12;
const DIE_SIZE = 35;
const DIE_GAP = 5;
const PIP_RADIUS = DIE_SIZE * 0.09;
const CORNER_RADIUS = DIE_SIZE * 0.18;

// ── Pip Configuration ──────────────────────────────────────────────────────
// Bitmask: sum of (1 << faceValue) for each visible face
const SPOTS = [
    { id: 'tl', cx: 0.22, cy: 0.22, visibleMask: (1<<2)|(1<<3)|(1<<4)|(1<<5)|(1<<6) },
    { id: 'tr', cx: 0.78, cy: 0.22, visibleMask: (1<<4)|(1<<5)|(1<<6) },
    { id: 'cl', cx: 0.22, cy: 0.50, visibleMask: (1<<6) },
    { id: 'cr', cx: 0.78, cy: 0.50, visibleMask: (1<<6) },
    { id: 'bl', cx: 0.22, cy: 0.78, visibleMask: (1<<4)|(1<<5)|(1<<6) },
    { id: 'br', cx: 0.78, cy: 0.78, visibleMask: (1<<2)|(1<<3)|(1<<4)|(1<<5)|(1<<6) },
    { id: 'cc', cx: 0.50, cy: 0.50, visibleMask: (1<<1)|(1<<3)|(1<<5) },
];

// ── Single Pip (Animated visibility) ──────────────────────────────────────
const AnimatedPip = ({
    cx, cy, visibleMask, faceValue, pipColor,
}: {
    cx: number; cy: number; visibleMask: number;
    faceValue: SharedValue<number>; pipColor: string;
}) => {
    const animStyle = useAnimatedStyle(() => {
        'worklet';
        const v = Math.round(faceValue.value);
        return { opacity: (visibleMask & (1 << v)) !== 0 ? 1 : 0 };
    });

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    left: cx * DIE_SIZE - PIP_RADIUS,
                    top: cy * DIE_SIZE - PIP_RADIUS,
                    width: PIP_RADIUS * 2,
                    height: PIP_RADIUS * 2,
                    borderRadius: PIP_RADIUS,
                    backgroundColor: pipColor,
                },
                animStyle,
            ]}
        />
    );
};

// ── Single Die (Animated transform) ──────────────────────────────────────
const AnimatedDie = ({
    faceValue, bounce, rotation, scale, isUsed,
}: {
    faceValue: SharedValue<number>;
    bounce: SharedValue<number>;
    rotation: SharedValue<number>;
    scale: SharedValue<number>;
    isUsed: boolean;
}) => {
    const bgColor = isUsed ? '#d6d6d6' : '#ffffff';
    const pipColor = isUsed ? 'rgba(0,0,0,0.4)' : 'black';

    const animStyle = useAnimatedStyle(() => {
        'worklet';
        return {
            transform: [
                { translateY: bounce.value },
                { rotate: `${rotation.value}rad` },
                { scale: scale.value },
            ],
        };
    });

    return (
        <Animated.View style={[styles.die, { backgroundColor: bgColor }, animStyle]}>
            {/* Shadow layer */}
            <View style={styles.dieShadow} />
            {/* Pips */}
            {SPOTS.map((s) => (
                <AnimatedPip
                    key={s.id}
                    cx={s.cx}
                    cy={s.cy}
                    visibleMask={s.visibleMask}
                    faceValue={faceValue}
                    pipColor={pipColor}
                />
            ))}
        </Animated.View>
    );
};

// ── Exported Overlay ──────────────────────────────────────────────────────
export interface DiceOverlayAnimState {
    face0: SharedValue<number>;
    face1: SharedValue<number>;
    bounce: SharedValue<number>;
    rotation: SharedValue<number>;
    scale: SharedValue<number>;
}

interface LudoDiceOverlayProps {
    anim: DiceOverlayAnimState;
    activeColor: 'blue' | 'green';
    show0: boolean;
    show1: boolean;
    isRolling: boolean;
    diceUsed: boolean[];
}

export const LudoDiceOverlay: React.FC<LudoDiceOverlayProps> = ({
    anim, activeColor, show0, show1, isRolling, diceUsed,
}) => {
    const { width: screenW, height: screenH } = useWindowDimensions();

    const pos = DICE_POS[activeColor];
    const houseLeft = pos.x * screenW - HOUSE_W / 2;
    const houseTop  = pos.y * screenH - HOUSE_H / 2;
    const d0Left = houseLeft + DIE_PADDING_X;
    const d1Left = houseLeft + DIE_PADDING_X + DIE_SIZE + DIE_GAP;
    const dTop   = houseTop + DIE_PADDING_Y;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* House background */}
            <View style={[styles.house, { left: houseLeft, top: houseTop }]} />

            {/* Die 0 */}
            {show0 && (
                <View style={[styles.dieContainer, { left: d0Left, top: dTop }]}>
                    <AnimatedDie
                        faceValue={anim.face0}
                        bounce={anim.bounce}
                        rotation={anim.rotation}
                        scale={anim.scale}
                        isUsed={!isRolling && (diceUsed[0] ?? false)}
                    />
                </View>
            )}

            {/* Die 1 */}
            {show1 && (
                <View style={[styles.dieContainer, { left: d1Left, top: dTop }]}>
                    <AnimatedDie
                        faceValue={anim.face1}
                        bounce={anim.bounce}
                        rotation={anim.rotation}
                        scale={anim.scale}
                        isUsed={!isRolling && (diceUsed[1] ?? false)}
                    />
                </View>
            )}
        </View>
    );
};

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    house: {
        position: 'absolute',
        width: HOUSE_W,
        height: HOUSE_H,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    dieContainer: {
        position: 'absolute',
        width: DIE_SIZE,
        height: DIE_SIZE,
    },
    die: {
        width: DIE_SIZE - 1,
        height: DIE_SIZE - 1,
        borderRadius: CORNER_RADIUS,
        overflow: 'hidden',
    },
    dieShadow: {
        position: 'absolute',
        left: 1,
        top: 4,
        width: DIE_SIZE - 3,
        height: DIE_SIZE - 3,
        borderRadius: CORNER_RADIUS,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
});
