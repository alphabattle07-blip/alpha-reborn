// src/navigation/RootNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

// Import all navigators and screens
import AuthStack from './AuthStack';
import MainTabNavigator from './MainTabNavigator';
import SplashScreen from '../assets/screens/game/splashscreen';
import GameLobby from '../assets/screens/game/GameLobbyScreen';
import GameModeScreen from '../assets/screens/game/GameModeScreen';
import WalletScreen from '../assets/screens/wallet/WalletScreen';
import TransactionHistoryScreen from '../assets/screens/wallet/TransactionHistoryScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    // Set the initial route to always be the SplashScreen
    <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
      {/* All possible routes are now registered at the top level */}
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Auth" component={AuthStack} />
      <Stack.Screen name="Home" component={MainTabNavigator} />

      {/* Screens that can be accessed from inside "Home" */}
      <Stack.Screen name="GameLobby" component={GameLobby} />
      <Stack.Screen name="GameModeScreen" component={GameModeScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: 'My Wallet' }} />
      <Stack.Screen name="TransactionHistory" component={TransactionHistoryScreen} options={{ title: 'Transaction History' }} />
    </Stack.Navigator>
  );
}