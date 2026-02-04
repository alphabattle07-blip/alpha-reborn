import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Star, Play } from 'lucide-react-native';

interface NewUserWelcomeProps {
  onStartPlaying: () => void;
}

export default function NewUserWelcome({ onStartPlaying }: NewUserWelcomeProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Star size={48} color="#FFD700" style={styles.icon} />
        <Text style={styles.title}>Welcome to Alpha-Battle!</Text>
        <Text style={styles.subtitle}>
          You're all set as a Rookie with 1000 R-coins. 
          Start playing to climb the ranks!
        </Text>
        
        <View style={styles.stats}>
          <Text style={styles.statsText}>
            🏆 All games start at: 0 Wins • 0 Losses • 0 Draws
          </Text>
        </View>
        
        <TouchableOpacity style={styles.button} onPress={onStartPlaying}>
          <Play size={20} color="white" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Start Playing</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 20,
    marginVertical: 16,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  content: {
    alignItems: 'center',
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  stats: {
    backgroundColor: '#e8f4f8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  statsText: {
    fontSize: 14,
    color: '#2c5282',
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#4c669f',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});