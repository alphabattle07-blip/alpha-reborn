import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useWindowDimensions, View, Image, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useDerivedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    withDelay,
    Easing,
    runOnJS,
    cancelAnimation
} from 'react-native-reanimated';
import Svg, { Path as SvgPath, G as SvgGroup } from 'react-native-svg';
import { LudoBoardData } from './LudoCoordinates';
import { playLudoSound } from '../useLudoSoundEffects';

const boardImageSource = require('../../../../assets/images/ludoBoard.png');

// Normalized positions for color images (center of each yard)
const COLOR_IMAGE_POSITIONS = {
    red: { x: 0.1090, y: 0.009 },
    green: { x: 0.740, y: -0.05 },
    yellow: { x: 0.670, y: 0.850 },
    blue: { x: 0.0190, y: 0.8850 },
};


const BOARD_SCALE = 0.96;
const SIDE_IMAGE_SCALE = 0.137;
const TILE_ANIMATION_DURATION = 300;

const SHIELD_PATH = "M 12 2 L 4 5 L 4 11 C 4 16.1 7.4 20.8 12 22 C 16.6 20.8 20 16.1 20 11 L 20 5 L 12 2 Z";
const SHIELD_USER_SCALE = 0.8;
const SHIELD_OFFSET_X = 0;
const SHIELD_OFFSET_Y = 0;

const RED_PATH = LudoBoardData.getPathForColor('red');
const YELLOW_PATH = LudoBoardData.getPathForColor('yellow');
const BLUE_PATH = LudoBoardData.getPathForColor('blue');
const GREEN_PATH = LudoBoardData.getPathForColor('green');

const applyRadialOffset = (base: { x: number, y: number }, index: number, total: number, boardSize: number) => {
    if (total <= 1) return base;
    const offsetRadius = boardSize * 0.018;
    const angle = (2 * Math.PI / total) * index - Math.PI / 2;
    return {
        x: base.x + Math.cos(angle) * offsetRadius,
        y: base.y + Math.sin(angle) * offsetRadius
    };
};

const AnimatedNativeSeed = React.memo(({ id, playerId, seedSubIndex, currentPos, landingPos, animationDelay, isActive, isPending, isSelected, boardX, boardY, boardSize, color, radius, colorName, canvasWidth, canvasHeight, stackIndex, stackSize }: { id: string, playerId: string, seedSubIndex: number, currentPos: number, landingPos: number, animationDelay: number, isActive: boolean, isPending: boolean, isSelected?: boolean, boardX: number, boardY: number, boardSize: number, color: string, radius: number, colorName: 'red' | 'yellow' | 'blue' | 'green', canvasWidth: number, canvasHeight: number, stackIndex: number, stackSize: number }) => {
    const getTargetPixels = (stepIndex: number, isFinal: boolean = false) => {
        let norm = { x: 0.5, y: 0.5 };

        let path = RED_PATH;
        if (colorName === 'yellow') path = YELLOW_PATH;
        else if (colorName === 'blue') path = BLUE_PATH;
        else if (colorName === 'green') path = GREEN_PATH;

        if (stepIndex === -1) {
            const yardArr = LudoBoardData.yards[colorName];
            norm = yardArr[seedSubIndex % 4];
        } else if (stepIndex >= 56) {
            const posArray = (LudoBoardData as any).home[colorName];
            const pos = posArray[seedSubIndex % 4];
            return { x: boardX + pos.x * boardSize, y: boardY + pos.y * boardSize };
        } else {
            if (path[stepIndex]) norm = path[stepIndex];
        }

        const base = {
            x: boardX + norm.x * boardSize,
            y: boardY + norm.y * boardSize
        };

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

    const flatPathCoords = useMemo(() => {
        const coords = new Float32Array(120);
        for(let i = -1; i <= 58; i++) {
            const pt = getTargetPixels(i, false); 
            coords[(i + 1) * 2] = pt.x;
            coords[(i + 1) * 2 + 1] = pt.y;
        }
        return coords;
    }, [colorName, boardX, boardY, boardSize, canvasWidth, canvasHeight]);

    const dynamicPath = useSharedValue(flatPathCoords);
    useEffect(() => { dynamicPath.value = flatPathCoords; }, [flatPathCoords]);

    const moveStartPos = useSharedValue<number>(-1);
    const moveEndPos = useSharedValue<number>(-1);
    const moveDirectly = useSharedValue<boolean>(false);
    const moveOriginX = useSharedValue<number>(target.x);
    const moveOriginY = useSharedValue<number>(target.y);
    const pathProgress = useSharedValue<number>(1);

    const renderedX = useDerivedValue(() => {
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

        const exactStep = prog * (end - start);
        const currentOffset = Math.floor(exactStep);
        const fraction = exactStep - currentOffset;
        let x1 = (currentOffset === 0) ? originX : dynamicPath.value[(start + currentOffset + 1) * 2];
        let x2 = dynamicPath.value[(Math.min(end, start + currentOffset + 1) + 1) * 2];
        return x1 + (x2 - x1) * fraction;
    });

    const renderedY = useDerivedValue(() => {
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

        const exactStep = prog * (end - start);
        const currentOffset = Math.floor(exactStep);
        const fraction = exactStep - currentOffset;
        let y1 = (currentOffset === 0) ? originY : dynamicPath.value[(start + currentOffset + 1) * 2 + 1];
        let y2 = dynamicPath.value[(Math.min(end, start + currentOffset + 1) + 1) * 2 + 1];
        return y1 + (y2 - y1) * fraction;
    });

    const renderedRadius = useDerivedValue(() => {
        const prog = pathProgress.value;
        if (prog >= 1) return scale.value * radius;
        const start = moveStartPos.value;
        const end = moveEndPos.value;
        const isDirect = moveDirectly.value;
        const stepsCount = (isDirect || end <= start) ? 1 : (end - start);
        const localProg = (prog * stepsCount) % 1; 
        const hopScale = 1 + Math.sin(localProg * Math.PI) * 0.25; 
        return (scale.value === 1 ? hopScale : scale.value) * radius;
    });

    useEffect(() => {
        return () => {
            cancelAnimation(pulse);
            cancelAnimation(cx);
            cancelAnimation(cy);
            cancelAnimation(scale);
            cancelAnimation(pathProgress);
            cancelAnimation(shadowOpacity);
            pulse.value = 0;
            scale.value = 1;
            pathProgress.value = 1;
            shadowOpacity.value = 0;
        };
    }, [id]);

    useEffect(() => {
        if (isPending) {
            shadowOpacity.value = withTiming(0.4, { duration: 150 });
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

        cancelAnimation(cx);
        cancelAnimation(cy);
        cancelAnimation(scale);
        cancelAnimation(pathProgress);

        if (oldPos === newPos) {
            cx.value = target.x;
            cy.value = target.y;
            pathProgress.value = 1;
            return;
        }

        if (oldPos === -1 && landingPos === 0) {
            cx.value = withTiming(target.x, { duration: 250 });
            cy.value = withTiming(target.y, { duration: 250 });
            scale.value = withSequence(
                withTiming(1.3, { duration: 120 }),
                withTiming(1, { duration: 120 })
            );
            pathProgress.value = 1;
            return;
        }

        if (newPos === -1) {
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

        const moveDuration = (isDirect ? 1 : diff) * TILE_ANIMATION_DURATION;

        if (landingPos !== newPos) {
            pathProgress.value = 0;
            const captureTarget = getTargetPixels(newPos, true);
            pathProgress.value = withTiming(1, { duration: moveDuration, easing: Easing.linear }, (finished) => {
                if (finished) {
                    cx.value = withTiming(captureTarget.x, { duration: 400, easing: Easing.out(Easing.quad) });
                    cy.value = withTiming(captureTarget.y, { duration: 400, easing: Easing.out(Easing.quad) });
                    scale.value = withSequence(
                        withTiming(1.5, { duration: 200, easing: Easing.out(Easing.quad) }),
                        withTiming(1.0, { duration: 200, easing: Easing.in(Easing.quad) })
                    );
                }
            });
        } else {
            pathProgress.value = 0;
            pathProgress.value = withTiming(1, { duration: moveDuration, easing: Easing.out(Easing.quad) });
        }

        cancelAnimation(pulse);
        cancelAnimation(scale);
        pulse.value = 0;
        scale.value = 1;
        shadowOpacity.value = withTiming(0, { duration: 100 });

    }, [currentPos, landingPos, animationDelay, boardX, boardY, boardSize, stackIndex, stackSize]);

    const indicatorOpacity = useDerivedValue(() => pulse.value, [pulse]);

    const seedStyle = useAnimatedStyle(() => {
        return {
            position: 'absolute',
            left: 0,
            top: 0,
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            backgroundColor: color,
            borderColor: "rgba(255, 255, 255, 0.9)",
            borderWidth: 2,
            transform: [
                { translateX: renderedX.value - radius },
                { translateY: renderedY.value - radius },
                { scale: renderedRadius.value / radius }
            ]
        };
    });

    const indicatorStyle = useAnimatedStyle(() => {
        return {
            position: 'absolute',
            left: 0,
            top: 0,
            width: radius * 3.2,
            height: radius * 3.2,
            borderRadius: radius * 1.6,
            borderColor: color,
            borderWidth: 2.5,
            opacity: indicatorOpacity.value,
            transform: [
                { translateX: renderedX.value - radius * 1.6 },
                { translateY: renderedY.value - radius * 1.6 }
            ]
        };
    });

    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {isActive && !isSelected && (
                <Animated.View style={indicatorStyle} />
            )}
            <Animated.View style={seedStyle} />
        </View>
    );
}, (prevProps, nextProps) => {
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
        const posArray = (LudoBoardData as any).home[colorName];
        const pos = posArray[seedSubIndex % 4];
        return { x: boardX + pos.x * boardSize, y: boardY + pos.y * boardSize };
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

type LudoNativeBoardProps = {
    onBoardPress: (x: number, y: number, seed?: { playerId: string; seedIndex: number; position: number } | null) => void;
    positions: { [key: string]: { pos: number, land: number, delay: number, isActive: boolean }[] };
    level?: number;
    width?: number;
    height?: number;
    selectedSeedIndex?: number | null;
    pendingSeedIndices?: number[];
    localPlayerId?: string;
    boardX?: number;
    boardY?: number;
    boardSize?: number;
};

const LudoNativeBoardComponent = ({ onBoardPress, positions, level, width: propWidth, height: propHeight, selectedSeedIndex, pendingSeedIndices: propPendingSeedIndices, localPlayerId, boardX: propBoardX, boardY: propBoardY, boardSize: propBoardSize }: LudoNativeBoardProps) => {
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const canvasWidth = propWidth ?? (windowWidth * 0.95);
    const canvasHeight = propHeight ?? (windowHeight * 0.92);

    const throttledPositions = useThrottledValue(positions, 66);

    const boardSize = propBoardSize ?? (canvasWidth * BOARD_SCALE);
    const marginX = (canvasWidth - boardSize) / 2;
    const marginY = (canvasHeight - boardSize) / 2;
    const boardX = propBoardX ?? marginX;
    const boardY = propBoardY ?? marginY;
    
    // Ensure canvas matches the board's area for consistent seed conversion
    const finalCanvasWidth = propWidth ?? canvasWidth;
    const finalCanvasHeight = propHeight ?? canvasHeight;

    const seedRadius = (boardSize / 15) * 0.35;
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
                    key = `yard-${colorName}-${index}`;
                } else if (item.pos >= 56) {
                    key = `home-${colorName}-${index}`;
                } else {
                    const coord = path[item.pos];
                    if (coord) {
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

        Object.values(positionGroups).forEach(indices => {
            indices.forEach((listIdx, stackIdx) => {
                list[listIdx].stackIndex = stackIdx;
                list[listIdx].stackSize = indices.length;
            });
        });

        return list;
    }, [throttledPositions]);

    const findTappedSeed = (tapX: number, tapY: number) => {
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
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
                
                {/* Yard Border Outlines (Destination boxes for finished seeds) */}
                {[
                    { color: '#008000', id: 'green' }, // Green
                    { color: '#0000ff', id: 'blue' }, // Blue
                ].map((yard) => {
                    const seedDiameter = seedRadius * 2;
                    const yardWidth = (seedDiameter * 4) + (boardSize * 0.016) + (boardSize * 0.034);
                    const yardHeight = seedDiameter + (boardSize * 0.028);
                    
                    let boxLeft = 0;
                    let boxTop = 0;
                    if (yard.id === 'blue') {
                        boxLeft = boardX;
                        boxTop = boardY + boardSize + (boardSize * 0.048);
                    } else {
                        boxLeft = boardX + boardSize - yardWidth;
                        boxTop = boardY + (-0.095 * boardSize) - (yardHeight / 2);
                    }

                    return (
                        <View
                            key={`yard-border-outline-${yard.id}`}
                            style={{
                                position: 'absolute',
                                left: boxLeft,
                                top: boxTop,
                                width: yardWidth,
                                height: yardHeight,
                                borderWidth: 2.5,
                                borderColor: yard.color,
                                borderRadius: 12,
                            }}
                            pointerEvents="none"
                        />
                    );
                })}

                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight }}>
                    <Svg width={canvasWidth} height={canvasHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
                        {level !== undefined && level < 3 && LudoBoardData.shieldPositions.map((pos, idx) => {
                            const shieldX = boardX + pos.x * boardSize;
                            const shieldY = boardY + pos.y * boardSize;
                            const shieldSize = boardSize * 0.04; 

                            return (
                                <SvgGroup key={`shield-${idx}`} transform={`translate(${shieldX - (shieldSize/2)}, ${shieldY - (shieldSize/2)}) scale(${shieldSize / 24})`}>
                                    <SvgPath
                                        d={SHIELD_PATH}
                                        fill="#FFF"
                                        fillOpacity={0.8}
                                        stroke="#000"
                                        strokeWidth={1}
                                    />
                                </SvgGroup>
                            );
                        })}
                    </Svg>

                    {seedsData.map(s => (
                        <AnimatedNativeSeed
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
                </View>
            </View>
        </GestureDetector>
    );
};

export const LudoNativeBoard = React.memo(LudoNativeBoardComponent, (prevProps, nextProps) => {
    if (prevProps.level !== nextProps.level || 
        prevProps.width !== nextProps.width || 
        prevProps.height !== nextProps.height ||
        prevProps.selectedSeedIndex !== nextProps.selectedSeedIndex) {
        return false;
    }

    const prevKeys = Object.keys(prevProps.positions);
    const nextKeys = Object.keys(nextProps.positions);
    if (prevKeys.length !== nextKeys.length) return false;

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

    if (prevProps.pendingSeedIndices !== nextProps.pendingSeedIndices) {
        const prevPending = prevProps.pendingSeedIndices || [];
        const nextPending = nextProps.pendingSeedIndices || [];
        if (prevPending.length !== nextPending.length) return false;
        if (!prevPending.every((val, index) => val === nextPending[index])) return false;
    }


    if (prevProps.localPlayerId !== nextProps.localPlayerId) return false;

    return true;
});
