import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  USER_STATS_PREFIX: 'alpha_battle_user_stats_', // Changed to prefix
  LAST_SYNC: 'alpha_battle_last_sync',
  OFFLINE_QUEUE: 'alpha_battle_offline_queue',
};

export const storage = {
  // Save user stats to local storage for a specific gameId
  saveUserStats: async (gameId: string, stats: any) => {
    try {
      await AsyncStorage.setItem(`${STORAGE_KEYS.USER_STATS_PREFIX}${gameId}`, JSON.stringify(stats));
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());
    } catch (error) {
      console.error(`Error saving ${gameId} user stats:`, error);
    }
  },

  // Load user stats from local storage for a specific gameId
  loadUserStats: async (gameId: string) => {
    try {
      const stats = await AsyncStorage.getItem(`${STORAGE_KEYS.USER_STATS_PREFIX}${gameId}`);
      return stats ? JSON.parse(stats) : null;
    } catch (error) {
      console.error(`Error loading ${gameId} user stats:`, error);
      return null;
    }
  },

  // Add operation to offline queue
  addToOfflineQueue: async (operation: any) => {
    try {
      const queue = await storage.getOfflineQueue();
      const updatedQueue = [...queue, operation];
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(updatedQueue));
    } catch (error) {
      console.error('Error adding to offline queue:', error);
    }
  },

  // Get offline queue
  getOfflineQueue: async () => {
    try {
      const queue = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('Error getting offline queue:', error);
      return [];
    }
  },

  // Clear offline queue
  clearOfflineQueue: async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    } catch (error) {
      console.error('Error clearing offline queue:', error);
    }
  },

  // Check if data needs sync
  needsSync: async () => {
    try {
      const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
      if (!lastSync) return true;
      
      const syncTime = parseInt(lastSync);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      return syncTime < oneHourAgo;
    } catch (error) {
      console.error('Error checking sync status:', error);
      return true;
    }
  },
};
