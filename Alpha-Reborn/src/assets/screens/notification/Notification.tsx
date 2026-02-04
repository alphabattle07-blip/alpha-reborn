// src/screens/NotificationScreen.tsx
import React from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// Example notifications (replace later with backend API)
const notifications = [
  {
    id: "1",
    type: "update",
    title: "New Game Mode!",
    message: "Ayo battle mode is now live. Challenge your friends!",
    icon: "game-controller-outline",
    time: "2h ago",
  },
  {
    id: "2",
    type: "offer",
    title: "Special Offer",
    message: "Buy M-Coins today and get +10% bonus coins.",
    icon: "gift-outline",
    time: "1d ago",
  },
  {
    id: "3",
    type: "invite",
    title: "Match Invite",
    message: "Obinna has challenged you to a match!",
    icon: "person-add-outline",
    time: "3d ago",
  },
];

export default function NotificationScreen() {
  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card}>
      <View style={styles.iconBox}>
        <Ionicons name={item.icon as any} size={24} color="#2563eb" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.time}>{item.time}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Notifications</Text>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={() => (
          <Text style={{ textAlign: "center", marginTop: 20, color: "#6b7280" }}>
            No notifications yet
          </Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  message: { fontSize: 14, color: "#374151", marginTop: 2 },
  time: { fontSize: 12, color: "#6b7280", marginTop: 4 },
});
