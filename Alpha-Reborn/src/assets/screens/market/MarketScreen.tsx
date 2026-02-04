// src/screens/MarketScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import { formatCurrency } from "../../utils/currency";

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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate("Wallet")}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>M-Coin Market</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "buy" && styles.activeTab]}
          onPress={() => setTab("buy")}
        >
          <Text style={[styles.tabText, tab === "buy" && styles.activeTabText]}>
            Buy M-Coins
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "sell" && styles.activeTab]}
          onPress={() => setTab("sell")}
        >
          <Text style={[styles.tabText, tab === "sell" && styles.activeTabText]}>
            Sell M-Coins
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* BUY */}
        {tab === "buy" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Buy M-Coins</Text>
            <Text style={styles.desc}>
              Current rate: 45 M = $1 (Buy price)
            </Text>

            <Text style={styles.label}>Amount in USD ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 20"
              value={buyAmount}
              onChangeText={(val) =>
                /^\d*\.?\d*$/.test(val) && setBuyAmount(val)
              }
              keyboardType="numeric"
            />

            <View style={styles.resultBox}>
              <Text style={styles.smallText}>You will receive</Text>
              <Text style={styles.resultText}>
                {buyMCoinsValue.toLocaleString()} M-Coins
              </Text>
              <Text style={styles.smallText}>
                ≈ {formatCurrency(buyMCoinsValue / BUY_RATE, undefined)}
              </Text>
            </View>

            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.paymentMethods}>
              <TouchableOpacity
                style={[
                  styles.method,
                  paymentMethod === "card" && styles.methodActive,
                ]}
                onPress={() => setPaymentMethod("card")}
              >
                <Ionicons
                  name="card"
                  size={24}
                  color={paymentMethod === "card" ? "#fff" : "#000"}
                />
                <Text
                  style={[
                    styles.methodText,
                    paymentMethod === "card" && styles.methodTextActive,
                  ]}
                >
                  Card
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.method,
                  paymentMethod === "crypto" && styles.methodActive,
                ]}
                onPress={() => setPaymentMethod("crypto")}
              >
                <MaterialCommunityIcons
                  name="bitcoin"
                  size={24}
                  color={paymentMethod === "crypto" ? "#fff" : "#000"}
                />
                <Text
                  style={[
                    styles.methodText,
                    paymentMethod === "crypto" && styles.methodTextActive,
                  ]}
                >
                  Crypto
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { opacity: buyAmount ? 1 : 0.5 }]}
              disabled={!buyAmount}
              onPress={handleBuy}
            >
              <Text style={styles.primaryBtnText}>Proceed to Checkout</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* SELL */}
        {tab === "sell" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sell M-Coins</Text>
            <Text style={styles.desc}>Current rate: 50 M = $1 (Sell price)</Text>

            {/* User balance */}
            <Text style={[styles.label, { marginTop: 0 }]}>Your Balance</Text>
            <Text style={styles.balance}>{balance.toLocaleString()} M-Coins</Text>

            <Text style={styles.label}>M-Coins to Sell</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 500"
              value={sellAmount}
              onChangeText={(val) =>
                /^\d*\.?\d*$/.test(val) && setSellAmount(val)
              }
              keyboardType="numeric"
            />

            {insufficientBalance && (
              <Text style={styles.warning}>⚠️ Insufficient balance</Text>
            )}

            <View style={styles.resultBox}>
              <Text style={styles.smallText}>You will receive</Text>
              <Text style={styles.resultText}>
                {formatCurrency(sellUsdValue, undefined)}
              </Text>
              <Text style={styles.smallText}>
                ≈ Local currency value
              </Text>
            </View>

            <Text style={styles.label}>Bank Account</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your bank account details"
            />

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: "#dc2626",
                  opacity: insufficientBalance || !sellAmount ? 0.5 : 1,
                },
              ]}
              disabled={insufficientBalance || !sellAmount}
              onPress={handleSell}
            >
              <Text style={styles.primaryBtnText}>Withdraw Funds</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
  },
  backBtn: { marginRight: 12 },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700" },
  tabs: {
    flexDirection: "row",
    margin: 12,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tab: { flex: 1, padding: 12, backgroundColor: "#f3f4f6" },
  activeTab: { backgroundColor: "#2563eb" },
  tabText: { textAlign: "center", fontWeight: "600" },
  activeTabText: { color: "#fff" },
  content: { padding: 16 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, elevation: 2 },
  cardTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  desc: { fontSize: 14, color: "#6b7280", marginBottom: 16 },
  label: { fontWeight: "600", marginBottom: 6, marginTop: 12 },
  balance: { fontSize: 16, fontWeight: "700", color: "#2563eb" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fff",
  },
  resultBox: {
    marginVertical: 12,
    padding: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    alignItems: "center",
  },
  smallText: { fontSize: 12, color: "#6b7280" },
  resultText: { fontSize: 20, fontWeight: "700", color: "#2563eb" },
  paymentMethods: { flexDirection: "row", gap: 12, marginTop: 8 },
  method: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
  },
  methodActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  methodText: { marginTop: 4, fontWeight: "600" },
  methodTextActive: { color: "#fff" },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  warning: { color: "#dc2626", marginTop: 8, fontWeight: "600" },
});
