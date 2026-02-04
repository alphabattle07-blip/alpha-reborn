import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GameStats } from '../../navigation/types';
import { fetchGameStatsThunk, updateGameStatsThunk, fetchAllGameStatsThunk } from '../thunks/gameStatsThunks';

interface GameStatsState {
  gameStats: Record<string, GameStats>; // Changed to support multiple games dynamically
  loading: boolean;
  error: string | null;
}

const initialState: GameStatsState = {
  gameStats: {}, // Initialize as empty object
  loading: false,
  error: null,
};

const gameStatsSlice = createSlice({
  name: 'gameStats',
  initialState,
  reducers: {
    clearGameStats: (state) => {
      state.gameStats = {};
      state.error = null;
    },
    setGameStats: (state, action: PayloadAction<GameStats>) => {
      // Set stats for a specific gameId
      state.gameStats[action.payload.gameId] = action.payload;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch game stats
      .addCase(fetchGameStatsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGameStatsThunk.fulfilled, (state, action) => {
        state.loading = false;
        // Store stats by gameId for dynamic access
        state.gameStats[action.payload.gameId] = action.payload;
      })
      .addCase(fetchGameStatsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Update game stats
      .addCase(updateGameStatsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateGameStatsThunk.fulfilled, (state, action) => {
        state.loading = false;
        // Update stats for the specific gameId
        state.gameStats[action.payload.gameId] = action.payload;
      })
      .addCase(updateGameStatsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Fetch all game stats
      .addCase(fetchAllGameStatsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAllGameStatsThunk.fulfilled, (state, action) => {
        state.loading = false;
        // Populate the map with all game stats
        action.payload.allGameStats.forEach(stats => {
          state.gameStats[stats.gameId] = stats;
        });
      })
      .addCase(fetchAllGameStatsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearGameStats, setGameStats } = gameStatsSlice.actions;
export default gameStatsSlice.reducer;
