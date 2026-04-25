import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../../navigation/types';

interface UpgradePromptModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  isHardGate?: boolean;
}

export default function UpgradePromptModal({
  visible,
  onClose,
  title = "Secure Your Rank & Rewards",
  message = "Create an account to save your progress, secure your rank, and keep your coins safe.",
  isHardGate = false,
}: UpgradePromptModalProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleUpgrade = () => {
    onClose();
    navigation.navigate('Auth');
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <BlurView intensity={20} style={styles.overlay} tint="dark">
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['rgba(30, 41, 59, 0.95)', 'rgba(15, 23, 42, 0.98)']}
            style={styles.modalContent}
          >
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={['#FFD700', '#FFA000']}
                style={styles.iconGlow}
              >
                <Ionicons name="shield-checkmark" size={32} color="#000" />
              </LinearGradient>
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            <TouchableOpacity 
              style={styles.upgradeBtn} 
              onPress={handleUpgrade}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#10b981', '#059669']}
                style={styles.upgradeGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.upgradeBtnText}>Create Account</Text>
              </LinearGradient>
            </TouchableOpacity>

            {!isHardGate ? (
              <TouchableOpacity style={styles.continueBtn} onPress={onClose}>
                <Text style={styles.continueBtnText}>Continue as Guest</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.continueBtn} onPress={onClose}>
                <Text style={styles.continueBtnText}>Go Back</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContainer: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalContent: {
    padding: 30,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 20,
  },
  iconGlow: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  message: {
    color: '#94a3b8',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  upgradeBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  upgradeGradient: {
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upgradeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  continueBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  continueBtnText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
});
