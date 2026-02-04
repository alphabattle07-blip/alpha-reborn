// src/hooks/useSound.ts
import { Audio } from "expo-av";
import { useRef } from "react";

export const useSound = (soundFile: any) => {
  const soundRef = useRef<Audio.Sound | null>(null);

  const play = async () => {
    if (soundRef.current) {
      await soundRef.current.replayAsync(); // quick re-use
      return;
    }
    const { sound } = await Audio.Sound.createAsync(soundFile, {
      shouldPlay: true,
    });
    soundRef.current = sound;
  };

  const unload = async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  };

  return { play, unload };
};
