import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useWindowDimensions, View, Image, StyleSheet } from 'react-native';
import { Canvas, Circle, Group, Paint, RoundedRect } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
    useSharedValue,
    useDerivedValue,
    withTiming,
    withSequence,
    withDelay,
    Easing,
    runOnJS,
    cancelAnimation
} from 'react-native-reanimated';
import { LudoBoardData } from './LudoCoordinates';
import { Path, Skia } from '@shopify/react-native-skia';
import { playLudoSound } from '../useLudoSoundEffects';

const boardImageSource = require('../../../../assets/images/ludoBoard.png');
const blueImageSource = require('../../../../assets/images/blue.png');
const greenImageSource = require('../../../../assets/images/green.png');
const redImageSource = require('../../../../assets/images/red.png');
const yellowImageSource = require('../../../../assets/images/yellow.png');

// Normalized positions for color images (center of each yard)
// Adjusted to be outside the board but flush against the edges
const COLOR_IMAGE_POSITIONS = {
    red: { x: 0.1090, y: 0.009 },    // Left side
    green: { x: 0.740, y: -0.05 },  // Moved up from 0
    yellow: { x: 0.670, y: 0.850 }, // Right side
    blue: { x: 0.0190, y: 0.8850 },   // Moved up slightly to avoid canvas clipping
};

// Distinct positions for 4 seeds in each home base
// Arranged in a small 2x2 grid around the image center
const HOME_OFFSET = 0.025; // Spacing offset
const HOME_SEED_POSITIONS = {
    red: [
        { x: 0.1090 - HOME_OFFSET, y: 0.009 - HOME_OFFSET },
        { x: 0.1090 + HOME_OFFSET, y: 0.009 - HOME_OFFSET },
        { x: 0.1090 - HOME_OFFSET, y: 0.009 + HOME_OFFSET },
        { x: 0.1090 + HOME_OFFSET, y: 0.009 + HOME_OFFSET },
    ],
    green: [
        // Aligned X around 0.740 and moved Y up to ~0.025
        { x: 0.740 - HOME_OFFSET, y: 0.025 - HOME_OFFSET },
        { x: 0.740 + HOME_OFFSET, y: 0.025 - HOME_OFFSET },
        { x: 0.740 - HOME_OFFSET, y: 0.025 + HOME_OFFSET },
        { x: 0.740 + HOME_OFFSET, y: 0.025 + HOME_OFFSET },
    ],
    yellow: [
        { x: 0.670 - HOME_OFFSET, y: 0.850 - HOME_OFFSET },
        { x: 0.670 + HOME_OFFSET, y: 0.850 - HOME_OFFSET },
        { x: 0.670 - HOME_OFFSET, y: 0.850 + HOME_OFFSET },
        { x: 0.670 + HOME_OFFSET, y: 0.850 + HOME_OFFSET },
    ],
    blue: [
        // Adjusted Y to match new Blue image position (0.88)
        { x: 0.2490 - HOME_OFFSET, y: 0.9090 - HOME_OFFSET },
        { x: 0.1500 + HOME_OFFSET, y: 0.9090 - HOME_OFFSET },
        { x: 0.1500 - HOME_OFFSET, y: 0.8580 + HOME_OFFSET },
        { x: 0.0480 + HOME_OFFSET, y: 0.8580 + HOME_OFFSET },
    ],
};

// Configuration for sizes (relative to canvas width)
const BOARD_SCALE = 0.96;      // REDUCED from 0.76 to make room for big images
const SIDE_IMAGE_SCALE = 0.137; // Size of the side images relative to canvas (approx 11%)

const BOARD_IMAGE_WIDTH = 1024;
const BOARD_IMAGE_HEIGHT = 1024;
const TILE_ANIMATION_DURATION = 300; // Adjusted for a slower, more deliberate pacing per tile

const SHIELD_PATH = "M 12 2 L 4 5 L 4 11 C 4 16.1 7.4 20.8 12 22 C 16.6 20.8 20 16.1 20 11 L 20 5 L 12 2 Z";

// --- Shield Tuning Configuration ---
const SHIELD_BASE_SCALE = (1024 / 15) / 2; // Base scale relative to tile size
const SHIELD_USER_SCALE = 0.8;              // [USER EDITABLE] Adjust this to change shield size
const SHIELD_OFFSET_X = 0;                  // [USER EDITABLE] Fine-tune horizontal position
const SHIELD_OFFSET_Y = 0;                  // [USER EDITABLE] Fine-tune vertical position

// Cache paths
const RED_PATH = LudoBoardData.getPathForColor('red');
const YELLOW_PATH = LudoBoardData.getPathForColor('yellow');
const BLUE_PATH = LudoBoardData.getPathForColor('blue');
const GREEN_PATH = LudoBoardData.getPathForColor('green');

const applyRadialOffset = (base: { x: number, y: number }, index: number, total: number, boardSize: number) => {
    if (total <= 1) return base;
    const offsetRadius = boardSize * 0.018; // ~1.8% of board size
    const angle = (2 * Math.PI / total) * index - Math.PI / 2;
    return {
        x: base.x + Math.cos(angle) * offsetRadius,
        y: base.y + Math.sin(angle) * offsetRadius
    };
};

// Memoized Seed to prevent React re-renders when other seeds move
const AnimatedSeed = React.memo(({ id, playerId, seedSubIndex, currentPos, landingPos, animationDelay, isActive, isPending, isSelected, boardX, boardY, boardSize, color, radius, colorName, canvasWidth, canvasHeight, stackIndex, stackSize }: { id: string, playerId: string, seedSubIndex: number, currentPos: number, landingPos: number, animationDelay: number, isActive: boolean, isPending: boolean, isSelected?: boolean, boardX: number, boardY: number, boardSize: number, color: string, radius: number, colorName: 'red' | 'yellow' | 'blue' | 'green', canvasWidth: number, canvasHeight: number, stackIndex: number, stackSize: number }) => {
    const getTargetPixels = (stepIndex: number, isFinal: boolean = false) => {
        let norm = { x: 0.5, y: 0.5 };

        // Select path based on colorName
        let path = RED_PATH;
        if (colorName === 'yellow') path = YELLOW_PATH;
        else if (colorName === 'blue') path = BLUE_PATH;
        else if (colorName === 'green') path = GREEN_PATH;

        if (stepIndex === -1) {
            const yardArr = LudoBoardData.yards[colorName];
            norm = yardArr[seedSubIndex % 4];
        } else if (stepIndex >= 56) {
            // Use HOME_SEED_POSITIONS for home with sub-index
            const posArray = HOME_SEED_POSITIONS[colorName];
            const pos = posArray[seedSubIndex % 4];
            return {
                x: pos.x * canvasWidth,
                y: pos.y * canvasHeight
            };
        } else {
            if (path[stepIndex]) norm = path[stepIndex];
        }

        const base = {
            x: boardX + norm.x * boardSize,
            y: boardY + norm.y * boardSize
        };

        // Apply radial offset ONLY if it's the final target position on the main track (0-55)
        if (isFinal && stepIndex >= 0 && stepIndex < 56) {
            return applyRadialOffset(base, stackIndex, stackSize, boardSize);
        }

        return base;
    };

    const target = getTargetPixels(currentPos, true);
    const cx = useSharedValue(target.x);
    const cy = useSharedValue(target.y);
    const scale = useSharedValue(1);
    const pulse = useSharedValue(0);
    const shadowOpacity = useSharedValue(0);
    const prevPosRef = useRef(currentPos);

    // ===========================================
    // UNIFIED PATH INTERPOLATOR STATE
    // ===========================================
    const flatPathCoords = useMemo(() => {
        // Pre-calculate unstacked raw path coordinates from -1 to 58
        const coords = new Float32Array(120);
        for(let i = -1; i <= 58; i++) {
            const pt = getTargetPixels(i, false); 
            coords[(i + 1) * 2] = pt.x;
            coords[(i + 1) * 2 + 1] = pt.y;
        }
        return coords;
    }, [colorName, boardX, boardY, boardSize, canvasWidth, canvasHeight]); // DO NOT include stackIndex/stackSize!

    const dynamicPath = useSharedValue(flatPathCoords);
    useEffect(() => { dynamicPath.value = flatPathCoords; }, [flatPathCoords]);

    const moveStartPos = useSharedValue<number>(-1);
    const moveEndPos = useSharedValue<number>(-1);
    const moveDirectly = useSharedValue<boolean>(false);
    const moveOriginX = useSharedValue<number>(target.x);
    const moveOriginY = useSharedValue<number>(target.y);
    const pathProgress = useSharedValue<number>(1); // 1 = arrived

    const renderedX = useDerivedValue(() => {
        'worklet';
        const prog = pathProgress.value;
        if (prog >= 1) return cx.value;

        const start = moveStartPos.value;
        const end = moveEndPos.value;
        const isDirect = moveDirectly.value;
        const originX = moveOriginX.value;

        if (isDirect || end <= start) {
            const endX = dynamicPath.value[(end + 1) * 2];
            return originX + (endX - originX) * prog;
        }

        const stepsCount = end - start;
        const exactStep = prog * stepsCount;
        const currentOffset = Math.floor(exactStep);
        const fraction = exactStep - currentOffset;

        let x1 = (currentOffset === 0) ? originX : dynamicPath.value[(start + currentOffset + 1) * 2];
        let x2 = dynamicPath.value[(Math.min(end, start + currentOffset + 1) + 1) * 2];

        return x1 + (x2 - x1) * fraction;
    });

    const renderedY = useDerivedValue(() => {
        'worklet';
        const prog = pathProgress.value;
        if (prog >= 1) return cy.value;

        const start = moveStartPos.value;
        const end = moveEndPos.value;
        const isDirect = moveDirectly.value;
        const originY = moveOriginY.value;

        if (isDirect || end <= start) {
            const endY = dynamicPath.value[(end + 1) * 2 + 1];
            return originY + (endY - originY) * prog;
        }

        const stepsCount = end - start;
        const exactStep = prog * stepsCount;
        const currentOffset = Math.floor(exactStep);
        const fraction = exactStep - currentOffset;

        let y1 = (currentOffset === 0) ? originY : dynamicPath.value[(start + currentOffset + 1) * 2 + 1];
        let y2 = dynamicPath.value[(Math.min(end, start + currentOffset + 1) + 1) * 2 + 1];

        return y1 + (y2 - y1) * fraction;
    });

    const renderedRadius = useDerivedValue(() => {
        'worklet';
        const prog = pathProgress.value;
        if (prog >= 1) return scale.value * radius;

        const start = moveStartPos.value;
        const end = moveEndPos.value;
        const isDirect = moveDirectly.value;

        const stepsCount = (isDirect || end <= start) ? 1 : (end - start);
        const exactStep = prog * stepsCount;
        const localProg = exactStep % 1; 
        
        const hopScale = 1 + Math.sin(localProg * Math.PI) * 0.25; 
        return (scale.value === 1 ? hopScale : scale.value) * radius;
    });

    // ===========================================
    // CRITICAL: Unmount Cleanup Loop
    // ===========================================
    // Runs on the JS thread — do NOT add 'worklet' here.
    // cancelAnimation() and .value assignments are safe from JS thread.
    useEffect(() => {
        return () => {
            cancelAnimation(pulse);
            cancelAnimation(cx);
            cancelAnimation(cy);
            cancelAnimation(scale);
            cancelAnimation(pathProgress);
            cancelAnimation(shadowOpacity);

            // Force everything to safe values so GC can collect
            pulse.value = 0;
            scale.value = 1;
            pathProgress.value = 1;
            shadowOpacity.value = 0;
        };
    }, [id]);

    // Lift & Pulse "Pending Server Confirm" Animation
    // GPU FIX: No withRepeat — use one-shot lift instead of continuous breathing
    useEffect(() => {
        if (isPending) {
            shadowOpacity.value = withTiming(0.4, { duration: 150 });
            // Static lift (no breathing loop = no continuous Canvas redraws)
            scale.value = withTiming(1.15, { duration: 200, easing: Easing.out(Easing.quad) });
        } else {
            shadowOpacity.value = withTiming(0, { duration: 150 });
            if (currentPos === prevPosRef.current && currentPos === landingPos) {
                cancelAnimation(scale);
                scale.value = withTiming(1, { duration: 200 });
            } else {
                cancelAnimation(scale);
                scale.value = 1;
            }
        }
    }, [isPending, currentPos, landingPos]);

    // GPU FIX: Do NOT use withRepeat here!
    // withRepeat forces the Skia Canvas to redraw at 60fps CONTINUOUSLY
    // for every active seed. On Samsung Exynos (Mali GPU), this overwhelms
    // the full-screen EGL surface → updateAndRelease() crash → TV static.
    // Instead, use a one-shot animation to a fixed value (static glow ring).
    useEffect(() => {
        if (isActive) {
            pulse.value = withTiming(0.7, { duration: 300, easing: Easing.out(Easing.quad) });
        } else {
            pulse.value = withTiming(0, { duration: 150 });
        }
    }, [isActive]);

    useEffect(() => {
        const oldPos = prevPosRef.current;
        const newPos = currentPos;
        prevPosRef.current = newPos;

        // Clean up any pending animations from previous rapid moves
        cancelAnimation(cx);
        cancelAnimation(cy);
        cancelAnimation(scale);
        cancelAnimation(pathProgress);

        if (oldPos === newPos) {
            cx.value = target.x;
            cy.value = target.y;
            pathProgress.value = 1; // Snaps to end
            return;
        }

        if (oldPos === -1) {
            cx.value = withTiming(target.x, { duration: 250 });
            cy.value = withTiming(target.y, { duration: 250 });
            // Small hop when leaving house
            scale.value = withSequence(
                withTiming(1.3, { duration: 120 }),
                withTiming(1, { duration: 120 })
            );
            pathProgress.value = 1;
            return;
        }

        if (newPos === -1) {
            // Captured seed returning home
            const delay = animationDelay || 0;
            cx.value = withSequence(withDelay(delay, withTiming(target.x, { duration: 250 })));
            cy.value = withSequence(withDelay(delay, withTiming(target.y, { duration: 250 })));
            scale.value = withSequence(
                withDelay(delay, withTiming(1.2, { duration: 120 })),
                withTiming(1, { duration: 120 })
            );
            pathProgress.value = 1;
            return;
        }

        // ====================================================================
        // UNIFIED PATH INTERPOLATOR
        // Drops JS Bridge Array allocation so Skia survives deep matches.
        // ====================================================================
        moveOriginX.value = cx.value;
        moveOriginY.value = cy.value;

        const diff = landingPos - oldPos;
        const isDirect = !(diff > 0 && diff <= 12);
        moveDirectly.value = isDirect;
        moveStartPos.value = oldPos;
        moveEndPos.value = landingPos;

        playLudoSound('seedMove');

        const targetLanding = getTargetPixels(landingPos, landingPos === newPos);
        cx.value = targetLanding.x;
        cy.value = targetLanding.y;
        scale.value = 1;

        const stepsCount = isDirect ? 1 : diff;
        const moveDuration = stepsCount * TILE_ANIMATION_DURATION;

        if (landingPos !== newPos) {
            // CAPTURE JUMP: Walk 0->1, then jump to the captured target
            pathProgress.value = 0;
            pathProgress.value = withTiming(1, { duration: moveDuration, easing: Easing.linear }, (finished) => {
                if (finished) {
                    const captureTarget = getTargetPixels(newPos, true);
                    cx.value = withTiming(captureTarget.x, { duration: 400, easing: Easing.out(Easing.quad) });
                    cy.value = withTiming(captureTarget.y, { duration: 400, easing: Easing.out(Easing.quad) });
                    scale.value = withSequence(
                        withTiming(1.5, { duration: 200, easing: Easing.out(Easing.quad) }),
                        withTiming(1.0, { duration: 200, easing: Easing.in(Easing.quad) })
                    );
                }
            });
        } else {
            // Normal move
            pathProgress.value = 0;
            pathProgress.value = withTiming(1, { duration: moveDuration, easing: Easing.out(Easing.quad) });
        }

        // Kill lingering repeating animations instantly
        cancelAnimation(pulse);
        cancelAnimation(scale);
        pulse.value = 0;
        scale.value = 1;
        shadowOpacity.value = withTiming(0, { duration: 100 });

    }, [currentPos, landingPos, animationDelay, boardX, boardY, boardSize, stackIndex, stackSize]);

    // Active indicator — STATIC values (no continuous animation = no forced Canvas redraws)
    const indicatorOpacity = useDerivedValue(() => { 'worklet'; return pulse.value; }, [pulse]);
    const pulseRadius = useDerivedValue(() => { 'worklet'; return radius * 1.5; }, [radius]);
    const pulseOpacity = useDerivedValue(() => { 'worklet'; return pulse.value * 0.4; }, [pulse]);

    // Derived values for the Fake Geometry Shadow
    // Replaces expensive Gaussian Blur `<Shadow>` which crashes Samsung mobile GPUs over time
    const fakeShadowY = useDerivedValue(() => { 'worklet'; return renderedY.value + 4 + (shadowOpacity.value * 12); }, [renderedY, shadowOpacity]);
    const fakeShadowOpacity = useDerivedValue(() => { 'worklet'; return 0.35 + (shadowOpacity.value * 0.15); }, [shadowOpacity]);

    return (
        <Group>
            {/* Active Move Indicator (Pulsing ring) */}
            {isActive && !isSelected && (
                <Group opacity={indicatorOpacity}>
                    <Circle cx={renderedX} cy={renderedY} r={radius * 1.5} color={color}>
                        <Paint style="stroke" strokeWidth={2} color={color} />
                    </Circle>
                    <Circle cx={renderedX} cy={renderedY} r={pulseRadius} color={color} opacity={pulseOpacity}>
                        <Paint style="stroke" strokeWidth={1} color={color} />
                    </Circle>
                </Group>
            )}

            {/* Fake Vector Shadow (Zero GPU Gaussian Blur Cost) */}
            <Circle 
                cx={renderedX} 
                cy={fakeShadowY} 
                r={useDerivedValue(() => renderedRadius.value * (1 + shadowOpacity.value * 0.1), [renderedRadius, shadowOpacity])} 
                color="black" 
                opacity={fakeShadowOpacity} 
            />

            {/* Seed Body */}
            <Circle cx={renderedX} cy={renderedY} r={renderedRadius} color={color}>
                <Paint style="stroke" strokeWidth={2} color="rgba(255, 255, 255, 0.9)" />
            </Circle>
        </Group>
    );
}, (prevProps, nextProps) => {
    // Only re-render if the seed's actual structural state changed.
    // Reanimated hooks handle the visual movement on the UI thread without needing React to re-render.
    return (
        prevProps.currentPos === nextProps.currentPos &&
        prevProps.landingPos === nextProps.landingPos &&
        prevProps.isActive === nextProps.isActive &&
        prevProps.isPending === nextProps.isPending &&
        prevProps.animationDelay === nextProps.animationDelay &&
        prevProps.stackIndex === nextProps.stackIndex &&
        prevProps.stackSize === nextProps.stackSize &&
        prevProps.boardSize === nextProps.boardSize &&
        prevProps.isSelected === nextProps.isSelected
    );
});

// Render Throttle Hook (GPU Safety Guard)
// Limits how often a rapidly changing value can trigger a re-render
export function useThrottledValue<T>(value: T, limitMs: number): T {
    const [throttledValue, setThrottledValue] = useState(value);
    const lastRan = useRef(Date.now());
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const now = Date.now();
        if (now - lastRan.current >= limitMs) {
            setThrottledValue(value);
            lastRan.current = now;
        } else {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                setThrottledValue(value);
                lastRan.current = Date.now();
            }, limitMs - (now - lastRan.current));
        }
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [value, limitMs]);

    return throttledValue;
}

// Helper to get pixel position for a seed
const getSeedPixelPosition = (seedPos: number, playerId: string, seedSubIndex: number, boardX: number, boardY: number, boardSize: number, colorName: 'red' | 'yellow' | 'blue' | 'green', canvasWidth: number, canvasHeight: number, stackIndex: number, stackSize: number) => {
    let path = RED_PATH;
    if (colorName === 'yellow') path = YELLOW_PATH;
    else if (colorName === 'blue') path = BLUE_PATH;
    else if (colorName === 'green') path = GREEN_PATH;

    let norm = { x: 0.5, y: 0.5 };

    if (seedPos === -1) {
        const yardArr = LudoBoardData.yards[colorName];
        norm = yardArr[seedSubIndex % 4];
    } else if (seedPos >= 56) {
        // Use HOME_SEED_POSITIONS for home with sub-index
        const posArray = HOME_SEED_POSITIONS[colorName];
        const pos = posArray[seedSubIndex % 4];
        return {
            x: pos.x * canvasWidth,
            y: pos.y * canvasHeight
        };
    } else {
        if (path[seedPos]) norm = path[seedPos];
    }

    const base = {
        x: boardX + norm.x * boardSize,
        y: boardY + norm.y * boardSize
    };

    if (seedPos >= 0 && seedPos < 56) {
        return applyRadialOffset(base, stackIndex, stackSize, boardSize);
    }
    return base;
};

type LudoSkiaBoardProps = {
    onBoardPress: (x: number, y: number, seed?: { playerId: string; seedIndex: number; position: number } | null) => void;
    positions: { [key: string]: { pos: number, land: number, delay: number, isActive: boolean }[] };
    level?: number;
    width?: number;
    height?: number;
    selectedSeedIndex?: number | null;
    pendingSeedIndices?: number[];
    localPlayerId?: string;
};

const LudoSkiaBoardComponent = ({ onBoardPress, positions, level, width: propWidth, height: propHeight, selectedSeedIndex, pendingSeedIndices: propPendingSeedIndices, localPlayerId }: LudoSkiaBoardProps) => {
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const canvasWidth = propWidth ?? (windowWidth * 0.95);
    // Canvas no longer needs to cover full screen — dice are rendered as RN Animated views.
    // Reduced height saves ~30% GPU texture memory on Samsung Exynos (Mali).
    const canvasHeight = propHeight ?? windowHeight;

    // Render Throttle (GPU Safety Guard): Limit Skia re-renders to max 15 FPS (66ms)
    // Ensures massive state update loops (e.g. from dice) cannot overwhelm WebGL texture memory
    const throttledPositions = useThrottledValue(positions, 66);

    // CRITICAL MEMORY FIX: Pre-compile SVG string to avoid C++ leaky allocations on every render
    const shieldSkPath = useMemo(() => {
        const path = Skia.Path.MakeFromSVGString(SHIELD_PATH);
        if (!path) console.warn("Failed to parse SHIELD_PATH");
        return path;
    }, []);

    // Scale board to make room for outer images
    // Using BOARD_SCALE constant
    const boardSize = canvasWidth * BOARD_SCALE;
    const marginX = (canvasWidth - boardSize) / 2;
    const marginY = (canvasHeight - boardSize) / 2;
    // Add additional vertical margin as requested (10px above and below)
    const boardX = marginX;
    const boardY = marginY;

    const seedRadius = (boardSize / 15) * 0.35;

    // Size for colored images attached to the ends
    // Using SIDE_IMAGE_SCALE constant
    const sideImageSize = canvasWidth * SIDE_IMAGE_SCALE;

    const seedsData = useMemo(() => {
        const list: any[] = [];
        const positionGroups: { [key: string]: number[] } = {};

        Object.entries(throttledPositions).forEach(([playerId, seedPositions]) => {
            const isP1 = playerId === 'p1';
            const colorName = isP1 ? 'blue' : 'green';
            const color = isP1 ? '#007AFF' : '#34C759';
            const path = LudoBoardData.getPathForColor(colorName);

            (seedPositions as { pos: number, land: number, delay: number, isActive: boolean }[]).forEach((item, index) => {
                let key = "";
                if (item.pos === -1) {
                    key = `yard-${colorName}-${index}`; // Unique key for yard slots
                } else if (item.pos >= 56) {
                    key = `home-${colorName}-${index}`; // Unique key for home slots
                } else {
                    const coord = path[item.pos];
                    if (coord) {
                        // Snap coordinates to group seeds on the same tile (Main Track)
                        const snapX = Math.round(coord.x * 1000);
                        const snapY = Math.round(coord.y * 1000);
                        key = `${snapX},${snapY}`;
                    } else {
                        key = `unknown-${playerId}-${index}`;
                    }
                }

                if (!positionGroups[key]) positionGroups[key] = [];
                positionGroups[key].push(list.length);

                list.push({
                    id: `${playerId}-${index}`,
                    playerId,
                    seedSubIndex: index,
                    currentPos: item.pos,
                    landingPos: item.land,
                    animationDelay: item.delay,
                    isActive: item.isActive,
                    isPending: playerId === (localPlayerId || 'p1') && !!propPendingSeedIndices?.includes(index),
                    color,
                    colorName,
                    stackIndex: 0,
                    stackSize: 1
                });
            });
        });

        // Assign stack indices and sizes for radial offset calculation
        Object.values(positionGroups).forEach(indices => {
            indices.forEach((listIdx, stackIdx) => {
                list[listIdx].stackIndex = stackIdx;
                list[listIdx].stackSize = indices.length;
            });
        });

        return list;
    }, [throttledPositions]);

    // Hit-test function to find which seed was tapped
    const findTappedSeed = (tapX: number, tapY: number) => {
        // Increase hit radius for better mobile responsiveness
        const hitRadius = Math.max(seedRadius * 2.8, 22);

        for (const seed of seedsData) {
            const { x: seedX, y: seedY } = getSeedPixelPosition(
                seed.currentPos,
                seed.playerId,
                seed.seedSubIndex,
                boardX, boardY, boardSize,
                seed.colorName,
                canvasWidth, canvasHeight,
                seed.stackIndex,
                seed.stackSize
            );

            const distance = Math.sqrt(Math.pow(tapX - seedX, 2) + Math.pow(tapY - seedY, 2));
            if (distance <= hitRadius) {
                return {
                    playerId: seed.playerId,
                    seedIndex: seed.seedSubIndex,
                    position: seed.currentPos
                };
            }
        }
        return null;
    };

    const handleTap = (x: number, y: number) => {
        const tappedSeed = findTappedSeed(x, y);
        onBoardPress(x, y, tappedSeed);
    };

    if (!boardImageSource) return null;

    return (
        <GestureDetector
            gesture={Gesture.Tap()
                .maxDuration(250)
                .maxDistance(15)
                .onEnd(({ x, y }) => runOnJS(handleTap)(x, y))
            }
        >
            <View style={{ width: canvasWidth, height: canvasHeight }}>
                {/* Hardware Accelerated React Native Images placed OUTSIDE Skia 
                    (Prevents the OS from forcing Skia to redraw massive 1024x1024 static buffers, 
                    curing the TV Static Exynos leak at 370+ moves) */}
                <Image
                    source={boardImageSource}
                    style={{
                        position: 'absolute',
                        left: boardX,
                        top: boardY,
                        width: boardSize,
                        height: boardSize,
                    }}
                    resizeMode="stretch"
                />
                <Image
                    source={greenImageSource}
                    style={{
                        position: 'absolute',
                        left: COLOR_IMAGE_POSITIONS.green.x * canvasWidth - sideImageSize / 2,
                        top: COLOR_IMAGE_POSITIONS.green.y * canvasHeight - sideImageSize / 2,
                        width: sideImageSize * 3,
                        height: sideImageSize * 2.5,
                    }}
                    resizeMode="contain"
                />
                <Image
                    source={blueImageSource}
                    style={{
                        position: 'absolute',
                        left: COLOR_IMAGE_POSITIONS.blue.x * canvasWidth - sideImageSize / 2,
                        top: COLOR_IMAGE_POSITIONS.blue.y * canvasHeight - sideImageSize / 2,
                        width: sideImageSize * 3,
                        height: sideImageSize * 2.5,
                    }}
                    resizeMode="contain"
                />

                {/* The Skia Canvas rendering ONLY vectors, seeds, and dice (Zero Bitmap Texture Exhaustion!) */}
                <Canvas style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight }}>

                    {/* Shield Icons for lower levels */}
                    {(level === undefined || level < 3) && LudoBoardData.shieldPositions.map((pos, idx) => (
                        <Group
                            key={`shield-${idx}`}
                            transform={[
                                { translateX: boardX + pos.x * boardSize + SHIELD_OFFSET_X },
                                { translateY: boardY + pos.y * boardSize + SHIELD_OFFSET_Y }
                            ]}
                        >
                            {/* Nested group for scaling around the center (-12, -12 for a 24x24 path) */}
                            <Group transform={[{ scale: (boardSize / 15 / 24) * SHIELD_USER_SCALE }]}>
                                {shieldSkPath && (
                                    <Path
                                        path={shieldSkPath}
                                        color="rgba(255, 255, 255, 0.6)"
                                        transform={[{ translateX: -12 }, { translateY: -12 }]}
                                    >
                                        <Paint style="stroke" strokeWidth={2} color="rgba(0,0,0,0.3)" />
                                    </Path>
                                )}
                            </Group>
                        </Group>
                    ))}

                    {seedsData.map(s => (
                        <AnimatedSeed
                            key={s.id}
                            {...s}
                            isSelected={s.playerId === (localPlayerId || 'p1') && s.seedSubIndex === selectedSeedIndex}
                            boardX={boardX}
                            boardY={boardY}
                            boardSize={boardSize}
                            radius={seedRadius}
                            colorName={s.colorName}
                            canvasWidth={canvasWidth}
                            canvasHeight={canvasHeight}
                            stackIndex={s.stackIndex}
                            stackSize={s.stackSize}
                        />
                    ))}

                </Canvas>
            </View>
        </GestureDetector>
    );
};

// Memoize the entire board to prevent re-rendering when LudoCoreUI updates (e.g., timer ticking)
export const LudoSkiaBoard = React.memo(LudoSkiaBoardComponent, (prevProps, nextProps) => {
    // Basic prop checks
    if (prevProps.level !== nextProps.level || 
        prevProps.width !== nextProps.width || 
        prevProps.height !== nextProps.height ||
        prevProps.selectedSeedIndex !== nextProps.selectedSeedIndex) {
        return false;
    }

    // Deep compare positions lengths (fast path)
    const prevKeys = Object.keys(prevProps.positions);
    const nextKeys = Object.keys(nextProps.positions);
    if (prevKeys.length !== nextKeys.length) return false;

    // Deep compare actual seed positions/states
    for (const key of prevKeys) {
        const prevSeeds = prevProps.positions[key];
        const nextSeeds = nextProps.positions[key];
        if (!nextSeeds || prevSeeds.length !== nextSeeds.length) return false;

        for (let i = 0; i < prevSeeds.length; i++) {
            const p = prevSeeds[i];
            const n = nextSeeds[i];
            if (p.pos !== n.pos || p.land !== n.land || p.delay !== n.delay || p.isActive !== n.isActive) {
                return false;
            }
        }
    }

    // Critical check: Did pending seeds change? (ensures instant hover/lift effects)
    if (prevProps.pendingSeedIndices !== nextProps.pendingSeedIndices) {
        const prevPending = prevProps.pendingSeedIndices || [];
        const nextPending = nextProps.pendingSeedIndices || [];
        if (prevPending.length !== nextPending.length) return false;
        if (!prevPending.every((val, index) => val === nextPending[index])) return false;
    }


    if (prevProps.localPlayerId !== nextProps.localPlayerId) return false;

    return true; // All structural data identical, skip re-render!
});