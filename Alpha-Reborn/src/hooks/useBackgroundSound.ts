import { useEffect, useRef } from "react";
import { Audio, AVPlaybackSource, Sound } from "expo-av";

export function useBackgroundSound(soundFile: AVPlaybackSource) {
  const soundRef = useRef<Sound | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function playSound() {
      // Load and play the sound
      const { sound } = await Audio.Sound.createAsync(soundFile, {
        isLooping: true,
        volume: 0.5, // Adjust background volume here
      });
      if (isMounted) {
        soundRef.current = sound;
        await sound.playAsync();
      }
    }

    playSound();

    return () => {
      isMounted = false;
      if (soundRef.current) {
        soundRef.current.stopAsync();
        soundRef.current.unloadAsync();
      }
    };
  }, [soundFile]);
}
