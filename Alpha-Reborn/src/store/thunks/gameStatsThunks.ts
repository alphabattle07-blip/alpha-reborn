import { createAsyncThunk } from '@reduxjs/toolkit';
import * as api from '../../../src/services/api/authService';
import { RootState } from '../index';

// Fetch game statistics for a specific game
export const fetchGameStatsThunk = createAsyncThunk(
  'gameStats/fetchGameStats',
  async ({ gameId }: { gameId: string }, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).auth.token;
      if (!token) {
        return rejectWithValue('No authentication token found');
      }
      const gameStats = await api.fetchGameStats(token, gameId);
      return gameStats;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

// Update game statistics after a game
export const updateGameStatsThunk = createAsyncThunk(
  'gameStats/updateGameStats',
  async (
    { gameId, result, newRating }: {
      gameId: string;
      result: 'win' | 'loss' | 'draw';
      newRating: number;
    },
    { getState, rejectWithValue }
  ) => {
    try {
      const token = (getState() as RootState).auth.token;
      if (!token) {
        return rejectWithValue('No authentication token found');
      }

      // Get current stats first
      const currentStats = await api.fetchGameStats(token, gameId);

      // Calculate updated stats based on result
      const updatedStats = {
        wins: result === 'win' ? currentStats.wins + 1 : currentStats.wins,
        losses: result === 'loss' ? currentStats.losses + 1 : currentStats.losses,
        draws: result === 'draw' ? currentStats.draws + 1 : currentStats.draws,
        rating: newRating,
      };

      const updatedGameStats = await api.updateGameStats(token, gameId, updatedStats);
      return updatedGameStats;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

// Fetch all game statistics
export const fetchAllGameStatsThunk = createAsyncThunk(
  'gameStats/fetchAllGameStats',
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).auth.token;
      if (!token) {
        return rejectWithValue('No authentication token found');
      }
      const allGameStats = await api.fetchAllGameStats(token);
      return allGameStats;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);
