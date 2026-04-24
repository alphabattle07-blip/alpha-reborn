import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import { formatCurrency } from "../../../utils/currency";
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

// Fixed spread rates
const BUY_RATE = 45; // 45 M = $1 (users buy)
const SELL_RATE = 50; // 50 M = $1 (users sell)

export default function MarketScreen({ navigation }: any) {
  const { balance, buyCoins, sellCoins } = useWallet();

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [buyAmount, setBuyAmount] = useState(""); // USD
  const [sellAmount, setSellAmount] = useState(""); // M-Coins
  const [paymentMethod, setPaymentMethod] = useState<"card" | "crypto">("card");

  // --- BUY ---
  const buyMCoinsValue = buyAmount ? parseFloat(buyAmount) * BUY_RATE : 0;

  // --- SELL ---
  const sellUsdValue = sellAmount ? parseFloat(sellAmount) / SELL_RATE : 0;
  const insufficientBalance =
    sellAmount && parseFloat(sellAmount) > balance ? true : false;

  // --- Helpers ---
  const userCurrency = Intl.DateTimeFormat().resolvedOptions().locale;

  const handleBuy = () => {
    const usd = parseFloat(buyAmount);
    if (!usd || usd <= 0) return Alert.alert("Enter valid amount");
    buyCoins(usd);
    Alert.alert(`Bought ${(usd * BUY_RATE).toLocaleString()} M-Coins`);
    setBuyAmount("");
  };

  const handleSell = () => {
    const mcoin = parseFloat(sellAmount);
    if (!mcoin || mcoin <= 0) return Alert.alert("Enter valid M-Coin amount");
    if (mcoin > balance) return Alert.alert("Insufficient balance");
    sellCoins(mcoin);
    setSellAmount("");
  };

  return (
    <LinearGradient colors={['#0a0e1a', '#101830', '#0a0e1a']} style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Wallet")}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>EXCHANGE NODE</Text>
          <View style={{ width: 42 }} />
        </View>

        <View style={[styles.mainWrap, { opacity: 0.3 }]}>
          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tab === "buy" && styles.activeTab]}
              onPress={() => setTab("buy")}
            >
              <Text style={[styles.tabText, tab === "buy" && styles.activeTabText]}>
                ACQUIRE (BUY)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === "sell" && styles.activeTab]}
              onPress={() => setTab("sell")}
            >
              <Text style={[styles.tabText, tab === "sell" && styles.activeTabText]}>
                LIQUIDATE (SELL)
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {/* BUY */}
            {tab === "buy" && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>MARKET BUY</Text>
                <Text style={styles.desc}>
                  Current rate: 45 M = $1 (Global Average)
                </Text>

                <Text style={styles.label}>AMOUNT IN USD ($)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 25"
                  placeholderTextColor="#64748b"
                  value={buyAmount}
                  onChangeText={(val) =>
                    /^\d*\.?\d*$/.test(val) && setBuyAmount(val)
                  }
                  keyboardType="numeric"
                />

                <View style={styles.resultBox}>
                  <Text style={styles.smallText}>OUTPUT ESTIMATE</Text>
                  <Text style={styles.resultText}>
                    {buyMCoinsValue.toLocaleString()} ALPHA COINS
                  </Text>
                </View>

                <Text style={styles.label}>TRANSFER PROTOCOL</Text>
                <View style={styles.paymentMethods}>
                  <TouchableOpacity
                    style={[
                      styles.method,
                      paymentMethod === "card" && styles.methodActive,
                    ]}
                  >
                    <Ionicons
                      name="card"
                      size={20}
                      color={paymentMethod === "card" ? "#fff" : "#94a3b8"}
                    />
                    <Text
                      style={[
                        styles.methodText,
                        paymentMethod === "card" && styles.methodTextActive,
                      ]}
                    >
                      SECURE CARD
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.method,
                      paymentMethod === "crypto" && styles.methodActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="bitcoin"
                      size={20}
                      color={paymentMethod === "crypto" ? "#fff" : "#94a3b8"}
                    />
                    <Text
                      style={[
                        styles.methodText,
                        paymentMethod === "crypto" && styles.methodTextActive,
                      ]}
                    >
                      CRYPTO HUB
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { opacity: 0.5 }]}
                  disabled={true}
                >
                  <Text style={styles.primaryBtnText}>EXECUTE PURCHASE</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SELL */}
            {tab === "sell" && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>MARKET LIQUIDITY</Text>
                <Text style={styles.desc}>Current rate: 50 M = $1 (Withdraw price)</Text>

                <View style={styles.balanceSummary}>
                   <Text style={styles.label}>AVAILABLE LIQUIDITY</Text>
                   <Text style={styles.balanceVal}>{balance.toLocaleString()} M-Coins</Text>
                </View>

                <Text style={styles.label}>LIQUIDATE AMOUNT (M)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 500"
                  placeholderTextColor="#64748b"
                  value={sellAmount}
                  onChangeText={(val) =>
                    /^\d*\.?\d*$/.test(val) && setSellAmount(val)
                  }
                  keyboardType="numeric"
                />

                <View style={styles.resultBox}>
                  <Text style={styles.smallText}>RECEIVABLE ESTIMATE</Text>
                  <Text style={styles.resultText}>
                    {formatCurrency(sellUsdValue, undefined)}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: "#ef4444", opacity: 0.5 }]}
                  disabled={true}
                >
                  <Text style={styles.primaryBtnText}>INITIALIZE WITHDRAWAL</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>

        <View style={styles.comingSoonOverlay}>
           <View style={styles.blurBox}>
              <MaterialCommunityIcons name="finance" size={48} color="#FFD700" />
              <Text style={styles.comingSoonTitle}>MARKET OFFLINE</Text>
              <Text style={styles.comingSoonSubtitle}>LIQUIDITY POOLS OPENING SOON</Text>
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
  tabs: {
    flexDirection: "row",
    backgroundColor: 'rgba(255,255,255,0.05)',
    margin: 20,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  desc: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 24,
  },
  label: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 20,
  },
  balanceSummary: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 10,
  },
  balanceVal: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: '900',
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  resultBox: {
    backgroundColor: 'rgba(255,215,0,0.05)',
    padding: 20,
    borderRadius: 20,
    marginTop: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.1)',
  },
  smallText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  resultText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },
  paymentMethods: {
    flexDirection: "row",
    gap: 12,
  },
  method: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    gap: 8,
  },
  methodActive: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderColor: 'rgba(255,215,0,0.2)',
  },
  methodText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
  },
  methodTextActive: {
    color: '#FFD700',
  },
  primaryBtn: {
    marginTop: 30,
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
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
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 15,
  },
  comingSoonSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 5,
    letterSpacing: 1,
  },
});
