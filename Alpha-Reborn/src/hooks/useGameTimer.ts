import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseGameTimerReturn {
  player1Time: number;      // remaining time for player 1 in seconds
  player2Time: number;      // remaining time for player 2 in seconds
  isTimerRunning: boolean;  // is timer currently active
  startTimer: () => void;   // start/resume timer
  pauseTimer: () => void;   // pause timer
  resetTimer: () => void;   // reset to initial time
  formatTime: (seconds: number) => string; // MM:SS format
  setLastActivePlayer: (player: 1 | 2) => void; // set active player
}

export const useGameTimer = (initialTime: number = 300): UseGameTimerReturn => {
  const [player1Time, setPlayer1Time] = useState<number>(initialTime);
  const [player2Time, setPlayer2Time] = useState<number>(initialTime);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [lastActivePlayer, setLastActivePlayer] = useState<1 | 2>(1);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isTimerRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    lastUpdateTimeRef.current = Date.now();
    
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - lastUpdateTimeRef.current) / 1000;
      lastUpdateTimeRef.current = now;

      if (lastActivePlayer === 1) {
        setPlayer1Time(prevTime => Math.max(0, prevTime - deltaTime));
      } else {
        setPlayer2Time(prevTime => Math.max(0, prevTime - deltaTime));
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTimerRunning, lastActivePlayer]);

  const startTimer = useCallback(() => {
    if (!isTimerRunning) {
      setIsTimerRunning(true);
    }
  }, [isTimerRunning]);

  const pauseTimer = useCallback(() => {
    if (isTimerRunning) {
      setIsTimerRunning(false);
    }
  }, [isTimerRunning]);

  const resetTimer = useCallback(() => {
    setIsTimerRunning(false);
    setPlayer1Time(initialTime);
    setPlayer2Time(initialTime);
    setLastActivePlayer(1);
  }, [initialTime]);

  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const stableSetLastActivePlayer = useCallback((player: 1 | 2) => {
    setLastActivePlayer(player);
  }, []);

  return {
    player1Time,
    player2Time,
    isTimerRunning,
    startTimer,
    pauseTimer,
    resetTimer,
    formatTime,
    setLastActivePlayer: stableSetLastActivePlayer,
  };
};