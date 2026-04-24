import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../../navigation/types";
import { useWallet } from "./WalletContext";
import { formatCurrency } from "../../../utils/currency";
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WalletScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { balance } = useWallet();

  // Convert balance to USD equivalent for display
  const balanceUSD = balance / 50; // using sell rate
  const userCurrency = undefined; // undefined lets Intl auto-detect locale

  return (
    <LinearGradient colors={['#0a0e1a', '#101830', '#0a0e1a']} style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
           <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
             <Ionicons name="arrow-back" size={24} color="#fff" />
           </TouchableOpacity>
           <Text style={styles.headerTitle}>SECURE WALLET</Text>
           <View style={{ width: 42 }} />
        </View>

        <View style={[styles.mainWrap, { opacity: 0.35 }]}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <LinearGradient
              colors={['#1e293b', '#0f172a']}
              style={styles.balanceCard}
            >
              <View style={styles.balanceInfo}>
                <Text style={styles.balanceLabel}>TOTAL ASSETS</Text>
                <Text style={styles.balanceValue}>{balance.toLocaleString()}</Text>
                <Text style={styles.coinUnit}>ALPHA COINS (M)</Text>
              </View>
              <View style={styles.fiatPreview}>
                <Ionicons name="stats-chart" size={14} color="#10b981" />
                <Text style={styles.balanceCurrency}>≈ {formatCurrency(balanceUSD, undefined)}</Text>
              </View>
            </LinearGradient>

            <View style={styles.actionGrid}>
               <TouchableOpacity style={styles.actionBtn}>
                  <LinearGradient colors={['#2563eb', '#1d4ed8']} style={styles.actionGradient}>
                     <Ionicons name="add-circle" size={24} color="#fff" />
                     <Text style={styles.actionBtnText}>DEPOSIT</Text>
                  </LinearGradient>
               </TouchableOpacity>

               <TouchableOpacity style={styles.actionBtn}>
                  <LinearGradient colors={['#ef4444', '#b91c1c']} style={styles.actionGradient}>
                     <Ionicons name="arrow-up-circle" size={24} color="#fff" />
                     <Text style={styles.actionBtnText}>WITHDRAW</Text>
                  </LinearGradient>
               </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.historyLink}>
               <Ionicons name="time-outline" size={20} color="#64748b" />
               <Text style={styles.historyText}>TRANSACTION HISTORY</Text>
               <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.comingSoonOverlay}>
           <View style={styles.blurBox}>
              <MaterialCommunityIcons name="lock-clock" size={48} color="#FFD700" />
              <Text style={styles.comingSoonTitle}>COMMERCIAL NODE</Text>
              <Text style={styles.comingSoonSubtitle}>SECURE WALLET DEPLOYING SOON</Text>
           </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 5 : 15,
    paddingBottom: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  mainWrap: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  balanceCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 24,
    alignItems: 'center',
  },
  balanceInfo: {
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
    marginTop: 8,
  },
  coinUnit: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  fiatPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  balanceCurrency: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  actionBtn: {
    flex: 1,
    height: 100,
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  historyText: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  comingSoonOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    pointerEvents: 'none',
  },
  blurBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 30,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  comingSoonTitle: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 15,
  },
  comingSoonSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
    letterSpacing: 1,
  },
});
