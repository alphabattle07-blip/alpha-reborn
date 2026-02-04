
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

type RootStackParamList = {
  GameLobby: { gameId: string };
  GameModeScreen: { gameId: string; mode: string };
};

export default function GameLobby() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { gameId } = (route.params as any);

  const handleNavigate = (mode: string) => {
    navigation.navigate('GameModeScreen', { gameId: gameId, mode: mode });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to {gameId} Lobby</Text>

      <TouchableOpacity style={styles.button} onPress={() => handleNavigate('online')}>
        <Text style={styles.buttonText}>Play Online</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => handleNavigate('computer')}>
        <Text style={styles.buttonText}>Play Computer</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => handleNavigate('battle')}>
        <Text style={styles.buttonText}>Battle Ground</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1f3a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#f02e2e',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
  },
});
