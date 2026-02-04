// ui/WhotSuitSelector.tsx
import React, { useEffect } from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import {
  Canvas,
  Group,
  Path,
  Rect,
  Skia,
  SkFont,
  RoundedRect,
  Text as SkText,
  Circle,
  BlurMask,
} from "@shopify/react-native-skia";
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  withSpring,
  useAnimatedStyle,
  withDelay,
} from "react-native-reanimated";
import { CardSuit } from "../core/types";

interface WhotSuitSelectorProps {
  isVisible: boolean;
  onSelectSuit: (suit: CardSuit) => void;
  width: number;
  height: number;
  font: SkFont | null;
}

const CARD_WIDTH = 60;
const CARD_HEIGHT = 90;
const COLOR_RED = "#A22323";

// --- Shape Drawing Logic (Same as your Card Face) ---
const ShapeIcon = ({ suit, x, y, size }: { suit: CardSuit; x: number; y: number; size: number }) => {
  const cx = x;
  const cy = y;

  switch (suit) {
    case "circle":
      return <Circle cx={cx} cy={cy} r={size / 2} color={COLOR_RED} />;
    case "triangle": {
      const path = Skia.Path.Make();
      const h = (size * Math.sqrt(3)) / 2;
      path.moveTo(cx, cy - h / 2);
      path.lineTo(cx - size / 2, cy + h / 2);
      path.lineTo(cx + size / 2, cy + h / 2);
      path.close();
      return <Path path={path} color={COLOR_RED} />;
    }
    case "cross": {
      const barWidth = size / 2.03;
      return (
        <Group color={COLOR_RED}>
          <Rect x={cx - size / 2} y={cy - barWidth / 2} width={size} height={barWidth} />
          <Rect x={cx - barWidth / 2} y={cy - size / 2} width={barWidth} height={size} />
        </Group>
      );
    }
    case "square":
      return (
        <Rect
          x={cx - size / 2}
          y={cy - size / 2}
          width={size}
          height={size}
          color={COLOR_RED}
        />
      );
    case "star": {
      const path = Skia.Path.Make();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? size / 2 : size / 4;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        if (i === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      path.close();
      return <Path path={path} color={COLOR_RED} />;
    }
    default:
      return null;
  }
};

// --- Single Selection Card Component ---
const SelectionCard = ({
  suit,
  index,
  font,
  onPress,
}: {
  suit: CardSuit;
  index: number;
  font: SkFont | null;
  onPress: (s: CardSuit) => void;
}) => {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(index * 50, withSpring(1));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!font) return null;

  const textWidth = font.getTextWidth("20");
  const padding = 8;
  const centerX = CARD_WIDTH / 2;
  const centerY = CARD_HEIGHT / 2;

  return (
    <AnimatedPressable style={[styles.cardWrapper, style]} onPress={() => onPress(suit)}>
      <Canvas style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
        <Group>
          {/* Card Body */}
          <RoundedRect x={0} y={0} width={CARD_WIDTH} height={CARD_HEIGHT} r={8} color="white" />
          <RoundedRect x={1} y={1} width={CARD_WIDTH - 2} height={CARD_HEIGHT - 2} r={8} color={COLOR_RED} style="stroke" strokeWidth={1.5} />

          {/* Top Left "20" */}
          <SkText x={padding} y={padding + 10} text="20" font={font} color={COLOR_RED} />

          {/* Small Top Icon */}
          <ShapeIcon suit={suit} x={padding + textWidth / 2} y={padding + 18} size={8} />

          {/* Center Main Shape */}
          <ShapeIcon suit={suit} x={centerX} y={centerY} size={26} />

          {/* Bottom Right "20" (Rotated) */}
          <Group origin={{ x: centerX, y: centerY }} transform={[{ rotate: Math.PI }]}>
            <SkText x={padding} y={padding + 10} text="20" font={font} color={COLOR_RED} />
            <ShapeIcon suit={suit} x={padding + textWidth / 2} y={padding + 18} size={8} />
          </Group>
        </Group>
      </Canvas>
    </AnimatedPressable>
  );
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const WhotSuitSelector = ({
  isVisible,
  onSelectSuit,
  width,
  height,
  font,
}: WhotSuitSelectorProps) => {
  if (!isVisible || !font) return null;

  const suits: CardSuit[] = ["circle", "triangle", "cross", "square", "star"];

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.overlay, { width, height }]}>
      <View style={styles.backdrop} />
      <View style={styles.container}>
        <Text style={styles.title}>SELECT A SHAPE</Text>
        <View style={styles.grid}>
          {suits.map((suit, index) => (
            <SelectionCard
              key={suit}
              suit={suit}
              index={index}
              font={font}
              onPress={onSelectSuit}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  container: {
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "white",
    marginBottom: 20,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowRadius: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 15,
    maxWidth: 320, // Forces wrap for better layout
  },
  cardWrapper: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
});

export default WhotSuitSelector;