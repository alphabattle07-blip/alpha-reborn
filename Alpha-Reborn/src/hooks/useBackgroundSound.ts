import { useEffect, useRef } from "react";
import { Audio, AVPlaybackSource } from "expo-av";
import { useSelector } from "react-redux";
import { RootState } from "../store";

/**
 * Plays an array of background music tracks in sequence,
 * cycling back to the first track after the last one finishes.
 * Automatically stops and unloads on unmount.
 */
export function useBackgroundSound(soundFiles: AVPlaybackSource[], gameId?: 'whot' | 'ludo') {
  const soundRef = useRef<Audio.Sound | null>(null);
  const trackIndexRef = useRef(0);
  const isMountedRef = useRef(true);

  // If a gameId is provided, sync volume with Redux. Otherwise default to true.
  const isBgmEnabled = useSelector((state: RootState) =>
    gameId ? state.soundSettings[gameId].bgm : true
  );

  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(isBgmEnabled ? 0.5 : 0).catch(() => { });
    }
  }, [isBgmEnabled]);

  useEffect(() => {
    isMountedRef.current = true;
    trackIndexRef.current = 0;

    async function playTrack(index: number) {
      if (!isMountedRef.current || soundFiles.length === 0) return;

      // Unload previous sound if any
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch (_) {
          // Ignore errors during cleanup
        }
        soundRef.current = null;
      }

      if (!isMountedRef.current) return;

      try {
        const { sound } = await Audio.Sound.createAsync(
          soundFiles[index],
          {
            isLooping: false,
            volume: isBgmEnabled ? 0.5 : 0,
            shouldPlay: true,
          }
        );

        if (!isMountedRef.current) {
          await sound.unloadAsync();
          return;
        }

        soundRef.current = sound;

        // When this track finishes, advance to the next one
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!isMountedRef.current) return;
          if (status.isLoaded && status.didJustFinish) {
            const nextIndex = (trackIndexRef.current + 1) % soundFiles.length;
            trackIndexRef.current = nextIndex;
            playTrack(nextIndex);
          }
        });
      } catch (error) {
        // If loading fails, try the next track after a short delay
        if (isMountedRef.current) {
          const nextIndex = (index + 1) % soundFiles.length;
          trackIndexRef.current = nextIndex;
          setTimeout(() => playTrack(nextIndex), 1000);
        }
      }
    }

    playTrack(0);

    return () => {
      isMountedRef.current = false;
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => { });
        soundRef.current.unloadAsync().catch(() => { });
        soundRef.current = null;
      }
    };
  }, [soundFiles]);
}
