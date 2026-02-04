// src/store/index.ts
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

import userReducer from './slices/userSlice';
import authReducer from './slices/authSlice';
import gameStatsReducer from './slices/gameStatsSlice';
import onlineGameReducer from './slices/onlineGameSlice';

const rootReducer = combineReducers({
  user: userReducer,
  auth: authReducer,
  gameStats: gameStatsReducer,
  onlineGame: onlineGameReducer,
});

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  // IMPORTANT: Only persist the 'auth' slice. The user profile should be
  // fetched on app load to ensure it's fresh.
  whitelist: ['auth'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
