import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { useSocket } from '../../hooks/useSocket';
import LoadingSpinner from '../../../components/LoadingSpinner';
import { useNavigation } from '@react-navigation/native';
import { fetchAvailableGames, createOnlineGame, joinOnlineGame } from '../../../store/thunks/onlineGameThunks';

interface AvailableGame {
  id: string;
  gameType: string;
  player1: {
    id: string;
    name: string;
    rating: number;
  };
  createdAt: string;
}

export const MatchmakingScreen: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { onlineGame } = useAppSelector((state) => state);
  const { isConnected, connectionError } = useSocket();
  const [isCreatingGame, setIsCreatingGame] = useState(false);

  useEffect(() => {
    if (isConnected) {
      // Fetch available games when connected
      dispatch(fetchAvailableGames());
    }
  }, [isConnected, dispatch]);

  const handleCreateGame = async () => {
    try {
      setIsCreatingGame(true);
      await dispatch(createOnlineGame('ayo'));
      // Navigation to waiting room will be handled by state change
    } catch (error) {
      Alert.alert('Error', 'Failed to create game. Please try again.');
    } finally {
      setIsCreatingGame(false);
    }
  };

  const handleJoinGame = async (gameId: string) => {
    try {
      await dispatch(joinOnlineGame(gameId));
      // Navigation to game will be handled by state change
    } catch (error) {
      Alert.alert('Error', 'Failed to join game. Please try again.');
    }
  };

  const renderAvailableGame = ({ item }: { item: AvailableGame }) => (
    <TouchableOpacity
      style={styles.gameCard}
      onPress={() => handleJoinGame(item.id)}
    >
      <View style={styles.gameCardContent}>
        <View style={styles.gameInfo}>
          <Text style={styles.gameType}>Ayo Game</Text>
          <Text style={styles.playerName}>{item.player1.name}</Text>
          <Text style={styles.playerRating}>Rating: {item.player1.rating}</Text>
        </View>
        <View style={styles.joinButton}>
          <Text style={styles.joinButtonText}>Join</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <View style={styles.connectionStatus}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.connectionText}>
            {connectionError ? `Connection Error: ${connectionError}` : 'Connecting to server...'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Online Ayo</Text>
        <Text style={styles.subtitle}>Find opponents and play online</Text>
      </View>

      <View style={styles.actionSection}>
        <TouchableOpacity
          style={[styles.createGameButton, isCreatingGame && styles.disabledButton]}
          onPress={handleCreateGame}
          disabled={isCreatingGame}
        >
          {isCreatingGame ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.createGameButtonText}>Create New Game</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.availableGamesSection}>
        <Text style={styles.sectionTitle}>Available Games</Text>
        {onlineGame.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading games...</Text>
          </View>
        ) : onlineGame.availableGames.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No games available</Text>
            <Text style={styles.emptySubtext}>Create a new game to start playing</Text>
          </View>
        ) : (
          <FlatList
            data={onlineGame.availableGames}
            renderItem={renderAvailableGame}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.gamesList}
          />
        )}
      </View>

      {onlineGame.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{onlineGame.error}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  connectionStatus: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectionText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  actionSection: {
    marginBottom: 30,
  },
  createGameButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  createGameButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  availableGamesSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  gamesList: {
    paddingBottom: 20,
  },
  gameCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  gameCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  gameInfo: {
    flex: 1,
  },
  gameType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  playerName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  playerRating: {
    fontSize: 12,
    color: '#888',
  },
  joinButton: {
    backgroundColor: '#28a745',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  joinButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  errorText: {
    color: '#721c24',
    textAlign: 'center',
  },
});
