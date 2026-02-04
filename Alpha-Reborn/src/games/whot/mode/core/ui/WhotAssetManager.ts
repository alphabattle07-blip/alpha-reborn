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
        pickTwo: require('../../../../../assets/sounds/pick_two.mp3'),
        generalMarket: require('../../../../../assets/sounds/general_market.mp3'),
        holdOn: require('../../../../../assets/sounds/hold_on.mp3'),
        pickThree: require('../../../../../assets/sounds/pick_3.mp3'),
        suspension: require('../../../../../assets/sounds/suspension.mp3'),
        warning: require('../../../../../assets/sounds/warning.mp3'),
        lastCard: require('../../../../../assets/sounds/last_card.mp3'),
        victory: require('../../../../../assets/sounds/victory-chime-366449.mp3'),
        whoosh: require('../../../../../assets/sounds/video-game-whoosh-sound-effect-320172.mp3'),
        hop: require('../../../../../assets/sounds/hop.mp3'),
        capture: require('../../../../../assets/sounds/capture.mp3'),
        checkUp: require('../../../../../assets/sounds/check-up.mp3'),
        defended: require('../../../../../assets/sounds/defended.mp3'),
        request: require('../../../../../assets/sounds/i_request.mp3'),
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
