import React from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { useWallet } from "./WalletContext";
import { formatCurrency } from "../../utils/currency";

export default function TransactionHistoryScreen() {
  const { transactions } = useWallet();
  const userCurrency = undefined; // auto-detect

  const getCurrencyValue = (amount: number, type: "buy" | "sell") => {
    return type === "buy"
      ? formatCurrency(amount / 45, userCurrency)
      : formatCurrency(amount / 50, userCurrency);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Transaction History</Text>

      {transactions.length === 0 ? (
        <Text style={styles.emptyText}>No transactions yet.</Text>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.transactionCard}>
              <Text style={styles.transactionType}>
                {item.type === "buy" ? "🟢 Bought" : "🔴 Sold"}
              </Text>
              <Text style={styles.transactionAmount}>{item.amount} M-Coins</Text>
              <Text style={styles.transactionCurrency}>{getCurrencyValue(item.amount, item.type)}</Text>
              <Text style={styles.transactionDate}>{new Date(item.date).toLocaleString()}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f9f9f9" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  emptyText: { textAlign: "center", marginTop: 50, fontSize: 16, color: "#666" },
  transactionCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
  },
  transactionType: { fontWeight: "700", fontSize: 16 },
  transactionAmount: { marginTop: 4, fontSize: 16 },
  transactionCurrency: { color: "#888", marginTop: 2 },
  transactionDate: { fontSize: 12, color: "#aaa", marginTop: 4 },
});
