// core/ui/ActiveSuitCard.tsx
import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import {
  Canvas,
  Group,
  Path,
  Rect,
  Skia,
  RoundedRect,
  Text as SkText,
  Circle,
} from "@shopify/react-native-skia";
import Animated, {
  ZoomIn,
  FadeOut,
} from "react-native-reanimated";
import { CardSuit } from "../types";
import { CARD_WIDTH, CARD_HEIGHT } from "./whotConfig";
import { SkFont } from "@shopify/react-native-skia";

interface ActiveSuitCardProps {
  suit: CardSuit;
  x: number;
  y: number;
  font: SkFont | null;
}

const COLOR_RED = "#A22323";

// --- REUSED SHAPE LOGIC ---
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

const ActiveSuitCard = ({ suit, x, y, font }: ActiveSuitCardProps) => {
  if (!font) return null;

  const textWidth = font.getTextWidth("20");
  const padding = 8;
  const centerX = CARD_WIDTH / 2;
  const centerY = CARD_HEIGHT / 2;

  // Center the card on the coordinates provided
  const left = x - CARD_WIDTH / 2;
  const top = y - CARD_HEIGHT / 2;

  return (
    <Animated.View
      entering={ZoomIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { left, top }]}
    >
      <Canvas style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
        <Group>
          {/* 1. NO Solid White Background - we want to see the card below */}

          {/* 2. Delicate Rounded Outline to define the shape area */}
          <RoundedRect
            x={2}
            y={2}
            width={CARD_WIDTH - 4}
            height={CARD_HEIGHT - 4}
            r={8}
            color={COLOR_RED}
            style="stroke"
            strokeWidth={1}
            opacity={0.3}
          />

          {/* Top Left "20" */}
          <SkText x={padding} y={padding + 10} text="20" font={font} color={COLOR_RED} />
          <ShapeIcon suit={suit} x={padding + textWidth / 2} y={padding + 18} size={8} />

          {/* Center Main Shape - Made larger for visibility */}
          <Group opacity={0.8}>
            <ShapeIcon suit={suit} x={centerX} y={centerY} size={32} />
          </Group>

          {/* Bottom Right "20" (Rotated) */}
          <Group origin={{ x: centerX, y: centerY }} transform={[{ rotate: Math.PI }]}>
            <SkText x={padding} y={padding + 10} text="20" font={font} color={COLOR_RED} />
            <ShapeIcon suit={suit} x={padding + textWidth / 2} y={padding + 18} size={8} />
          </Group>
        </Group>
      </Canvas>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    zIndex: 500, // ✅ Above pile cards (100+) and hand cards (100+)
    // Optional: Add shadow to match your game cards for realism
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

export default ActiveSuitCard;