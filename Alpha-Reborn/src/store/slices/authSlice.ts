// src/store/slices/authSlice.ts
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import * as api from '../../services/api/authService';
import * as SecureStore from 'expo-secure-store';
import { RootState } from '../index';

// Thunks
export const signInUser = createAsyncThunk(
  'auth/signIn',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await api.signIn(email, password);
      await SecureStore.setItemAsync('token', response.token);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const signUpUser = createAsyncThunk(
  'auth/signUp',
  async ({ name, email, password }: { name: string; email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await api.signUp(name, email, password);
      await SecureStore.setItemAsync('token', response.token);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchUserProfile = createAsyncThunk(
  'user/fetchProfile',
  async (userId: string | undefined, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).auth.token;
      if (!token) {
        return rejectWithValue('No token found');
      }
      const profile = await api.getProfile(token, userId);
      return profile;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const loadToken = createAsyncThunk('auth/loadToken', async (_, { dispatch }) => {
  try {
    const token = await SecureStore.getItemAsync('token');

    if (token) {
      // 1. Optimistically set the token
      dispatch(authSlice.actions.setToken(token));

      // 2. Attempt to fetch the user profile to validate the token
      await dispatch(fetchUserProfile(undefined)).unwrap();
    } else {
      // No token found, ensure we are logged out
      dispatch(authSlice.actions.logout());
    }
  } catch (error: any) {
    console.log('Token invalid or expired during load:', error);
    dispatch(logoutUser());
  }
});

export const logoutUser = createAsyncThunk('auth/logout', async (_, { dispatch }) => {
  try {
    await SecureStore.deleteItemAsync('token');
  } catch (error) {
    console.error('Error deleting token:', error);
  } finally {
    dispatch(authSlice.actions.logout());
  }
});

export const updateUserProfileAndGameStatsThunk = createAsyncThunk(
  'user/updateProfileAndGameStats',
  async (
    { gameId, updatedStats }: { gameId: string; updatedStats: { wins: number; losses: number; draws: number; rating: number; overallRating: number } },
    { getState, rejectWithValue }
  ) => {
    try {
      const token = (getState() as RootState).auth.token;
      if (!token) {
        return rejectWithValue('No token found');
      }
      const updatedUser = await api.updateUserProfileAndGameStats(token, gameId, updatedStats);
      return updatedUser;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const updateUserProfileThunk = createAsyncThunk(
  'user/updateProfile',
  async (updateData: Partial<api.UserProfile>, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).auth.token;
      if (!token) {
        return rejectWithValue('No token found');
      }
      const updatedUser = await api.updateProfile(token, updateData);
      return updatedUser;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  token: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.token = null;
      state.isAuthenticated = false;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
      state.isAuthenticated = true;
    },
  },
  extraReducers: (builder) => {
    const handlePending = (state: AuthState) => {
      state.loading = true;
      state.error = null;
    };
    const handleFulfilled = (state: AuthState, action: any) => {
      state.loading = false;
      state.isAuthenticated = true;
      state.token = action.payload.token;
    };
    const handleRejected = (state: AuthState, action: any) => {
      state.loading = false;
      state.error = action.payload as string;
      state.token = null;
      state.isAuthenticated = false;
    };

    builder
      .addCase(signInUser.pending, handlePending)
      .addCase(signInUser.fulfilled, handleFulfilled)
      .addCase(signInUser.rejected, handleRejected)
      .addCase(signUpUser.pending, handlePending)
      .addCase(signUpUser.fulfilled, handleFulfilled)
      .addCase(signUpUser.rejected, handleRejected);
  },
});

export const { logout, setToken } = authSlice.actions;
export default authSlice.reducer;