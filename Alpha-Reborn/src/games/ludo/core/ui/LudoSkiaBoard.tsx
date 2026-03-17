import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { Canvas, Image as SkiaImage, useImage, Circle, Group, Paint, Shadow } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
    useSharedValue,
    useDerivedValue,
    withTiming,
    withRepeat,
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
const TILE_ANIMATION_DURATION = 200;

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
const AnimatedSeed = React.memo(({ id, playerId, seedSubIndex, currentPos, landingPos, animationDelay, isActive, boardX, boardY, boardSize, color, radius, colorName, canvasWidth, canvasHeight, stackIndex, stackSize }: { id: string, playerId: string, seedSubIndex: number, currentPos: number, landingPos: number, animationDelay: number, isActive: boolean, boardX: number, boardY: number, boardSize: number, color: string, radius: number, colorName: 'red' | 'yellow' | 'blue' | 'green', canvasWidth: number, canvasHeight: number, stackIndex: number, stackSize: number }) => {
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
    const prevPosRef = useRef(currentPos);

    // ===========================================
    // UNIFIED PATH INTERPOLATOR STATE
    // ===========================================
    const pathProgress = useSharedValue<number>(1); // 1 = arrived
    const pathX = useSharedValue<number[]>([target.x]);
    const pathY = useSharedValue<number[]>([target.y]);

    const renderedX = useDerivedValue(() => {
        const prog = pathProgress.value;
        const xs = pathX.value;
        const len = xs.length;
        if (len <= 1 || prog >= 1) return cx.value;

        const exactStep = prog * (len - 1);
        const stepIndex = Math.min(Math.floor(exactStep), len - 2);
        const localProg = exactStep - stepIndex;
        
        return xs[stepIndex] + (xs[stepIndex + 1] - xs[stepIndex]) * localProg;
    });

    const renderedY = useDerivedValue(() => {
        const prog = pathProgress.value;
        const ys = pathY.value;
        const len = ys.length;
        if (len <= 1 || prog >= 1) return cy.value; 

        const exactStep = prog * (len - 1);
        const stepIndex = Math.min(Math.floor(exactStep), len - 2);
        const localProg = exactStep - stepIndex;
        
        return ys[stepIndex] + (ys[stepIndex + 1] - ys[stepIndex]) * localProg;
    });

    const renderedRadius = useDerivedValue(() => {
        const prog = pathProgress.value;
        const len = pathX.value.length;
        if (len <= 1 || prog >= 1) return scale.value * radius;

        const exactStep = prog * (len - 1);
        const localProg = exactStep % 1; // 0 to 1 for the current tile
        // Math sine wave for pure bouncing: 0 -> 1 -> 0
        const hopScale = 1 + Math.sin(localProg * Math.PI) * 0.25; 
        
        return (scale.value === 1 ? hopScale : scale.value) * radius;
    });

    // ===========================================
    // CRITICAL: Unmount Cleanup Loop
    // ===========================================
    // Memory unmount loop safely terminates GPU animations when game exits
    useEffect(() => {
        return () => {
            cancelAnimation(pulse);
            cancelAnimation(cx);
            cancelAnimation(cy);
            cancelAnimation(scale);
            cancelAnimation(pathProgress);
        };
    }, []);

    useEffect(() => {
        if (isActive) {
            pulse.value = withRepeat(
                withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
                -1,
                true
            );
        } else {
            // Cancel pulse INSTANTLY when not active
            pulse.value = withTiming(0, { duration: 0 });
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
            cx.value = withTiming(target.x, { duration: 400 });
            cy.value = withTiming(target.y, { duration: 400 });
            // Small hop when leaving house
            scale.value = withSequence(
                withTiming(1.3, { duration: 200 }),
                withTiming(1, { duration: 200 })
            );
            pathProgress.value = 1;
            return;
        }

        if (newPos === -1) {
            // Captured seed returning home
            const delay = animationDelay || 0;
            cx.value = withSequence(withDelay(delay, withTiming(target.x, { duration: 400 })));
            cy.value = withSequence(withDelay(delay, withTiming(target.y, { duration: 400 })));
            scale.value = withSequence(
                withDelay(delay, withTiming(1.2, { duration: 200 })),
                withTiming(1, { duration: 200 })
            );
            pathProgress.value = 1;
            return;
        }

        // ====================================================================
        // UNIFIED PATH INTERPOLATOR
        // Reduces 24+ withSequence arrays to EXACTLY 1 withTiming object per move.
        // Drops C++ memory allocation so Skia can survive deep auto-play matches.
        // ====================================================================

        const steps = [];
        const diff = landingPos - oldPos;
        if (diff > 0 && diff <= 12) {
            for (let i = oldPos + 1; i <= landingPos; i++) steps.push(i);
        } else {
            steps.push(landingPos);
        }

        playLudoSound('seedMove');

        const xs = steps.map((i, idx) => getTargetPixels(i, idx === steps.length - 1 && landingPos === newPos).x);
        const ys = steps.map((i, idx) => getTargetPixels(i, idx === steps.length - 1 && landingPos === newPos).y);

        // Prepend current pos so array represents Start -> A -> B -> End
        const currentTargetPixels = getTargetPixels(oldPos, oldPos === newPos && oldPos >= 56);
        xs.unshift(currentTargetPixels.x);
        ys.unshift(currentTargetPixels.y);

        pathX.value = xs;
        pathY.value = ys;
        
        // Base targets become the landing destination of the linear walk
        cx.value = xs[xs.length - 1];
        cy.value = ys[ys.length - 1];
        scale.value = 1;

        const moveDuration = steps.length * TILE_ANIMATION_DURATION;

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
            pathProgress.value = withTiming(1, { duration: moveDuration, easing: Easing.linear });
        }

    }, [currentPos, landingPos, animationDelay, boardX, boardY, boardSize, stackIndex, stackSize]);

    // Active indicator animation values
    const indicatorOpacity = useDerivedValue(() => pulse.value);
    const pulseRadius = useDerivedValue(() => radius * (1.2 + pulse.value * 0.5));
    const pulseOpacity = useDerivedValue(() => (1 - pulse.value) * 0.5);

    return (
        <Group>
            {/* Active Move Indicator */}
            <Group opacity={indicatorOpacity}>
                <Circle cx={renderedX} cy={renderedY} r={radius * 1.5} color={color}>
                    <Paint style="stroke" strokeWidth={2} color={color} />
                </Circle>
                <Circle cx={renderedX} cy={renderedY} r={pulseRadius} color={color} opacity={pulseOpacity}>
                    <Paint style="stroke" strokeWidth={1} color={color} />
                </Circle>
            </Group>

            {/* Seed Body */}
            <Circle cx={renderedX} cy={renderedY} r={renderedRadius} color={color}>
                <Paint style="stroke" strokeWidth={1.5} color="white" />
                <Shadow dx={1} dy={2} blur={3} color="rgba(0,0,0,0.5)" />
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
        prevProps.animationDelay === nextProps.animationDelay &&
        prevProps.stackIndex === nextProps.stackIndex &&
        prevProps.stackSize === nextProps.stackSize &&
        prevProps.boardSize === nextProps.boardSize
    );
});

// Render Throttle Hook (GPU Safety Guard)
// Limits how often a rapidly changing value can trigger a re-render
function useThrottledValue<T>(value: T, limitMs: number): T {
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

const LudoSkiaBoardComponent = ({ onBoardPress, positions, level, width: propWidth, height: propHeight }: { onBoardPress: any, positions: { [key: string]: { pos: number, land: number, delay: number, isActive: boolean }[] }, level?: number, width?: number, height?: number }) => {
    const boardImage = useImage(boardImageSource);
    const blueImage = useImage(blueImageSource);
    const greenImage = useImage(greenImageSource);
    // Removed: redImage and yellowImage were loaded but never rendered (JSX commented out),
    // wasting GPU texture memory and contributing to board corruption on Android.

    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const canvasWidth = propWidth ?? (windowWidth * 0.95);
    const canvasHeight = propHeight ?? (canvasWidth * 1.2); // Increase height to give more room top/bottom

    // Render Throttle (GPU Safety Guard): Limit Skia re-renders to max 30 FPS (33ms)
    // Ensures massive state update loops (e.g. from dice) cannot overwhelm WebGL texture memory
    const throttledPositions = useThrottledValue(positions, 33);

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
        // seedRadius is typically (boardSize / 15) * 0.35
        // We want a hit target of at least 44-48 points total diameter
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

    if (!boardImage) return null;

    return (
        <GestureDetector
            gesture={Gesture.Tap()
                .maxDuration(250)
                .maxDistance(15)
                .onEnd(({ x, y }) => runOnJS(handleTap)(x, y))
            }
        >
            <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
                <SkiaImage
                    image={boardImage}
                    x={boardX}
                    y={boardY}
                    width={boardSize}
                    height={boardSize}
                    fit="fill"
                />

                {/* 
                  Color images positioned using COLOR_IMAGE_POSITIONS constant.
                  This allows manual tweaking of positions.
                */}

                {/* RED - HIDDEN */}
                {/* {redImage && (
                    <SkiaImage
                        image={redImage}
                        x={COLOR_IMAGE_POSITIONS.red.x * canvasWidth - sideImageSize / 2}
                        y={COLOR_IMAGE_POSITIONS.red.y * canvasHeight - sideImageSize / 2}
                        width={sideImageSize * 3}
                        height={sideImageSize * 2.5}
                        fit="contain"
                    />
                )} */}

                {/* GREEN */}
                {greenImage && (
                    <SkiaImage
                        image={greenImage}
                        x={COLOR_IMAGE_POSITIONS.green.x * canvasWidth - sideImageSize / 2}
                        y={COLOR_IMAGE_POSITIONS.green.y * canvasHeight - sideImageSize / 2}
                        width={sideImageSize * 3}
                        height={sideImageSize * 2.5}
                        fit="contain"
                    />
                )}

                {/* YELLOW - HIDDEN */}
                {/* {yellowImage && (
                    <SkiaImage
                        image={yellowImage}
                        x={COLOR_IMAGE_POSITIONS.yellow.x * canvasWidth - sideImageSize / 2}
                        y={COLOR_IMAGE_POSITIONS.yellow.y * canvasHeight - sideImageSize / 2}
                        width={sideImageSize * 3}
                        height={sideImageSize * 2.5}
                        fit="contain"
                    />
                )} */}

                {/* BLUE */}
                {blueImage && (
                    <SkiaImage
                        image={blueImage}
                        x={COLOR_IMAGE_POSITIONS.blue.x * canvasWidth - sideImageSize / 2}
                        y={COLOR_IMAGE_POSITIONS.blue.y * canvasHeight - sideImageSize / 2}
                        width={sideImageSize * 3}
                        height={sideImageSize * 2.5}
                        fit="contain"
                    />
                )}

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
                            <Path
                                path={SHIELD_PATH}
                                color="rgba(255, 255, 255, 0.6)"
                                transform={[{ translateX: -12 }, { translateY: -12 }]}
                            >
                                <Paint style="stroke" strokeWidth={2} color="rgba(0,0,0,0.3)" />
                            </Path>
                        </Group>
                    </Group>
                ))}

                {seedsData.map(s => (
                    <AnimatedSeed
                        key={s.id}
                        {...s}
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
        </GestureDetector>
    );
};

// Memoize the entire board to prevent re-rendering when LudoCoreUI updates (e.g., timer ticking)
export const LudoSkiaBoard = React.memo(LudoSkiaBoardComponent, (prevProps, nextProps) => {
    // Basic prop checks
    if (prevProps.level !== nextProps.level || prevProps.width !== nextProps.width || prevProps.height !== nextProps.height) {
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

    return true; // All structural data identical, skip re-render!
});