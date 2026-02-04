import React, { useMemo, memo, useRef, useEffect, useCallback } from "react";
import { StyleSheet, View, Text } from "react-native";
import { Canvas, Group, RoundedRect, DashPathEffect, vec } from "@shopify/react-native-skia"; // ✅ Added imports
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS } from "react-native-reanimated";
import { WhotCardBack } from "./WhotCardBack";
import { CARD_WIDTH, CARD_HEIGHT } from "./whotConfig";
import { getCoords } from "../coordinateHelper";

interface MarketPileProps {
  count: number;
  font: any;
  smallFont: any;
  onPress?: () => void;
  width: number;
  height: number;
}

const MAX_STACK_CARDS = 15;
const STACK_OFFSET = 0.4;

// --- 1. Canvas for the Cards ---
interface MemoizedMarketCanvasProps {
  visualStackCount: number;
  font: any;
  smallFont: any;
}

const MemoizedMarketCanvas = memo(
  ({ visualStackCount, font, smallFont }: MemoizedMarketCanvasProps) => {
    return (
      <Canvas style={StyleSheet.absoluteFill}>
        {Array.from({ length: visualStackCount }).map((_, index) => (
          <Group
            key={index}
            transform={[{ translateY: index * STACK_OFFSET }]}
          >
            <WhotCardBack
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              font={font}
              smallFont={smallFont}
            />
          </Group>
        ))}
      </Canvas>
    );
  }
);

// --- 2. Canvas for Empty Slot (Zero Index) ---
// ✅ This renders when the market is empty
const EmptyMarketPlaceholder = memo(() => {
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <RoundedRect
        x={0}
        y={0}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        r={8} // Border Radius
        color="rgba(255, 255, 255, 0.3)" // Semi-transparent white
        style="stroke"
        strokeWidth={1.5}
      >
        <DashPathEffect intervals={[10, 10]} />
      </RoundedRect>
    </Canvas>
  );
});

export const MarketPile = memo(
  ({
    count,
    font,
    smallFont,
    onPress,
    width,
    height,
  }: MarketPileProps) => {
    // console.log("LOG: 🟡 MarketPile re-rendered.");

    // Store onPress in a ref to avoid stale closure in worklet
    const onPressRef = useRef(onPress);
    useEffect(() => {
      onPressRef.current = onPress;
    }, [onPress]);

    // Stable callback for worklet to call via runOnJS
    const handleMarketPress = useCallback(() => {
      if (onPressRef.current) {
        onPressRef.current();
      }
    }, []);

    const marketPos = useMemo(
      () => getCoords("market", {}, width, height),
      [width, height]
    );

    const style = useMemo(
      () => ({
        position: "absolute" as const,
        width: CARD_WIDTH,
        height: CARD_HEIGHT + MAX_STACK_CARDS * STACK_OFFSET + 20,
        top: marketPos.y - CARD_HEIGHT / 2 - 10,
        left: marketPos.x - CARD_WIDTH / 2,
        zIndex: 100,
        overflow: "visible" as const, // Fixed type error
      }),
      [marketPos]
    );

    const visualStackCount = useMemo(
      () => Math.min(count, MAX_STACK_CARDS),
      [count]
    );

    const tapGesture = useMemo(
      () =>
        Gesture.Tap().onEnd(() => {
          "worklet";
          runOnJS(handleMarketPress)();
        }),
      [handleMarketPress]
    );

    if (!font || !smallFont) {
      return null;
    }

    return (
      <GestureDetector gesture={tapGesture}>
        <Animated.View style={style}>

          {/* ✅ LOGIC: If count is 0, show placeholder. If > 0, show cards. */}
          {count === 0 ? (
            <EmptyMarketPlaceholder />
          ) : (
            <MemoizedMarketCanvas
              visualStackCount={visualStackCount}
              font={font}
              smallFont={smallFont}
            />
          )}

          {count > 0 && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{count}</Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    );
  }
);

const styles = StyleSheet.create({
  badgeContainer: {
    position: "absolute",
    left: -12,
    top: 8,
    backgroundColor: "#00008B",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    zIndex: 20,
  },
  badgeText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 14,
  },
});