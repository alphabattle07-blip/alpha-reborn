import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../../navigation/types";
import { useWallet } from "./WalletContext";
import { formatCurrency } from "../../utils/currency";

export default function WalletScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { balance } = useWallet();

  // Convert balance to USD equivalent for display
  const balanceUSD = balance / 50; // using sell rate
  const userCurrency = undefined; // undefined lets Intl auto-detect locale

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Wallet</Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceValue}>{balance} M-Coins</Text>
        <Text style={styles.balanceCurrency}>≈ {formatCurrency(balanceUSD, userCurrency)}</Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate("TransactionHistory")}
      >
        <Text style={styles.buttonText}>View Transaction History</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buyButton]}
        onPress={() => navigation.navigate("Market", { mode: "buy" })}
      >
        <Text style={styles.buttonText}>Deposit (Buy M-Coins)</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.sellButton]}
        onPress={() => navigation.navigate("Market", { mode: "sell" })}
      >
        <Text style={styles.buttonText}>Withdraw (Sell M-Coins)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9", padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
  balanceCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    elevation: 3,
    marginBottom: 20,
    alignItems: "center",
  },
  balanceLabel: { fontSize: 16, color: "#555" },
  balanceValue: { fontSize: 28, fontWeight: "bold", color: "#111", marginTop: 10 },
  balanceCurrency: { fontSize: 14, color: "#888", marginTop: 4 },
  button: {
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#333",
    marginVertical: 10,
    alignItems: "center",
  },
  buyButton: { backgroundColor: "#1e90ff" },
  sellButton: { backgroundColor: "#ff6347" },
  buttonText: { color: "#fff", fontWeight: "bold" },
});
