import React from 'react';
import { View, Text, FlatList, TouchableOpacity, useWindowDimensions, StyleSheet } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

// Import your screens
import ProfileScreen from "../assets/screens/profile/ProfileScreen";
import MarketScreen from "../assets/screens/market/MarketScreen";
import WalletScreen from "../assets/screens/wallet/WalletScreen";
import { DrawerActions } from '@react-navigation/native';

const Tab = createBottomTabNavigator();

type RootStackParamList = {
  GameLobby: { gameId: string };
};

type Game = {
  id: string;
  title: string;
  icon: string;
};

const GAMES: Game[] = [
  // { id: 'chess', title: 'Chess', icon: '♟️' },
  // { id: 'ayo', title: 'Ayo', icon: '🪙' },
  { id: 'whot', title: 'Whot', icon: '♠️' },
  { id: 'ludo', title: 'Ludo', icon: '🎲' },
  // { id: 'droughts', title: 'Draughts', icon: '♛' },
];


const GameCard: React.FC<{ item: Game; onPress: () => void; }> = ({ item, onPress }) => (
  <View style={styles.card}>
    <Text style={styles.cardIcon}>{item.icon}</Text>
    <Text style={styles.cardTitle}>{item.title}</Text>
    <TouchableOpacity style={styles.playButton} onPress={onPress}>
      <Text style={styles.playButtonText}>Play</Text>
    </TouchableOpacity>
  </View>
);

function GamesScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const handleGamePress = (game: Game) => {
    navigation.navigate('GameLobby', { gameId: game.id });
  };

  return (
    <LinearGradient colors={['#0b1f3a', '#27175d']} style={styles.container}>
      {/* Top Bar Navigation */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
          <Ionicons name="menu-outline" size={32} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Choose Your Game</Text>
        <TouchableOpacity onPress={() => navigation.navigate('notifications')}>
          <Ionicons name="notifications-outline" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={GAMES}
        renderItem={({ item }) => <GameCard item={item} onPress={() => handleGamePress(item)} />}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
      />
    </LinearGradient>
  );
}

// ✅ Bottom Tab Navigation including Games

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#2E86DE",
        tabBarInactiveTintColor: "gray",
        tabBarStyle: { backgroundColor: "#fff", height: 65, paddingBottom: 5 },
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "home";
          if (route.name === "Wallet") iconName = "wallet-outline";
          else if (route.name === "Market") iconName = "swap-horizontal-outline";
          else if (route.name === "Profile") iconName = "person-circle-outline";
          else if (route.name === "Games") iconName = "game-controller-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Games" component={GamesScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Market" component={MarketScreen} />
      <Tab.Screen name="Profile">
        {() => <ProfileScreen isOwnProfile={true} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  grid: {
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffffff20',
    borderRadius: 10,
    padding: 20,
    margin: 10,
    alignItems: 'center',
    flex: 1,
  },
  cardIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 10,
  },
  playButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 5,
  },
  playButtonText: {
    color: '#000000',
    fontWeight: 'bold',
  },
});