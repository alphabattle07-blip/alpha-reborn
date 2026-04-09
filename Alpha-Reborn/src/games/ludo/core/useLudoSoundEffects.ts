import { useEffect, useRef } from "react";
import { Audio } from "expo-av";
import { LudoGameState, LudoSeed } from "./ui/LudoGameLogic";
import { LudoAssetManager } from "./ui/LudoAssetManager";
import { store } from "../../../store";
import { useSelector } from "react-redux";
import { RootState } from "../../../store";

interface StateSnapshot {
    seedPositions: Record<string, number>; // Maps seed ID to its position
    winHomeCount: number; // Used to detect when a seed reaches FINISH_POS
    diceStr: string; // Used to detect dice rolls
}

function takeSnapshot(state: LudoGameState | null): StateSnapshot {
    if (!state) {
        return { seedPositions: {}, winHomeCount: 0, diceStr: "" };
    }

    const seedPositions: Record<string, number> = {};
    let winHomeCount = 0;

    state.players.forEach((player) => {
        player.seeds.forEach((seed) => {
            seedPositions[seed.id] = seed.position;
            if (seed.position === 56) {
                winHomeCount++;
            }
        });
    });

    return {
        seedPositions,
        winHomeCount,
        diceStr: state.dice.join(",")
    };
}

// --- Global Audio Player ---
let audioModeConfigured = false;
const soundCache: Partial<Record<keyof typeof LudoAssetManager.sounds, Audio.Sound>> = {};

export async function playLudoSound(soundKey: keyof typeof LudoAssetManager.sounds) {
    try {
        // Enforce Sound Control Settings (fallback to true for old persisted state)
        const soundSettings = store.getState().soundSettings.ludo || {};
        if (soundSettings.sfx === false) return;

        if (!audioModeConfigured) {
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
            });
            audioModeConfigured = true;
        }

        const source = LudoAssetManager.sounds[soundKey];
        if (!source) return;

        // Reuse cached sound instance if it exists
        if (soundCache[soundKey]) {
            const cachedSound = soundCache[soundKey];
            const status = await cachedSound?.getStatusAsync();
            if (status && status.isLoaded) {
                await cachedSound?.setPositionAsync(0);
                await cachedSound?.playAsync();
            }
            return;
        }

        // Create new sound instance and cache it
        const { sound } = await Audio.Sound.createAsync(source, {
            shouldPlay: true,
            volume: 1.0,
        });

        soundCache[soundKey] = sound;

    } catch (error) {
        console.warn(`🔊 [LudoSFX] Failed to play sound "${soundKey}":`, error);
    }
}

/**
 * Reactive hook that plays Ludo sound effects by watching GameState changes.
 */
export function useLudoSoundEffects(gameState: LudoGameState | null) {
    // Fallback to true if undefined due to older persisted state without bgm key
    const bgmSetting = useSelector((state: RootState) => state.soundSettings.ludo?.bgm ?? true);
    const bgmSoundRef = useRef<Audio.Sound | null>(null);
    const prevRef = useRef<StateSnapshot>(takeSnapshot(null));
    const isFirstUpdate = useRef(true);

    // --- Background Music (BGM) Lifecycle ---
    useEffect(() => {
        let isCancelled = false;

        async function manageBGM() {
            try {
                if (bgmSetting) {
                    if (bgmSoundRef.current) {
                        const status = await bgmSoundRef.current.getStatusAsync();
                        if (status.isLoaded && !status.isPlaying) {
                            await bgmSoundRef.current.playAsync();
                        }
                    } else {
                        const source = LudoAssetManager.sounds.bgm;
                        if (!source) return;

                        const { sound } = await Audio.Sound.createAsync(
                            source,
                            { shouldPlay: true, isLooping: true, volume: 0.5 }
                        );
                        
                        if (isCancelled) {
                            await sound.unloadAsync();
                            return;
                        }
                        bgmSoundRef.current = sound;
                    }
                } else {
                    if (bgmSoundRef.current) {
                        await bgmSoundRef.current.stopAsync();
                        await bgmSoundRef.current.unloadAsync();
                        bgmSoundRef.current = null;
                    }
                }
            } catch (error) {
                console.warn("🔊 [LudoBGM] Error managing background music:", error);
            }
        }

        manageBGM();

        return () => {
            isCancelled = true;
        };
    }, [bgmSetting]);

    // Cleanup BGM on unmount
    useEffect(() => {
        return () => {
            if (bgmSoundRef.current) {
                bgmSoundRef.current.unloadAsync();
                bgmSoundRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!gameState) return;

        const prev = prevRef.current;
        const curr = takeSnapshot(gameState);
        prevRef.current = curr;

        if (isFirstUpdate.current) {
            isFirstUpdate.current = false;
            return;
        }

        let captureTriggered = false;
        let lossTriggered = false;
        let seedMoved = false;

        // Compare individual seed positions
        for (const seedId in curr.seedPositions) {
            const currentPos = curr.seedPositions[seedId];
            const previousPos = prev.seedPositions[seedId];

            if (previousPos !== undefined && currentPos !== previousPos) {
                // Seed was sent back to house (-1) from the track
                if (currentPos === -1 && previousPos >= 0) {
                    lossTriggered = true;
                }

                // Normal Seed Move logic (removed from generic hook to sync with animation)
            }
        }

        // --- 1. Detect Dice Roll ---
        if (curr.diceStr !== prev.diceStr && curr.diceStr !== "") {
            playLudoSound("diceRolling");
        }

        // --- 2. Win Home ---
        // If at least one seed went home
        if (curr.winHomeCount > prev.winHomeCount) {
            // Only play win home to avoid overpowering
            playLudoSound("winHome");
            return; // Skip other sounds
        }

        // --- 3. Capture & Loss ---
        // Play loss when someone goes back to -1
        if (lossTriggered) {
            playLudoSound("losing");
            // The capture happens at the same time logically, but the capturing seed also moved
            // In Ludo logic, if a seed goes to -1, it means a capture happened
            playLudoSound("capture");
            return; // Prioritize capture sounds
        }

        // Standard seed movement sounds are now handled in LudoSkiaBoard step-by-step
    }, [gameState]);
}
