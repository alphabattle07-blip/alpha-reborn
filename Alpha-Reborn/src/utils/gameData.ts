import { GameStats } from '../navigation/types';

// Default games configuration
export const DEFAULT_GAMES = [
  { id: 'chess', title: 'Chess', icon: '♟️' },
  { id: 'ayo', title: 'Ayo', icon: '🥥' },
  { id: 'whot', title: 'Whot', icon: '🃏' },
  { id: 'ludo', title: 'Ludo', icon: '🎲' },
  { id: 'draughts', title: 'Draughts', icon: '⭕' },
] as const;

// Default game statistics for new users (rookie level)
export const DEFAULT_GAME_STATS: GameStats = {
  gameId: '',
  wins: 0,
  losses: 0,
  draws: 0,
  rating: 1000, // Rookie level starts at 1000
};

// Initialize default game statistics for all games
export const initializeDefaultGameStats = (): GameStats[] => {
  return DEFAULT_GAMES.map(game => ({
    ...DEFAULT_GAME_STATS,
    gameId: game.id,
  }));
};

// Get game statistics by game ID
export const getGameStatsById = (gameStats: GameStats[], gameId: string): GameStats | undefined => {
  return gameStats.find(stats => stats.gameId === gameId);
};

// Get rating by game ID
export const getRatingByGameId = (gameStats: GameStats[], gameId: string): number => {
  const stats = getGameStatsById(gameStats, gameId);
  return stats?.rating || 1000; // Default to rookie level if not found
};

// Get statistics by game ID
export const getStatsByGameId = (gameStats: GameStats[], gameId: string): { wins: number; losses: number; draws: number } | undefined => {
  const stats = getGameStatsById(gameStats, gameId);
  return stats ? { wins: stats.wins, losses: stats.losses, draws: stats.draws } : undefined;
};

// Check if user is new (no game statistics or all at rookie level)
export const isNewUser = (gameStats: GameStats[]): boolean => {
  if (!gameStats || gameStats.length === 0) {
    return true;
  }
  
  // Check if all games have rookie-level statistics
  return gameStats.every(stats => 
    stats.wins === 0 && 
    stats.losses === 0 && 
    stats.draws === 0 && 
    stats.rating === 1000
  );
};

// Transform backend game stats to frontend format
export const transformBackendGameStats = (backendGameStats?: Array<{
  gameId: string;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
}>): GameStats[] => {
  if (!backendGameStats || backendGameStats.length === 0) {
    return initializeDefaultGameStats();
  }
  
  return backendGameStats.map(stats => ({
    gameId: stats.gameId,
    wins: stats.wins,
    losses: stats.losses,
    draws: stats.draws,
    rating: stats.rating,
  }));
};

// Create player object from user profile and game stats
export const createPlayerFromProfile = (profile: any, gameStats: GameStats[]) => {
  const stats: Record<string, { wins: number; losses: number; draws: number }> = {};
  const ratings: Record<string, number> = {};
  
  gameStats.forEach(gameStat => {
    stats[gameStat.gameId] = {
      wins: gameStat.wins,
      losses: gameStat.losses,
      draws: gameStat.draws,
    };
    ratings[gameStat.gameId] = gameStat.rating;
  });
  
  return {
    name: profile.name,
    avatar: profile.avatar || '',
    country: 'NG', // Default country, can be made configurable
    stats,
    ratings,
    mcoin: profile.mcoin,
  };
};