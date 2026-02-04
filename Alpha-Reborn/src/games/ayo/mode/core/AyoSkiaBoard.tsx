// AyoSkiaImageBoard.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  Canvas,
  Image as SkiaImage,
  useImage,
  Group,
  Skia,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useDerivedValue,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSound } from '../../../../../scripts/hooks/useSound';
import hopSound from '../../../../../src/assets/sounds/hop.mp3';
import captureSound from '../../../../assets/sounds/capture.mp3';
import { useBackgroundSound } from "../../../../../scripts/hooks/useBackgroundSound";
import bgSound from "../../../../assets/sounds/backgrounds1 short.mp3";
import { AYO_BOARD_CONFIG } from './ayoConfig';

const boardImageSource = require('../../../../assets/images/ayo-board.png');
const seedImageSource = require('../../../../assets/images/ayo-seed.png');
const SEED_IMAGE_SIZE = 45;

const getSeedPosition = (pitX: number, pitY: number, seedIndex: number, totalSeeds: number) => {
  const angle = (seedIndex / Math.max(1, totalSeeds)) * 2 * Math.PI;
  const radius = totalSeeds > 1 ? 15 : 0;
  const x = pitX + Math.cos(angle) * radius - SEED_IMAGE_SIZE / 2;
  const y = pitY + Math.sin(angle) * radius - SEED_IMAGE_SIZE / 1.3;
  return { x, y };
};

export const generatePitPositions = (rows: number, cols: number, boardWidth: number, boardHeight: number, marginX: number = 0.02, marginY: number = 0.1) => {
  const effectiveWidth = boardWidth * (1 - 2 * marginX);
  const effectiveHeight = boardHeight * (1 - 2 * marginY);
  const leftOffset = boardWidth * marginX;
  const topOffset = boardHeight * marginY;
  const cellWidth = effectiveWidth / cols;
  const cellHeight = effectiveHeight / rows;
  const radius = Math.min(cellWidth, cellHeight) / 2 - 5;
  const pits: { index: number; x: number; y: number; r: number }[] = [];
  let index = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pits.push({ index: index++, x: leftOffset + (c + 0.5) * cellWidth, y: topOffset + (r + 0.5) * cellHeight, r: radius });
    }
  }
  return pits;
};

interface AnimationStep {
  path: number[];
  boardStateBeforeSow: number[];
}

interface AyoSkiaImageBoardProps {
  board: number[];
  boardBeforeMove: number[];
  animatingPaths?: number[][];
  captures?: number[];
  onPitPress: (pitIndex: number) => void;
  onAnimationEnd?: () => void;
  onCaptureDuringAnimation?: (pitIndex: number) => void;
}

export const AyoSkiaImageBoard: React.FC<AyoSkiaImageBoardProps> = ({ board, boardBeforeMove, animatingPaths, captures, onPitPress, onAnimationEnd, onCaptureDuringAnimation }) => {
  const isAnimating = !!animatingPaths && animatingPaths.length > 0;
  const { play: playHop } = useSound(hopSound);
  const { play: playCapture } = useSound(captureSound);
  useBackgroundSound(bgSound);
  const [animationBoard, setAnimationBoard] = useState<number[] | null>(null);
  const [animationSteps, setAnimationSteps] = useState<AnimationStep[]>([]);
  const animationTimers = useRef<NodeJS.Timeout[]>([]);
  const boardImage = useImage(boardImageSource);
  const seedImage = useImage(seedImageSource);
  const animatedX = useSharedValue(0);
  const animatedY = useSharedValue(0);
  const animatedOpacity = useSharedValue(0);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isPortrait = screenHeight >= screenWidth;

  const BOARD_IMAGE_WIDTH = 721;
  const BOARD_IMAGE_HEIGHT = 300;
  const BOARD_ASPECT_RATIO = BOARD_IMAGE_WIDTH / BOARD_IMAGE_HEIGHT;

  let canvasWidth: number;
  let canvasHeight: number;

  if (isPortrait) {
    canvasWidth = screenWidth * AYO_BOARD_CONFIG.portrait.widthMultiplier;
    canvasHeight = canvasWidth / BOARD_ASPECT_RATIO;
  } else {
    // In landscape, prioritize fitting within height to leave room for profiles
    canvasHeight = screenHeight * AYO_BOARD_CONFIG.landscape.heightMultiplier;
    canvasWidth = canvasHeight * BOARD_ASPECT_RATIO;

    // Cap width to screen width if necessary
    if (canvasWidth > screenWidth * AYO_BOARD_CONFIG.landscape.maxWidthMultiplier) {
      canvasWidth = screenWidth * AYO_BOARD_CONFIG.landscape.maxWidthMultiplier;
      canvasHeight = canvasWidth / BOARD_ASPECT_RATIO;
    }
  }

  const scale = canvasWidth / BOARD_IMAGE_WIDTH;

  const PIT_POSITIONS = useMemo(() => generatePitPositions(2, 6, BOARD_IMAGE_WIDTH, BOARD_IMAGE_HEIGHT), []);

  const tapGesture = Gesture.Tap().onEnd(({ x, y }) => {
    if (isAnimating) return;
    const scaledX = x / scale;
    const scaledY = y / scale;
    for (const pit of PIT_POSITIONS) {
      if (Math.sqrt((pit.x - scaledX) ** 2 + (pit.y - scaledY) ** 2) < pit.r) {
        if (pit.index >= 6) runOnJS(onPitPress)(pit.index);
        return;
      }
    }
  });

  useEffect(() => {
    if (!animatingPaths || animatingPaths.length === 0) {
      setAnimationSteps([]);
      return;
    }
    const steps: AnimationStep[] = [];
    let tempBoard = [...boardBeforeMove];
    for (const path of animatingPaths) {
      if (path.length > 0) {
        const startPit = path[0];
        const boardStateBeforeSow = [...tempBoard];
        boardStateBeforeSow[startPit] = 0;
        steps.push({ path, boardStateBeforeSow });
        let finalBoardForStep = [...boardStateBeforeSow];
        for (let i = 1; i < path.length; i++) {
          const pitIdx = path[i];
          finalBoardForStep[pitIdx]++;
          if (captures?.includes(pitIdx) && finalBoardForStep[pitIdx] === 4) {
            finalBoardForStep[pitIdx] = 0;
          }
        }
        tempBoard = finalBoardForStep;
      }
    }
    setAnimationSteps(steps);
  }, [animatingPaths, boardBeforeMove, captures]);

  useEffect(() => {
    cancelAnimation(animatedX);
    cancelAnimation(animatedY);
    cancelAnimation(animatedOpacity);
    animationTimers.current.forEach(clearTimeout);
    animationTimers.current = [];

    if (animationSteps.length === 0) {
      animatedOpacity.value = 0;
      if (animationBoard) setAnimationBoard(null);
      return;
    }

    const incrementSeedInPit = (pitIndex: number) => {
      setAnimationBoard(prevBoard => {
        if (!prevBoard) return null;
        const newBoard = [...prevBoard];
        newBoard[pitIndex]++;
        playHop();
        if (newBoard[pitIndex] === 4 && captures?.includes(pitIndex)) {
          newBoard[pitIndex] = 0;
          if (onCaptureDuringAnimation) {
            playCapture();
            onCaptureDuringAnimation(pitIndex);
          }
        }
        return newBoard;
      });
    };

    const playAnimationForStep = (stepIndex: number) => {
      if (stepIndex >= animationSteps.length) {
        animatedOpacity.value = withTiming(0, { duration: 120 }, finished => {
          if (finished && onAnimationEnd) runOnJS(onAnimationEnd)();
        });
        return;
      }

      const { path, boardStateBeforeSow } = animationSteps[stepIndex];
      setAnimationBoard(boardStateBeforeSow);
      const startPit = PIT_POSITIONS.find(p => p.index === path[0]);

      const scheduleNextStep = () => {
        animationTimers.current.push(setTimeout(() => playAnimationForStep(stepIndex + 1), 50));
      };

      if (!startPit || path.length <= 1) {
        scheduleNextStep();
        return;
      }

      const startPos = getSeedPosition(startPit.x, startPit.y, 0, 1);
      animatedX.value = startPos.x;
      animatedY.value = startPos.y;
      if (stepIndex === 0) animatedOpacity.value = withTiming(1, { duration: 80 });

      const durationPerHop = 250;
      const xSeq: any[] = [];
      const ySeq: any[] = [];

      for (let i = 1; i < path.length; i++) {
        const pit = PIT_POSITIONS.find(p => p.index === path[i]);
        if (!pit) continue;
        const pos = getSeedPosition(pit.x, pit.y, 0, 1);
        xSeq.push(withTiming(pos.x, { duration: durationPerHop, easing: Easing.inOut(Easing.ease) }));
        ySeq.push(withTiming(pos.y, { duration: durationPerHop, easing: Easing.inOut(Easing.ease) }, finished => {
          if (finished) {
            runOnJS(incrementSeedInPit)(path[i]);
            if (i === path.length - 1) runOnJS(scheduleNextStep)();
          }
        }));
      }

      if (xSeq.length > 0) {
        animatedX.value = withSequence(...xSeq);
        animatedY.value = withSequence(...ySeq);
      } else {
        scheduleNextStep();
      }
    };

    playAnimationForStep(0);
  }, [animationSteps]);

  const animatedTransform = useDerivedValue(() => [
    { translateX: animatedX.value * scale },
    { translateY: animatedY.value * scale }
  ]);
  const derivedAnimatedOpacity = useDerivedValue(() => animatedOpacity.value);
  const currentBoard = isAnimating ? animationBoard ?? boardBeforeMove : board;

  if (!boardImage || !seedImage) return null;

  return (
    <GestureDetector gesture={tapGesture}>
      <Canvas style={[
        { width: canvasWidth, height: canvasHeight },
        isPortrait ? AYO_BOARD_CONFIG.portrait.margins : AYO_BOARD_CONFIG.landscape.margins
      ]}>
        <SkiaImage image={boardImage} x={0} y={0} width={canvasWidth} height={canvasHeight} fit="fill" />
        {currentBoard.map((seedCount, pitIndex) => {
          if (seedCount === 0) return null;
          const pit = PIT_POSITIONS.find(p => p.index === pitIndex);
          if (!pit) return null;
          return Array.from({ length: seedCount }).map((_, seedIndex) => {
            const { x, y } = getSeedPosition(pit.x, pit.y, seedIndex, seedCount);
            return <SkiaImage key={`${pitIndex}-${seedIndex}`} image={seedImage} x={x * scale} y={y * scale} width={SEED_IMAGE_SIZE * scale} height={SEED_IMAGE_SIZE * scale} />;
          });
        })}
        <Group transform={animatedTransform} opacity={derivedAnimatedOpacity}>
          <SkiaImage image={seedImage} x={0} y={0} width={SEED_IMAGE_SIZE * scale} height={SEED_IMAGE_SIZE * scale} />
        </Group>
      </Canvas>
    </GestureDetector>
  );
};
