// WhotCardBack.tsx
import React from 'react';
import { RoundedRect, Text, Group, type SkFont } from '@shopify/react-native-skia';

export interface WhotCardBackProps {
    width?: number;
    height?: number;
    // ✅ Accept fonts as props
    font: SkFont | null;
    smallFont: SkFont | null;
}

export const WhotCardBack = ({ width = 100, height = 150, font, smallFont }: WhotCardBackProps) => {
    // ❌ We no longer load fonts here

    if (!font || !smallFont) {
        // This check is still good as a safeguard
        console.error("WhotCardBack received null fonts!");
        return null;
    }

    const cornerRadius = 8;
    const textColor = '#FDFBF6';
    const backgroundColor = '#A22323';

    const mainWhotText = 'WHOT';
    const mainWhotTextWidth = font.getTextWidth(mainWhotText);
    const mainWhotX = (width - mainWhotTextWidth) / 2;
    const mainWhotY = (height / 2) + (font.getSize() / 2);

    const smallWhotText = 'Whot';
    const smallWhotTextWidth = smallFont.getTextWidth(smallWhotText);

    return (
        <Group>
            {/* Card Background */}
            <RoundedRect x={0} y={0} width={width} height={height} r={cornerRadius} color={backgroundColor} />

            {/* Card Border */}
            <RoundedRect
                x={1}
                y={1}
                width={width - 2}
                height={height - 2}
                r={cornerRadius}
                color="#FDFBF6"
                style="stroke"
                strokeWidth={1.5}
            />

            {/* Main "WHOT" text */}
            <Text x={mainWhotX} y={mainWhotY} text={mainWhotText} font={font} color={textColor} />

            {/* Top-left rotated text */}
            <Group
                origin={{ x: width * 0.25, y: height * 0.25 }}
                transform={[{ rotate: -Math.PI / 4 }]}
            >
                <Text
                    x={width * 0.25 - smallWhotTextWidth / 2}
                    y={height * 0.25 + smallFont.getSize() / 2}
                    text={smallWhotText}
                    font={smallFont}
                    color={textColor}
                />
            </Group>
            <Group
                origin={{ x: width * 0.75, y: height * 0.75 }}
                transform={[{ rotate: (3 * Math.PI) / 4 }]}
            >
                <Text
                    x={width * 0.75 - smallWhotTextWidth / 2}
                    y={height * 0.75 + smallFont.getSize() / 2}
                    text={smallWhotText}
                    font={smallFont}
                    color={textColor}
                />
            </Group>
        </Group>
    );
};
