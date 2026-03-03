import { useEffect, useRef } from "react";
import { Audio } from "expo-av";
import { GameState } from "./types";
import { WhotAssetManager } from "./ui/WhotAssetManager";
import { store } from "../../../../store";

/**
 * Maps card numbers to their corresponding sound keys in WhotAssetManager.
 */
const CARD_SOUND_MAP: Record<number, keyof typeof WhotAssetManager.sounds> = {
    1: "holdOn",
    2: "pickTwo",
    5: "pickThree",
    8: "suspension",
    14: "generalMarket",
    20: "request",
};

/** Maps suit names to their sound keys. */
const SUIT_SOUND_MAP: Record<string, keyof typeof WhotAssetManager.sounds> = {
    circle: "circle",
    square: "square",
    triangle: "triangle",
    star: "star",
    cross: "cross",
};

/** Snapshot of previous state used for diff detection. */
interface StateSnapshot {
    topPileCardId: string | null;
    topPileCardNumber: number | null;
    pileSize: number;
    pendingActionType: string | null;
    pendingDefendPlayer: number | null;
    calledSuit: string | null;
    ruleVersion: string | null;
    handSizes: number[];
}

function takeSnapshot(state: GameState | null): StateSnapshot {
    if (!state) {
        return {
            topPileCardId: null,
            topPileCardNumber: null,
            pileSize: 0,
            pendingActionType: null,
            pendingDefendPlayer: null,
            calledSuit: null,
            ruleVersion: null,
            handSizes: [],
        };
    }
    const topCard = state.pile.length > 0 ? state.pile[state.pile.length - 1] : null;
    return {
        topPileCardId: topCard?.id ?? null,
        topPileCardNumber: topCard?.number ?? null,
        pileSize: state.pile.length,
        pendingActionType: state.pendingAction?.type ?? null,
        pendingDefendPlayer:
            state.pendingAction?.type === "defend"
                ? state.pendingAction.playerIndex
                : null,
        calledSuit: state.calledSuit ?? null,
        ruleVersion: state.ruleVersion ?? null,
        handSizes: state.players.map((p) => p.hand.length),
    };
}

let audioModeConfigured = false;

/**
 * Fire-and-forget: load, play, then unload a sound from WhotAssetManager.
 */
async function playSound(soundKey: keyof typeof WhotAssetManager.sounds) {
    try {
        const soundSettings = store.getState().soundSettings.whot;
        const isSfx = soundKey === "cardAction";
        const isVoice = !isSfx;

        if (isVoice && !soundSettings.voice) return;
        if (isSfx && !soundSettings.sfx) return;

        // Configure audio mode once (allows playback in silent mode)
        if (!audioModeConfigured) {
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
            });
            audioModeConfigured = true;
        }

        const source = WhotAssetManager.sounds[soundKey];
        if (!source) return;
        const { sound } = await Audio.Sound.createAsync(source, {
            shouldPlay: true,
            volume: 1.0,
        });
        sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
                sound.unloadAsync().catch(() => { });
            }
        });
    } catch (error) {
        console.warn(`🔊 [WhotSFX] Failed to play sound "${soundKey}":`, error);
    }
}

/**
 * Reactive hook that watches GameState changes and plays the
 * appropriate Whot sound effects.
 *
 * Place this in any component that owns a GameState.
 */
export function useWhotSoundEffects(gameState: GameState | null) {
    const prevRef = useRef<StateSnapshot>(takeSnapshot(null));
    // Skip the very first state (initial deal) to avoid firing sounds on mount
    const isFirstUpdate = useRef(true);

    useEffect(() => {
        if (!gameState) return;

        const prev = prevRef.current;
        const curr = takeSnapshot(gameState);

        // Always update the ref BEFORE any early returns
        prevRef.current = curr;

        // Skip the initial mount / first state hydration
        if (isFirstUpdate.current) {
            isFirstUpdate.current = false;
            return;
        }

        // Debug: log state diffs
        console.log('🔊 [WhotSFX] State diff:', {
            pileChanged: curr.topPileCardId !== prev.topPileCardId,
            newTopCard: curr.topPileCardId,
            prevPending: prev.pendingActionType,
            currPending: curr.pendingActionType,
            prevSuit: prev.calledSuit,
            currSuit: curr.calledSuit,
            prevHands: prev.handSizes,
            currHands: curr.handSizes,
        });

        // --- 1. Card Played / Placed on Pile ---
        if (curr.topPileCardId && curr.topPileCardId !== prev.topPileCardId) {
            // Card action sound for every card placed on the pile
            playSound("cardAction");

            const topCard = gameState.pile[gameState.pile.length - 1];
            if (topCard) {
                const isRuleTwo = curr.ruleVersion === "rule2";
                const wasDefending = prev.pendingActionType === "defend";
                const defenseCleared = curr.pendingActionType !== "defend";
                const wasContinuing = prev.pendingActionType === "continue";
                // In Rule Two, cards 5 (Pick 3) and 8 (Suspension) are normal — no special sounds
                const isSpecialInCurrentRule = isRuleTwo
                    ? (topCard.number === 1 || topCard.number === 2 || topCard.number === 14 || topCard.number === 20)
                    : !!CARD_SOUND_MAP[topCard.number];

                if (!isRuleTwo && wasDefending && defenseCleared && (topCard.number === 2 || topCard.number === 5)) {
                    // Rule 1 only: defense resolved
                    playSound("defended");
                } else if (wasContinuing) {
                    // A card was played during a "continue" action (after a special card).
                    if (isSpecialInCurrentRule) {
                        // Special card follows special card → play ITS own sound
                        const soundKey = CARD_SOUND_MAP[topCard.number];
                        if (soundKey) playSound(soundKey);
                    } else {
                        // Normal card after special card → play "continue"
                        playSound("continue");
                    }
                } else if (isSpecialInCurrentRule) {
                    // Normal special card play (not during continue)
                    const soundKey = CARD_SOUND_MAP[topCard.number];
                    if (soundKey) {
                        playSound(soundKey);
                    }
                }
                // else: normal card with no special sound — no voicing plays
            }
        }

        // --- 1b. Card Drawn from Market ---
        // Detect when any player's hand increases (card drawn/dealt)
        for (let i = 0; i < curr.handSizes.length; i++) {
            const prevSize = prev.handSizes[i] ?? 0;
            const currSize = curr.handSizes[i] ?? 0;
            if (currSize > prevSize) {
                playSound("cardAction");
                break; // One sound per state change is enough
            }
        }

        // --- 2. Suit Selection Detection ---
        if (curr.calledSuit && curr.calledSuit !== prev.calledSuit) {
            const suitSoundKey = SUIT_SOUND_MAP[curr.calledSuit];
            if (suitSoundKey) {
                playSound(suitSoundKey);
            }
        }

        // --- 3. Hand Size Alerts ---
        for (let i = 0; i < curr.handSizes.length; i++) {
            const prevSize = prev.handSizes[i] ?? 0;
            const currSize = curr.handSizes[i] ?? 0;

            // Player played final card → game won
            if (currSize === 0 && prevSize > 0) {
                playSound("checkUp");
            }
            // Only fire when transitioning DOWN to exactly 2 or 1
            else if (currSize === 2 && prevSize > 2) {
                playSound("warning");
            } else if (currSize === 1 && prevSize > 1) {
                playSound("lastCard");
            }
        }
    }, [gameState]);
}
