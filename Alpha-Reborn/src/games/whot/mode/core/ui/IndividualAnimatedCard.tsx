// IndividualAnimatedCard.tsx
import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  memo,
  useEffect,
  useRef,
} from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Vibration } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  withSequence,
  withRepeat,
  withDelay,
  interpolateColor,
} from "react-native-reanimated";
import { Canvas, SkFont } from "@shopify/react-native-skia";
import { Card, CardSuit, PendingAction, RuleVersion } from "../types"; // Make sure this path is correct
import { CARD_WIDTH, CARD_HEIGHT } from "./whotConfig"; // ✅ FIX IS HERE
import { AnimatedCard } from "./WhotCardTypes";
import { getCoords } from "../coordinateHelper"; // Make sure this path is correct
import { AnimatedWhotCard } from "./AnimatedWhotCard";
import { logAnimStart } from "./LatencyLogger";
import { isValidMoveRule1 } from "../rules";
import { isValidMoveRule2 } from "../rules2";

export interface IndividualAnimatedCardHandle {
  dealTo: (
    target: "player" | "computer" | "pile" | "market",
    options?: any,
    instant?: boolean,
    timestamp?: number
  ) => Promise<void>;
  flip: (faceUp: boolean) => Promise<void>;
  teleportTo: (
    target: "player" | "computer" | "pile" | "market",
    options?: any,
    timestamp?: number
  ) => void;
}

interface Props {
  card: Card;
  font: SkFont | null;
  whotFont: SkFont | null;
  marketPos: { x: number; y: number };
  playerHandIdsSV: SharedValue<string[]>; // From AnimatedCardList
  width: number;
  height: number;
  onPress: (card: Card) => void;
  gameTickSV: SharedValue<number>;

  // Validation Props
  isMyTurnSV: SharedValue<boolean>;
  lastCardOnPileSV: SharedValue<Card | null>;
  pendingActionSV: SharedValue<PendingAction | null>;
  calledSuitSV: SharedValue<CardSuit | null>;
  ruleVersionSV: SharedValue<RuleVersion>;
  currentPlayerIndexSV: SharedValue<number>;
  onFeedback?: (message: string) => void;
}

// =================================================================
// 1. The "Firewall" Component
// =================================================================
interface CardRendererProps {
  card: AnimatedCard;
  font: SkFont;
  whotFont: SkFont;
  style: any; // The animated style
  gesture: any; // The tap gesture
  errorGlow: SharedValue<number>;
}

const MemoizedCardRenderer = memo(
  ({ card, font, whotFont, style, gesture, errorGlow }: CardRendererProps) => {
    const glowStyle = useAnimatedStyle(() => ({
      position: 'absolute',
      top: -4,
      left: -4,
      right: -4,
      bottom: -4,
      borderWidth: 4,
      borderColor: interpolateColor(
        errorGlow.value,
        [0, 1],
        ['transparent', '#ef5350']
      ),
      borderRadius: 12,
      opacity: errorGlow.value,
    }));

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View style={style}>
          <Animated.View style={glowStyle} />
          <Canvas style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
            <AnimatedWhotCard
              card={card}
              font={font}
              whotFont={whotFont}
            />
          </Canvas>
        </Animated.View>
      </GestureDetector>
    );
  }
);

// =================================================================
// 2. The Main Component
// =================================================================
const IndividualAnimatedCard = memo(
  forwardRef<IndividualAnimatedCardHandle, Props>(
    (
      {
        card,
        font,
        whotFont,
        marketPos,
        playerHandIdsSV,
        width,
        height,
        onPress,
        gameTickSV,
        isMyTurnSV,
        lastCardOnPileSV,
        pendingActionSV,
        calledSuitSV,
        ruleVersionSV,
        currentPlayerIndexSV,
        onFeedback
      },
      ref
    ) => {
      // --- Animated Values ---
      const x = useSharedValue(marketPos.x - CARD_WIDTH / 2);
      const y = useSharedValue(marketPos.y - CARD_HEIGHT / 2);
      const shakeX = useSharedValue(0);
      const errorGlow = useSharedValue(0);
      const rotation = useSharedValue(0); // For fanning the hand
      const zIndex = useSharedValue(1);
      const cardRotate = useSharedValue(0); // For the flip
      const internalX = useSharedValue(0); // For Skia (can be 0)
      const internalY = useSharedValue(0); // For Skia (can be 0)

      // --- Stable Shared Value Props ---
      const cardSV = useSharedValue(card);

      // ⚡ SIGNAL-BASED ANIMATION TRIGGER
      const targetSV = useSharedValue<{
        target: "player" | "computer" | "pile" | "market";
        options?: any;
        instant?: boolean;
        timestamp: number;
      } | null>(null);

      // ⚡ IMMEDIATE REACTION (No tick throttling)
      useAnimatedReaction(
        () => targetSV.value,
        (val) => {
          if (!val) return;

          runOnJS(logAnimStart)(val.timestamp);

          const { target, options, instant } = val;
          const {
            x: targetX,
            y: targetY,
            rotation: targetRot,
          } = getCoords(target, options, width, height);

          const newX = targetX - CARD_WIDTH / 2;
          const newY = targetY - CARD_HEIGHT / 2;
          const newRot = targetRot || 0;

          if (instant) {
            // Settle immediately
            const { cardIndex } = options || {};
            if (target === "player") zIndex.value = 100 + (cardIndex || 0);
            else if (target === "computer") zIndex.value = 200 + (cardIndex || 0);
            else if (target === "pile") zIndex.value = 50 + (cardIndex || 0);
            else zIndex.value = 1;

            x.value = newX;
            y.value = newY;
            rotation.value = newRot;
          } else {
            // ⚡ LATENCY COMPENSATION (Catch-up Logic)
            const BASELINE_DURATION = 450;
            const MIN_DURATION = 150;

            let adjustedDuration = BASELINE_DURATION;
            if (val.timestamp) {
              const lag = Date.now() - val.timestamp;
              if (lag > 0) {
                adjustedDuration = Math.max(MIN_DURATION, BASELINE_DURATION - lag);
              }
            }

            x.value = withTiming(newX, { duration: adjustedDuration });
            y.value = withTiming(newY, { duration: adjustedDuration });
            rotation.value = withTiming(newRot, { duration: adjustedDuration }, (finished) => {
              if (finished) {
                const { cardIndex } = options || {};
                if (target === "player") zIndex.value = 100 + (cardIndex || 0);
                else if (target === "computer") zIndex.value = 200 + (cardIndex || 0);
                else if (target === "pile") zIndex.value = 50 + (cardIndex || 0);
              }
            });
          }
        },
        [width, height]
      );

      // Store onPress in a ref (not SharedValue) to avoid worklet/JS thread issues
      const onPressRef = useRef(onPress);

      useEffect(() => {
        cardSV.value = card;
      }, [card, cardSV]);

      useEffect(() => {
        onPressRef.current = onPress;
      }, [onPress]);

      // Stable callback that worklet can safely call via runOnJS
      const handleCardPress = useMemo(() => (cardData: Card) => {
        if (onPressRef.current) {
          onPressRef.current(cardData);
        }
      }, []);

      // --- Imperative Handle (for parent control) ---
      useImperativeHandle(ref, () => ({
        teleportTo(target, options, timestamp) {
          targetSV.value = { target, options, instant: true, timestamp: timestamp || Date.now() };
        },

        async dealTo(target, options, instant, timestamp) {
          return new Promise((resolve) => {
            targetSV.value = { target, options, instant, timestamp: timestamp || Date.now() };
            setTimeout(resolve, instant ? 0 : 500);
          });
        },

        async flip(show) {
          return new Promise((resolve) => {
            cardRotate.value = withTiming(
              show ? Math.PI : 0, // 0 = back, PI = front
              { duration: 300 },
              (finished) => {
                if (finished) {
                  runOnJS(resolve)();
                }
              }
            );
          });
        },
      }));

      const triggerInvalidMoveFeedback = () => {
        "worklet";
        shakeX.value = withSequence(
          withTiming(-10, { duration: 50 }),
          withRepeat(withTiming(10, { duration: 50 }), 3, true),
          withTiming(0, { duration: 50 })
        );
        errorGlow.value = withSequence(
          withTiming(1, { duration: 100 }),
          withDelay(400, withTiming(0, { duration: 300 }))
        );
      };

      // --- Tap Gesture ---
      const tapGesture = useMemo(
        () =>
          Gesture.Tap().onEnd(() => {
            "worklet";

            const handIds = playerHandIdsSV.value;
            const currentCard = cardSV.value;

            let isPlayerCard = false;
            for (let i = 0; i < handIds.length; i++) {
              if (handIds[i] === currentCard.id) {
                isPlayerCard = true;
                break;
              }
            }

            if (isPlayerCard) {
              // --- LOCAL PRE-VALIDATION ---

              // 1. Is it my turn?
              if (!isMyTurnSV.value) {
                triggerInvalidMoveFeedback();
                runOnJS(Vibration.vibrate)(50);
                if (onFeedback) runOnJS(onFeedback)("Not your turn!");
                return;
              }

              // 2. Is move valid?
              const topCard = lastCardOnPileSV.value;
              if (!topCard) {
                // If pile is empty, any card is valid (usually doesn't happen during game)
              } else {
                const mockState = {
                  pile: [topCard],
                  pendingAction: pendingActionSV.value,
                  lastPlayedCard: topCard,
                  calledSuit: calledSuitSV.value,
                  currentPlayer: currentPlayerIndexSV.value,
                  players: [], // Not needed for validation
                  direction: 1,
                  ruleVersion: ruleVersionSV.value,
                  market: [],
                  winner: null,
                  mustPlayNormal: false
                } as any;

                const isValid = ruleVersionSV.value === 'rule1'
                  ? isValidMoveRule1(currentCard, mockState)
                  : isValidMoveRule2(currentCard, mockState);

                if (!isValid) {
                  triggerInvalidMoveFeedback();
                  runOnJS(Vibration.vibrate)(50);
                  if (onFeedback) runOnJS(onFeedback)("Invalid card for this move!");
                  return;
                }
              }

              // Parent handleAction will handle the animation via ImperativeHandle
              runOnJS(handleCardPress)(currentCard);
            }
          }),
        [cardSV, playerHandIdsSV, handleCardPress, width, height, isMyTurnSV, lastCardOnPileSV, pendingActionSV, calledSuitSV, ruleVersionSV, currentPlayerIndexSV, onFeedback]
      );

      // --- Animated Style ---
      const animatedStyle = useAnimatedStyle(() => ({
        position: "absolute",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        transform: [
          { translateX: x.value + shakeX.value },
          { translateY: y.value },
          { rotate: `${rotation.value}deg` },
        ] as any,
        zIndex: zIndex.value,
      }));

      // --- Skia Data ---
      const animatedCard: AnimatedCard = useMemo(
        () => ({
          ...card,
          x: internalX,
          y: internalY,
          rotate: cardRotate,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          initialIndex: 0,
        }),
        [card, cardRotate, internalX, internalY]
      );

      // --- Render ---
      if (!font || !whotFont) {
        return null;
      }

      return (
        <MemoizedCardRenderer
          card={animatedCard}
          font={font}
          whotFont={whotFont}
          style={animatedStyle}
          gesture={tapGesture}
          errorGlow={errorGlow}
        />
      );
    }
  )
);
export default IndividualAnimatedCard;
