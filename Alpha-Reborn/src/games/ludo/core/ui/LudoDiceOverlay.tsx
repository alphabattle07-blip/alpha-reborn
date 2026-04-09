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
    cx, cy, visibleMask, faceValue, pipColor, dieSize, pipRadius,
}: {
    cx: number; cy: number; visibleMask: number;
    faceValue: SharedValue<number>; pipColor: string;
    dieSize: number; pipRadius: number;
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
                    left: cx * dieSize - pipRadius,
                    top: cy * dieSize - pipRadius,
                    width: pipRadius * 2,
                    height: pipRadius * 2,
                    borderRadius: pipRadius,
                    backgroundColor: pipColor,
                },
                animStyle,
            ]}
        />
    );
};

// ── Single Die (Animated transform) ──────────────────────────────────────
const AnimatedDie = ({
    faceValue, bounce, rotation, scale, isUsed, dieSize, pipRadius,
}: {
    faceValue: SharedValue<number>;
    bounce: SharedValue<number>;
    rotation: SharedValue<number>;
    scale: SharedValue<number>;
    isUsed: boolean;
    dieSize: number;
    pipRadius: number;
}) => {
    const bgColor = isUsed ? '#d6d6d6' : '#ffffff';
    const cornerRadius = dieSize * 0.18;
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
        <Animated.View style={[
            styles.die, 
            { 
                backgroundColor: bgColor, 
                width: dieSize - 1, 
                height: dieSize - 1, 
                borderRadius: cornerRadius 
            }, 
            animStyle
        ]}>
            {/* Shadow layer */}
            <View style={[
                styles.dieShadow, 
                { 
                    width: dieSize - 3, 
                    height: dieSize - 3, 
                    borderRadius: cornerRadius 
                }
            ]} />
            {/* Pips */}
            {SPOTS.map((s) => (
                <AnimatedPip
                    key={s.id}
                    cx={s.cx}
                    cy={s.cy}
                    visibleMask={s.visibleMask}
                    faceValue={faceValue}
                    pipColor={pipColor}
                    dieSize={dieSize}
                    pipRadius={pipRadius}
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
    anim: any;
    activeColor: 'blue' | 'green';
    show0: boolean;
    show1: boolean;
    isRolling: boolean;
    diceUsed: boolean[];
    // Responsive Layout Props
    boardX: number;
    boardY: number;
    boardSize: number;
}

export const LudoDiceOverlay: React.FC<LudoDiceOverlayProps> = ({
    anim,
    activeColor,
    show0,
    show1,
    isRolling,
    diceUsed,
    boardX,
    boardY,
    boardSize,
}) => {
    const { width: screenW } = useWindowDimensions();

    // Responsive sizing (match DiceHouseMaster exactly)
    const houseW = boardSize * 0.23;
    const houseH = boardSize * 0.13;
    const yardWidth = (boardSize / 15 * 0.7 * 4) + (boardSize * 0.016) + (boardSize * 0.034);
    const gap = screenW * 0.05;

    let houseLeft = 0;
    let houseTop = 0;

    if (activeColor === 'blue') {
        houseLeft = boardX + yardWidth + gap;
        houseTop = boardY + boardSize + (boardSize * 0.048);
    } else {
        houseLeft = (boardX + boardSize - yardWidth) - gap - houseW;
        houseTop = boardY + (-0.095 * boardSize) - (houseH / 2);
    }

    // Responsive die sizing
    const dieSize = houseW * 0.43;
    const diePaddingX = houseW * 0.043;
    const diePaddingY = houseH * 0.12;
    const dieGap = houseW * 0.06;
    const pipRadius = dieSize * 0.09;

    const d0Left = houseLeft + diePaddingX;
    const d1Left = houseLeft + diePaddingX + dieSize + dieGap;
    const dTop   = houseTop + diePaddingY;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* House background */}
            <View style={[styles.house, { left: houseLeft, top: houseTop, width: houseW, height: houseH }]} />

            {/* Die 0 */}
            {show0 && (
                <View style={[styles.dieContainer, { left: d0Left, top: dTop, width: dieSize, height: dieSize }]}>
                    <AnimatedDie
                        faceValue={anim.face0}
                        bounce={anim.bounce}
                        rotation={anim.rotation}
                        scale={anim.scale}
                        isUsed={!isRolling && (diceUsed[0] ?? false)}
                        dieSize={dieSize}
                        pipRadius={pipRadius}
                    />
                </View>
            )}

            {/* Die 1 */}
            {show1 && (
                <View style={[styles.dieContainer, { left: d1Left, top: dTop, width: dieSize, height: dieSize }]}>
                    <AnimatedDie
                        faceValue={anim.face1}
                        bounce={anim.bounce}
                        rotation={anim.rotation}
                        scale={anim.scale}
                        isUsed={!isRolling && (diceUsed[1] ?? false)}
                        dieSize={dieSize}
                        pipRadius={pipRadius}
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
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    dieContainer: {
        position: 'absolute',
    },
    die: {
        overflow: 'hidden',
    },
    dieShadow: {
        position: 'absolute',
        left: 1,
        top: 4,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
});
