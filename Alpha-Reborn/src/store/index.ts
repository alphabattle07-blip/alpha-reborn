// src/store/index.ts
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

import userReducer from './slices/userSlice';
import authReducer from './slices/authSlice';
import gameStatsReducer from './slices/gameStatsSlice';
import onlineGameReducer from './slices/onlineGameSlice';
import soundSettingsReducer from './slices/soundSettingsSlice';
import chatReducer from './slices/chatSlice';

const appReducer = combineReducers({
  user: userReducer,
  auth: authReducer,
  gameStats: gameStatsReducer,
  onlineGame: onlineGameReducer,
  soundSettings: soundSettingsReducer,
  chat: chatReducer,
});

const rootReducer = (state: ReturnType<typeof appReducer> | undefined, action: any) => {
  if (action.type === 'auth/logout') {
    // Preserve only soundSettings
    const { soundSettings } = state || {};
    state = { soundSettings } as any; // Cast as any because we are setting other slices to undefined to cause them to reset
  }
  return appReducer(state, action);
};

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  // IMPORTANT: Only persist the 'auth' slice and settings.
  // The user profile should be fetched on app load to ensure it's fresh.
  whitelist: ['auth', 'soundSettings'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Disabled: These dev-only checks deep-traverse the entire state tree on every dispatch.
      // At high stateVersions (600+) they take 48ms+ each, exhausting the Android thread pool
      // and causing java.lang.OutOfMemoryError: pthread_create failed.
      // Both are automatically disabled in production builds anyway.
      serializableCheck: false,
      immutableCheck: false,
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
