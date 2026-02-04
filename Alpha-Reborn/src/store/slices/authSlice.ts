// src/store/slices/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { signInUser, signUpUser } from '../thunks/authThunks'; // Import signUpUser

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
    // Shared logic for pending and rejected states
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

    // Handle both signInUser and signUpUser thunks
    builder
      .addCase(signInUser.pending, handlePending)
      .addCase(signInUser.fulfilled, handleFulfilled)
      .addCase(signInUser.rejected, handleRejected)
      .addCase(signUpUser.pending, handlePending) // ✅ Add signUpUser cases
      .addCase(signUpUser.fulfilled, handleFulfilled)
      .addCase(signUpUser.rejected, handleRejected);
  },
});

export const { logout, setToken } = authSlice.actions;
export default authSlice.reducer;