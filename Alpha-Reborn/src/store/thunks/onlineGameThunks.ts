import { createAsyncThunk } from '@reduxjs/toolkit';
import { gameService } from '../../../src/services/api/gameService';
import {
  setCurrentGame,
  setAvailableGames,
  setLoading,
  setError,
  updateGameState,
  addAvailableGame,
  removeAvailableGame
} from '../slices/onlineGameSlice';

// Create a new online game
export const createOnlineGame = createAsyncThunk(
  'onlineGame/createGame',
  async (gameType: string, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setLoading(true));
      const game = await gameService.createGame(gameType);
      dispatch(setCurrentGame(game));
      return game;
    } catch (error: any) {
      dispatch(setError(error.message));
      return rejectWithValue(error.message);
    } finally {
      dispatch(setLoading(false));
    }
  }
);

// Join an existing game
export const joinOnlineGame = createAsyncThunk(
  'onlineGame/joinGame',
  async (gameId: string, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setLoading(true));
      const game = await gameService.joinGame(gameId);
      dispatch(setCurrentGame(game));
      dispatch(removeAvailableGame(gameId)); // Remove from available games
      return game;
    } catch (error: any) {
      dispatch(setError(error.message));
      return rejectWithValue(error.message);
    } finally {
      dispatch(setLoading(false));
    }
  }
);

// Fetch available games
export const fetchAvailableGames = createAsyncThunk(
  'onlineGame/fetchAvailableGames',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setLoading(true));
      const games = await gameService.getAvailableGames();
      dispatch(setAvailableGames(games));
      return games;
    } catch (error: any) {
      dispatch(setError(error.message));
      return rejectWithValue(error.message);
    } finally {
      dispatch(setLoading(false));
    }
  }
);

// Fetch current game state
export const fetchGameState = createAsyncThunk(
  'onlineGame/fetchGameState',
  async (gameId: string, { dispatch, getState, rejectWithValue }) => {
    try {
      const game = await gameService.getGame(gameId);
      const currentState = (getState() as any).onlineGame?.currentGame;
      
      // Don't overwrite a COMPLETED game with a stale in-flight response
      if (currentState?.status === 'COMPLETED') {
        return currentState;
      }

      // STATE VERSION PROTECTION: Drop stale HTTP polling results that arrive after fresh WebSocket data
      if (currentState && currentState.board && game && game.board) {
        let currentVersion = 0;
        let incomingVersion = 0;
        
        try {
          const cb = typeof currentState.board === 'string' ? JSON.parse(currentState.board) : currentState.board;
          const ib = typeof game.board === 'string' ? JSON.parse(game.board) : game.board;
          currentVersion = cb.stateVersion || 0;
          incomingVersion = ib.stateVersion || 0;
        } catch (e) {
          // JSON parse fail, ignore version check
        }
        
        // If the HTTP fetch returned an older or identical state version than our Redux store via WebSocket, discard it!
        // Discarding identical versions prevents React from undergoing massive full-app re-renders every 15 seconds.
        if (currentVersion >= incomingVersion && currentVersion > 0) {
            console.log(`[Redux] Discarding redundant fetchGameState response. Client version: ${currentVersion}, Server HTTP version: ${incomingVersion}`);
            return currentState;
        }
      }

      dispatch(setCurrentGame(game));
      return game;
    } catch (error: any) {
      dispatch(setError(error.message));
      return rejectWithValue(error.message);
    }
  }
);

// Update game state (board, turn, winner, etc.)
export const updateOnlineGameState = createAsyncThunk(
  'onlineGame/updateGameState',
  async (
    { gameId, updates }: {
      gameId: string;
      updates: {
        board?: any;
        currentTurn?: string;
        winnerId?: string;
        status?: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
      }
    },
    { dispatch, rejectWithValue }
  ) => {
    try {
      const game = await gameService.updateGameState(gameId, updates);
      dispatch(updateGameState(updates));
      return game;
    } catch (error: any) {
      dispatch(setError(error.message));
      return rejectWithValue(error.message);
    }
  }
);
