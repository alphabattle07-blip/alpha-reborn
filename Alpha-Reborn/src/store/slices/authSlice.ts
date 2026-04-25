// src/store/slices/authSlice.ts
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import * as api from '../../services/api/authService';
import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
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

// Get or generate a stable device ID
const getDeviceId = async () => {
  try {
    if (Platform.OS === 'android') {
      return Application.androidId || 'unknown_android';
    } else if (Platform.OS === 'ios') {
      const id = await Application.getIosIdForVendorAsync();
      return id || 'unknown_ios';
    }
  } catch (e) {
    console.warn('Could not get device ID', e);
  }
  return 'unknown_device';
};

export const autoGuestLogin = createAsyncThunk(
  'auth/autoGuest',
  async (_, { rejectWithValue, dispatch }) => {
    try {
      // 1. Recover existing guestId or create new
      let guestId = await SecureStore.getItemAsync('guestId');
      if (!guestId) {
        guestId = `guest_${Math.random().toString(36).substring(2, 8)}`;
      }

      const deviceId = await getDeviceId();
      const response = await api.guestLogin(guestId, deviceId);
      
      await SecureStore.setItemAsync('token', response.token);
      await SecureStore.setItemAsync('guestId', guestId);
      
      // Dispatch setGuest action directly (we'll add this reducer below)
      dispatch(authSlice.actions.setGuest(true));
      
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const upgradeAccountThunk = createAsyncThunk(
  'auth/upgrade',
  async (data: { email: string; password?: string; name?: string; provider?: string }, { getState, rejectWithValue, dispatch }) => {
    const token = (getState() as RootState).auth.token;
    if (!token) return rejectWithValue('No token found');
    try {
      const response = await api.upgradeAccount(token, data);
      await SecureStore.setItemAsync('token', response.token);
      await SecureStore.deleteItemAsync('guestId');
      dispatch(authSlice.actions.setGuest(false));
      return response;
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
      try {
        const profileResponse = await dispatch(fetchUserProfile(undefined)).unwrap();
        // Check if user is a guest based on their profile data
        const isGuest = profileResponse.accountType === 'guest';
        dispatch(authSlice.actions.setGuest(isGuest));
        
      } catch (profileError) {
        // Token invalid/expired - fallback to auto-guest if we had a guestId
        console.log('Profile fetch failed with token, falling back to guest auto-login');
        await dispatch(autoGuestLogin());
      }
    } else {
      // No token found -> FIRST LAUNCH -> Auto create guest
      await dispatch(autoGuestLogin());
    }
  } catch (error: any) {
    console.log('Token invalid or expired during load:', error);
    await dispatch(autoGuestLogin()); // Fallback to guest instead of full logout
  }
});

export const logoutUser = createAsyncThunk('auth/logout', async (_, { dispatch }) => {
  try {
    await SecureStore.deleteItemAsync('token');
    // NOTE: We do NOT delete guestId here, so if they uninstall/reinstall or log out, 
    // they can recover their guest account next time.
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
  isGuest: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  token: null,
  isAuthenticated: false,
  isGuest: false,
  loading: false,
  error: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.token = null;
      state.isAuthenticated = false;
      state.isGuest = false;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
      state.isAuthenticated = true;
    },
    setGuest: (state, action: PayloadAction<boolean>) => {
      state.isGuest = action.payload;
    }
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
      // If the response explicitly contains an accountType, we can sync it
      if (action.payload?.user?.accountType) {
        state.isGuest = action.payload.user.accountType === 'guest';
      }
    };
    const handleRejected = (state: AuthState, action: any) => {
      state.loading = false;
      state.error = action.payload as string;
      // We don't necessarily clear auth state on rejected promises here, 
      // let logout/loadToken thunks handle token clearing.
    };

    builder
      .addCase(signInUser.pending, handlePending)
      .addCase(signInUser.fulfilled, handleFulfilled)
      .addCase(signInUser.rejected, handleRejected)
      .addCase(signUpUser.pending, handlePending)
      .addCase(signUpUser.fulfilled, handleFulfilled)
      .addCase(signUpUser.rejected, handleRejected)
      .addCase(autoGuestLogin.pending, handlePending)
      .addCase(autoGuestLogin.fulfilled, handleFulfilled)
      .addCase(autoGuestLogin.rejected, handleRejected)
      .addCase(upgradeAccountThunk.pending, handlePending)
      .addCase(upgradeAccountThunk.fulfilled, handleFulfilled)
      .addCase(upgradeAccountThunk.rejected, handleRejected);
  },
});

export const { logout, setToken, setGuest } = authSlice.actions;
export default authSlice.reducer;