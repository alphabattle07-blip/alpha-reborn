// src/navigation/types.ts
export type RootStackParamList = {
  SignUp: undefined;
  SignIn: undefined;
  Splash: undefined;
  Home: undefined;
  GameLobby: { roomId?: string } | undefined;
  GameModeScreen: { mode?: string } | undefined;

  // Wallet
  // Wallet
  profile: { userId: string } | undefined;
  Wallet: undefined;
  TransactionHistory: undefined;
  Market: { mode?: "buy" | "sell" } | undefined;
  notifications: undefined;
  Auth: undefined;
};

export type Player = {
  [x: string]: any;
  name: string;
  avatar: string;
  country: string;
  stats: Record<string, { wins: number; losses: number; draws: number }>;
  ratings: Record<string, number>;
  mcoin?: number;
};

export interface GameStats {
  id: string;
  gameId: string;
  title: string;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
}


export type EnhancedUserProfile = {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  gameStats: GameStats[];
};
