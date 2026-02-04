// core/ui/MemoizedBackground.tsx
import React, { memo } from "react";
import { StyleSheet } from "react-native";
import { Canvas, Rect } from "@shopify/react-native-skia";

interface Props {
  width: number;
  height: number;
}

const MemoizedBackground = memo(({ width, height }: Props) => {
  console.log("LOG: 🏞️ MemoizedBackground re-rendered (should only be on rotate)");
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={height} color="#1E5E4E" />
    </Canvas>
  );
});

export default MemoizedBackground;