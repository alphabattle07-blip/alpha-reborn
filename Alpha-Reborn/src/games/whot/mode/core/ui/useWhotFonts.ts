// useWhotFonts.ts
import { useFont } from '@shopify/react-native-skia';
import { useEffect } from 'react';

export const useWhotFonts = () => {
    // Use require once and pass to useFont
    const fontModule = require('../../../../../assets/fonts/SpaceMono-Regular.ttf');
    const font = useFont(fontModule, 12);
    const whotFont = useFont(fontModule, 24);

    const areLoaded = font !== null && whotFont !== null;

    useEffect(() => {
        if (areLoaded) {
            console.log('✅ Skia fonts loaded successfully');
        } else {
            console.warn('⚠️ Skia fonts not loaded yet. Font:', !!font, 'WhotFont:', !!whotFont);
        }
    }, [areLoaded, font, whotFont]);

    return {
        font,
        whotFont,
        areLoaded,
    };
};