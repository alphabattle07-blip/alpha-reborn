import type { SkFont } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";
import { Card } from "../types"; // Import the base Card type

// This is the Skia/Reanimated version of a Card
export interface AnimatedCard extends Card {
  x: SharedValue<number>;
  y: SharedValue<number>;
  rotate: SharedValue<number>; // 0 to Math.PI (for flip)
  width: number;
  height: number;
  initialIndex: number; // Not used in whotCard.ts, but good to have
}

