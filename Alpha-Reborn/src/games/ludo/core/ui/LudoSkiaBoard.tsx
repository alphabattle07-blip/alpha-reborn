import React, { useMemo, useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { Canvas, Image as SkiaImage, useImage, Circle, Group, Paint, Shadow } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, withTiming, withSequence, withDelay, withRepeat, Easing, runOnJS, useDerivedValue } from 'react-native-reanimated';
import { LudoBoardData } from './LudoCoordinates';
import { Path, Skia } from '@shopify/react-native-skia';

const boardImageSource = require('../../../../assets/images/ludoBoard.png');
const blueImageSource = require('../../../../assets/images/blue.png');
const greenImageSource = require('../../../../assets/images/green.png');
const redImageSource = require('../../../../assets/images/red.png');
const yellowImageSource = require('../../../../assets/images/yellow.png');

// Normalized positions for color images (center of each yard)
// Adjusted to be outside the board but flush against the edges
const COLOR_IMAGE_POSITIONS = {
    red: { x: 0.1090, y: 0.009 },    // Left side
    green: { x: 0.740, y: 0.00000001 },  // Top side
    yellow: { x: 0.670, y: 0.850 }, // Right side
    blue: { x: 0.0190, y: 0.8550 },   // Bottom side
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
        { x: 0.814 - HOME_OFFSET, y: 0.103 - HOME_OFFSET },
        { x: 0.814 + HOME_OFFSET, y: 0.103 - HOME_OFFSET },
        { x: 0.915 - HOME_OFFSET, y: 0.052 + HOME_OFFSET },
        { x: 0.917 + HOME_OFFSET, y: 0.052 + HOME_OFFSET },
    ],
    yellow: [
        { x: 0.670 - HOME_OFFSET, y: 0.850 - HOME_OFFSET },
        { x: 0.670 + HOME_OFFSET, y: 0.850 - HOME_OFFSET },
        { x: 0.670 - HOME_OFFSET, y: 0.850 + HOME_OFFSET },
        { x: 0.670 + HOME_OFFSET, y: 0.850 + HOME_OFFSET },
    ],
    blue: [
        // Tweaked Blue positions to be slightly better centered if needed
        // Keeping symmetrical for now, but editable
        { x: 0.2490 - HOME_OFFSET, y: 0.9590 - HOME_OFFSET },
        { x: 0.1500 + HOME_OFFSET, y: 0.9590 - HOME_OFFSET },
        { x: 0.1500 - HOME_OFFSET, y: 0.9080 + HOME_OFFSET },
        { x: 0.0480 + HOME_OFFSET, y: 0.9080 + HOME_OFFSET },
    ],
};

// Configuration for sizes (relative to canvas width)
const BOARD_SCALE = 0.90;      // REDUCED from 0.76 to make room for big images
const SIDE_IMAGE_SCALE = 0.127; // Size of the side images relative to canvas (approx 11%)

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

const AnimatedSeed = ({ id, playerId, seedSubIndex, currentPos, landingPos, animationDelay, isActive, boardX, boardY, boardSize, color, radius, colorName, canvasWidth, canvasHeight, stackIndex, stackSize }: { id: string, playerId: string, seedSubIndex: number, currentPos: number, landingPos: number, animationDelay: number, isActive: boolean, boardX: number, boardY: number, boardSize: number, color: string, radius: number, colorName: 'red' | 'yellow' | 'blue' | 'green', canvasWidth: number, canvasHeight: number, stackIndex: number, stackSize: number }) => {
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

        if (oldPos === newPos) {
            cx.value = target.x;
            cy.value = target.y;
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
            return;
        }

        if (newPos === -1) {
            // Captured seed returning home. Wait for capturing seed to land!
            const delay = animationDelay || 0;
            const houseAnim = withTiming(1, { duration: 400 }); // Normal speed for house return
            cx.value = withSequence(withDelay(delay, withTiming(target.x, { duration: 400 })));
            cy.value = withSequence(withDelay(delay, withTiming(target.y, { duration: 400 })));
            // Pulse on return
            scale.value = withSequence(
                withDelay(delay, withTiming(1.2, { duration: 200 })),
                withTiming(1, { duration: 200 })
            );
            return;
        }

        const steps = [];
        const diff = landingPos - oldPos;
        if (diff > 0 && diff <= 12) {
            for (let i = oldPos + 1; i <= landingPos; i++) steps.push(i);
        } else {
            steps.push(landingPos);
        }

        const xSequence = steps.map((i, idx) => {
            const isLast = idx === steps.length - 1 && landingPos === newPos;
            return withTiming(getTargetPixels(i, isLast).x, { duration: TILE_ANIMATION_DURATION, easing: Easing.linear });
        });
        const ySequence = steps.map((i, idx) => {
            const isLast = idx === steps.length - 1 && landingPos === newPos;
            return withTiming(getTargetPixels(i, isLast).y, { duration: TILE_ANIMATION_DURATION, easing: Easing.linear });
        });

        // Generate scale sequence for hopping
        const scaleSequence: any[] = [];
        steps.forEach(() => {
            scaleSequence.push(withTiming(1.25, { duration: TILE_ANIMATION_DURATION / 2, easing: Easing.out(Easing.quad) }));
            scaleSequence.push(withTiming(1.0, { duration: TILE_ANIMATION_DURATION / 2, easing: Easing.in(Easing.quad) }));
        });

        if (landingPos !== newPos) {
            // Capture! Add a jump to final position at the end of the sequence
            xSequence.push(withTiming(getTargetPixels(newPos, true).x, { duration: 400, easing: Easing.out(Easing.quad) }));
            ySequence.push(withTiming(getTargetPixels(newPos, true).y, { duration: 400, easing: Easing.out(Easing.quad) }));

            // Big Hop for victory jump
            scaleSequence.push(withTiming(1.5, { duration: 200, easing: Easing.out(Easing.quad) }));
            scaleSequence.push(withTiming(1.0, { duration: 200, easing: Easing.in(Easing.quad) }));
        }

        cx.value = withSequence(...(xSequence as [any, ...any[]]));
        cy.value = withSequence(...(ySequence as [any, ...any[]]));
        scale.value = withSequence(...(scaleSequence as [any, ...any[]]));

    }, [currentPos, landingPos, animationDelay, boardX, boardY, boardSize, stackIndex, stackSize]);

    const transform = useDerivedValue(() => [{ scale: scale.value }]);
    const origin = useDerivedValue(() => ({ x: cx.value, y: cy.value }));
    const indicatorScale = useDerivedValue(() => 1 + pulse.value * 0.4);
    const indicatorOpacity = useDerivedValue(() => pulse.value);

    return (
        <Group>
            {/* Active Move Indicator */}
            <Group opacity={indicatorOpacity}>
                <Circle cx={cx} cy={cy} r={radius * 1.5} color={color}>
                    <Paint style="stroke" strokeWidth={2} color={color} />
                </Circle>
                <Circle cx={cx} cy={cy} r={useDerivedValue(() => radius * (1.2 + pulse.value * 0.5))} color={color} opacity={useDerivedValue(() => (1 - pulse.value) * 0.5)}>
                    <Paint style="stroke" strokeWidth={1} color={color} />
                </Circle>
            </Group>

            <Group transform={transform} origin={origin}>
                <Circle cx={cx} cy={cy} r={radius} color={color}>
                    <Paint style="stroke" strokeWidth={1.5} color="white" />
                    <Shadow dx={1} dy={2} blur={3} color="rgba(0,0,0,0.5)" />
                </Circle>
            </Group>
        </Group>
    );
};

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

export const LudoSkiaBoard = ({ onBoardPress, positions, level }: { onBoardPress: any, positions: { [key: string]: { pos: number, land: number, delay: number, isActive: boolean }[] }, level?: number }) => {
    const boardImage = useImage(boardImageSource);
    const blueImage = useImage(blueImageSource);
    const greenImage = useImage(greenImageSource);
    const redImage = useImage(redImageSource);
    const yellowImage = useImage(yellowImageSource);

    const { width } = useWindowDimensions();
    const canvasWidth = width * 0.95;
    const canvasHeight = canvasWidth * 1.2; // Increase height to give more room top/bottom

    // Scale board to make room for outer images
    // Using BOARD_SCALE constant
    const boardSize = canvasWidth * BOARD_SCALE;
    const marginX = (canvasWidth - boardSize) / 2;
    const marginY = (canvasHeight - boardSize) / 2;
    const boardX = marginX;
    const boardY = marginY;

    const seedRadius = (boardSize / 15) * 0.35;

    // Size for colored images attached to the ends
    // Using SIDE_IMAGE_SCALE constant
    const sideImageSize = canvasWidth * SIDE_IMAGE_SCALE;

    const seedsData = useMemo(() => {
        const list: any[] = [];
        const positionGroups: { [key: string]: number[] } = {};

        Object.entries(positions).forEach(([playerId, seedPositions]) => {
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
    }, [positions]);

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