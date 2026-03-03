import { Asset } from "expo-asset";
import { Audio } from "expo-av";

/**
 * LudoAssetManager
 * Centralizes preloading for Ludo sound assets.
 */
export const LudoAssetManager = {
    sounds: {
        losing: require("../../../../assets/sounds/ludosoundeffect/losing.wav"),
        capture: require("../../../../assets/sounds/ludosoundeffect/capture.mp3"),
        winHome: require("../../../../assets/sounds/ludosoundeffect/winhome.wav"),
        seedMove: require("../../../../assets/sounds/ludosoundeffect/seedmove.wav"),
        diceRolling: require("../../../../assets/sounds/ludosoundeffect/dicerolling.mp3"),
    },

    async preload(): Promise<boolean> {
        try {
            console.log("🚀 LudoAssetManager: Starting asset preload...");
            const promises: Promise<any>[] = [];

            const soundAssets = Object.entries(this.sounds);
            soundAssets.forEach(([name, module]) => {
                const p = Asset.fromModule(module)
                    .downloadAsync()
                    .then(() => console.log(`🎵 Cached Ludo sound: ${name}`))
                    .catch((err) => console.warn(`⚠️ Failed to cache Ludo sound ${name}:`, err));
                promises.push(p);
            });

            await Promise.allSettled(promises);
            console.log("✅ LudoAssetManager: Preloading phase complete.");
            return true;
        } catch (error) {
            console.warn("❌ LudoAssetManager: CRITICAL preloading error:", error);
            return false;
        }
    },
};
