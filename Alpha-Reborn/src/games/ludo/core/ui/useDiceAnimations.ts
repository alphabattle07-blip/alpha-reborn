// useDiceAnimations.ts
// Centralised dice animation hook. Shared values live here so they can be
// passed to ANY Canvas (the board's Canvas) without creating a second surface.
import { useEffect, useRef } from 'react';
import {
    useSharedValue,
    withTiming,
    withRepeat,
    withSequence,
    cancelAnimation,
    Easing,
    SharedValue,
} from 'react-native-reanimated';

const DIE_SIZE = 35;

export interface DiceAnimState {
    face0: SharedValue<number>;
    face1: SharedValue<number>;
    bounce: SharedValue<number>;
    rotation: SharedValue<number>;
    scale: SharedValue<number>;
}

export function useDiceAnimations(
    dice: number[],
    diceCount: number,
    isRolling: boolean,
): DiceAnimState {
    const bounce   = useSharedValue(0);
    const rotation = useSharedValue(0);
    const scale    = useSharedValue(1);
    const face0    = useSharedValue<number>(dice[0] ?? 1);
    const face1    = useSharedValue<number>(dice[1] ?? 1);
    const faceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync face values when server dice arrive
    useEffect(() => {
        if (!isRolling) {
            if (dice[0] > 0) face0.value = dice[0];
            if (dice[1] > 0) face1.value = dice[1];
        }
    }, [dice, isRolling]);

    // Rolling animation
    // FIX: The face-switching setTimeout was firing every 120ms from the JS thread,
    // causing cross-thread shared value writes that forced full Skia Canvas redraws.
    // Combined with 3 concurrent withRepeat animations on a full-screen Canvas,
    // this overwhelmed the Samsung Exynos GPU → updateAndRelease() crash.
    const mountedRef = useRef(true);
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

    useEffect(() => {
        if (isRolling) {
            // Stagger animation starts slightly to avoid simultaneous GPU surface lock contention
            bounce.value = withRepeat(
                withSequence(
                    withTiming(-DIE_SIZE * 0.45, { duration: 380, easing: Easing.out(Easing.quad) }),
                    withTiming(0,               { duration: 380, easing: Easing.in(Easing.quad)  }),
                    withTiming(-DIE_SIZE * 0.2,  { duration: 230, easing: Easing.out(Easing.quad) }),
                    withTiming(0,               { duration: 230, easing: Easing.bounce           }),
                ),
                -1
            );
            rotation.value = withRepeat(
                withTiming(Math.PI * 2, { duration: 750, easing: Easing.linear }),
                -1
            );
            scale.value = withRepeat(
                withSequence(
                    withTiming(1.1, { duration: 380 }),
                    withTiming(1,   { duration: 380 }),
                ),
                -1
            );

            // Face switching loop — SLOWED DOWN from 120ms to 300ms
            // Each write crosses JS→UI thread bridge and forces a Skia redraw.
            // At 120ms that's ~8 redraws/sec ON TOP of withRepeat animations.
            // At 300ms it's ~3/sec — still visually convincing but GPU-safe.
            if (faceTimeout.current) clearTimeout(faceTimeout.current);
            const switchFace = () => {
                if (!mountedRef.current) return; // Guard: don't write to shared values after unmount
                let next0: number, next1: number;
                do { next0 = Math.floor(Math.random() * 6) + 1; } while (next0 === face0.value);
                face0.value = next0;
                if (diceCount > 1) {
                    do { next1 = Math.floor(Math.random() * 6) + 1; } while (next1 === face1.value);
                    face1.value = next1;
                }
                faceTimeout.current = setTimeout(switchFace, 300 + Math.random() * 100);
            };
            // Delay the FIRST face switch by 100ms to let the withRepeat animations
            // claim the GPU surface first (avoids simultaneous lock contention).
            faceTimeout.current = setTimeout(switchFace, 100);

            return () => {
                if (faceTimeout.current) clearTimeout(faceTimeout.current);
                faceTimeout.current = null;
            };
        } else {
            cancelAnimation(bounce);
            cancelAnimation(rotation);
            cancelAnimation(scale);
            bounce.value   = withTiming(0, { duration: 80 });
            rotation.value = withTiming(0, { duration: 80 });
            scale.value    = withTiming(1, { duration: 80 });
            if (faceTimeout.current) {
                clearTimeout(faceTimeout.current);
                faceTimeout.current = null;
            }
        }
    }, [isRolling]);

    // Unmount cleanup
    useEffect(() => {
        return () => {
            cancelAnimation(bounce);
            cancelAnimation(rotation);
            cancelAnimation(scale);
            if (faceTimeout.current) clearTimeout(faceTimeout.current);
        };
    }, []);

    return { face0, face1, bounce, rotation, scale };
}
