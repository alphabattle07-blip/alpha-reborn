// src/store/hooks/usePlayerProfile.ts (or your file path)

import { useMemo, useCallback, useEffect } from 'react'; // Added useCallback and useEffect
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { fetchGameStatsThunk, updateGameStatsThunk } from '../store/thunks/gameStatsThunks';
import { setGameStats } from '../store/slices/gameStatsSlice';
import { storage } from '../utils/storage';

// Define the types for game IDs for better type safety
export type GameID = 'ayo' | 'whot' | 'ludo';

// CHANGED: The hook now accepts an optional gameId for general profile usage
export const usePlayerProfile = (gameId?: GameID) => {
  const dispatch = useAppDispatch();
  const { profile, loading } = useAppSelector((state) => state.user);

  // Access the gameStats map from the store
  const { gameStats, loading: statsLoading, error: statsError } = useAppSelector((state) => state.gameStats);
  // Get stats for the specific gameId if provided
  const stats = gameId ? gameStats[gameId] || null : null;

  const playerProfile = useMemo(() => {
    // If gameId is provided, use game-specific stats, otherwise use general profile
    const gameStatsData = gameId ? (stats || profile?.gameStats?.find(
      (stat: any) => stat.gameId === gameId
    )) : null;

    return {
      name: profile?.name ?? 'Player',
      country: profile?.country ?? 'CA',
      avatar: profile?.avatar ?? null,
      // Use game-specific rating if gameId provided, otherwise general rating
      rating: gameStatsData ? gameStatsData.rating : (profile?.rating ?? 100),
      wins: gameStatsData?.wins ?? 0,
      losses: gameStatsData?.losses ?? 0,
      draws: gameStatsData?.draws ?? 0,
      isAI: false,
      isLoading: loading || statsLoading,
      error: statsError,
    };
  }, [profile, stats, loading, statsLoading, statsError, gameId]); // Added gameId to dependency array

  // Automatically fetch game stats when gameId is provided and stats are not loaded
  useEffect(() => {
    if (gameId && profile && (!stats || stats.gameId !== gameId) && !statsLoading) {
      dispatch(fetchGameStatsThunk({ gameId }));
    }
  }, [gameId, profile, stats, statsLoading, dispatch]);

  // We wrap these functions in useCallback to prevent unnecessary re-renders in components
  const loadGameStats = useCallback(async () => {
    // Only load if gameId is provided and we don't already have the stats
    if (gameId && profile && (!stats || stats.gameId !== gameId) && !statsLoading) {
      try {
        // CHANGED: Removed local storage loading to rely on Redux for live backend data
        // Fetch stats directly from backend via Redux
        dispatch(fetchGameStatsThunk({ gameId }));
      } catch (error) {
        console.error(`Error loading ${gameId} game stats:`, error);
      }
    }
  }, [profile, stats, statsLoading, dispatch, gameId]);

  const updateGameStats = useCallback(async (result: 'win' | 'loss' | 'draw', newRating: number) => {
    if (profile && gameId) {
      try {
        // CHANGED: Update stats for the specific game
        dispatch(updateGameStatsThunk({ gameId, result, newRating }));
        // ... (Offline logic remains the same, but now uses the dynamic gameId)
      } catch (error) {
        console.error(`Error updating ${gameId} stats:`, error);
      }
    }
  }, [profile, dispatch, gameId]);

  // Sync logic can remain largely the same as it reads the gameId from the queue
  const syncOfflineOperations = useCallback(async () => {
    // ... no changes needed here if queue items have gameId ...
  }, [dispatch]);

  return {
    ...playerProfile,
    loadGameStats,
    updateGameStats,
    syncOfflineOperations
  };
};
