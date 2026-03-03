import { Image } from 'react-native';
import { Asset } from 'expo-asset';
import { Audio } from 'expo-av';

/**
 * WhotAssetManager
 * Centralizes preloading for fonts, sounds, and avatars to ensure
 * zero disk/network I/O during active gameplay.
 */
export const WhotAssetManager = {
    // 1. Audio Assets
    sounds: {
        pickTwo: require('../../../../../assets/sounds/whot sound effect/whotVoicing/pick_two.mp3'),
        generalMarket: require('../../../../../assets/sounds/whot sound effect/whotVoicing/general_market.mp3'),
        holdOn: require('../../../../../assets/sounds/whot sound effect/whotVoicing/hold_on.mp3'),
        pickThree: require('../../../../../assets/sounds/whot sound effect/whotVoicing/pick_3.mp3'),
        suspension: require('../../../../../assets/sounds/whot sound effect/whotVoicing/suspension.mp3'),
        warning: require('../../../../../assets/sounds/whot sound effect/whotVoicing/warning.mp3'),
        lastCard: require('../../../../../assets/sounds/whot sound effect/whotVoicing/last_card.mp3'),
        checkUp: require('../../../../../assets/sounds/whot sound effect/whotVoicing/check-up.mp3'),
        defended: require('../../../../../assets/sounds/whot sound effect/whotVoicing/defended.mp3'),
        request: require('../../../../../assets/sounds/whot sound effect/whotVoicing/i_request.mp3'),
        continue: require('../../../../../assets/sounds/whot sound effect/whotVoicing/continue.mp3'),
        circle: require('../../../../../assets/sounds/whot sound effect/whotVoicing/circle.mp3'),
        square: require('../../../../../assets/sounds/whot sound effect/whotVoicing/square.mp3'),
        triangle: require('../../../../../assets/sounds/whot sound effect/whotVoicing/triangle.mp3'),
        star: require('../../../../../assets/sounds/whot sound effect/whotVoicing/star.mp3'),
        cross: require('../../../../../assets/sounds/whot sound effect/whotVoicing/cross.mp3'),
    },

    // 2. Preload Everything
    async preload(avatars: string[] = []): Promise<boolean> {
        try {
            console.log('🚀 WhotAssetManager: Starting asset preload...');

            const promises: Promise<any>[] = [];

            // A. Prefetch network images (Avatars)
            avatars.forEach(url => {
                if (url && url.startsWith('http')) {
                    console.log(`🖼️  Prefetching avatar: ${url}`);
                    promises.push(Image.prefetch(url));
                }
            });

            // B. Load Audio Assets into cache
            const soundAssets = Object.entries(this.sounds);
            soundAssets.forEach(([name, module]) => {
                const p = Asset.fromModule(module).downloadAsync()
                    .then(() => console.log(`🎵 Cached sound: ${name}`))
                    .catch(err => console.warn(`⚠️ Failed to cache sound ${name}:`, err));
                promises.push(p);
            });

            // Wait for all preloading to complete
            await Promise.allSettled(promises);

            console.log('✅ WhotAssetManager: Preloading phase complete.');
            return true;
        } catch (error) {
            console.warn('❌ WhotAssetManager: CRITICAL preloading error:', error);
            return false;
        }
    }
};
