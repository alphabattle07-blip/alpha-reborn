import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface OnlineGameState {
  currentGame: {
    id: string;
    gameType: string;
    status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
    player1: {
      id: string;
      name: string;
      rating: number;
      avatar?: string;
    };
    player2: {
      id: string;
      name: string;
      rating: number;
      avatar?: string;
    } | null;
    board: any;
    currentTurn: string;
    winnerId: string | null;
  } | null;
  availableGames: Array<{
    id: string;
    gameType: string;
    player1: {
      id: string;
      name: string;
      rating: number;
    };
    createdAt: string;
  }>;
  isLoading: boolean;
  error: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
}

const initialState: OnlineGameState = {
  currentGame: null,
  availableGames: [],
  isLoading: false,
  error: null,
  connectionStatus: 'disconnected'
};

const onlineGameSlice = createSlice({
  name: 'onlineGame',
  initialState,
  reducers: {
    setConnectionStatus: (state, action: PayloadAction<OnlineGameState['connectionStatus']>) => {
      state.connectionStatus = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setCurrentGame: (state, action: PayloadAction<OnlineGameState['currentGame']>) => {
      state.currentGame = action.payload;
    },
    setAvailableGames: (state, action: PayloadAction<OnlineGameState['availableGames']>) => {
      state.availableGames = action.payload;
    },
    updateGameState: (state, action: PayloadAction<Partial<OnlineGameState['currentGame']>>) => {
      if (state.currentGame) {
        state.currentGame = { ...state.currentGame, ...action.payload };
      }
    },
    addAvailableGame: (state, action: PayloadAction<OnlineGameState['availableGames'][0]>) => {
      state.availableGames.push(action.payload);
    },
    removeAvailableGame: (state, action: PayloadAction<string>) => {
      state.availableGames = state.availableGames.filter(game => game.id !== action.payload);
    },
    clearCurrentGame: (state) => {
      state.currentGame = null;
    }
  }
});

export const {
  setConnectionStatus,
  setLoading,
  setError,
  setCurrentGame,
  setAvailableGames,
  updateGameState,
  addAvailableGame,
  removeAvailableGame,
  clearCurrentGame
} = onlineGameSlice.actions;

export default onlineGameSlice.reducer;
