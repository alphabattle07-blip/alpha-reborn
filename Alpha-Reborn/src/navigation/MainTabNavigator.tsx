import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  StyleSheet,
  Image,
  ScrollView,
  Platform,
  ImageSourcePropType,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import your screens
import ProfileScreen from '../assets/screens/profile/ProfileScreen';
import MarketScreen from '../assets/screens/market/MarketScreen';
import WalletScreen from '../assets/screens/wallet/WalletScreen';
import { DrawerActions } from '@react-navigation/native';

// Game banner images
const whotBanner = require('../assets/images/games/whot_banner.png');
const ludoBanner = require('../assets/images/games/ludo_banner.png');

const Tab = createBottomTabNavigator();

type Game = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  banner: ImageSourcePropType;
  gradient: readonly [string, string, ...string[]];
  players: string;
  featured?: boolean;
};

const GAMES: Game[] = [
  {
    id: 'whot',
    title: 'Whot!',
    subtitle: 'Strategic Card Battle',
    icon: 'diamond',
    banner: whotBanner,
    gradient: ['#1a237e', '#0d47a1'],
    players: '2.4k',
    featured: true,
  },
  {
    id: 'ludo',
    title: 'Ludo',
    subtitle: 'Classic Board Game',
    icon: 'dice',
    banner: ludoBanner,
    gradient: ['#4a148c', '#7b1fa2'],
    players: '1.8k',
  },
];

// --- Featured Hero Card ---
const FeaturedGameCard: React.FC<{
  game: Game;
  onPress: () => void;
  screenWidth: number;
}> = ({ game, onPress, screenWidth }) => {
  const cardWidth = screenWidth - 40;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[featuredStyles.container, { width: cardWidth }]}
    >
      <Image source={game.banner} style={featuredStyles.bannerImage} resizeMode="cover" />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={featuredStyles.overlay}
      >
        <View style={featuredStyles.badgeRow}>
          <View style={featuredStyles.featuredBadge}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={featuredStyles.featuredText}>FEATURED</Text>
          </View>
          <View style={featuredStyles.playersBadge}>
            <View style={featuredStyles.liveDot} />
            <Text style={featuredStyles.playersText}>{game.players} playing</Text>
          </View>
        </View>
        <Text style={featuredStyles.title}>{game.title}</Text>
        <Text style={featuredStyles.subtitle}>{game.subtitle}</Text>
        <View style={featuredStyles.playRow}>
          <LinearGradient
            colors={['#FFD700', '#FFA000']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={featuredStyles.playButton}
          >
            <Text style={featuredStyles.playButtonText}>PLAY NOW</Text>
            <Ionicons name="play" size={16} color="#000" />
          </LinearGradient>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

// --- Standard Game Card ---
const GameCard: React.FC<{
  game: Game;
  onPress: () => void;
  screenWidth: number;
}> = ({ game, onPress, screenWidth }) => {
  const cardWidth = (screenWidth - 60) / 2;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[cardStyles.container, { width: cardWidth }]}
    >
      <Image source={game.banner} style={cardStyles.bannerImage} resizeMode="cover" />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={cardStyles.overlay}
      >
        <View style={cardStyles.playersBadge}>
          <View style={cardStyles.liveDot} />
          <Text style={cardStyles.playersText}>{game.players}</Text>
        </View>
        <Text style={cardStyles.title}>{game.title}</Text>
        <Text style={cardStyles.subtitle}>{game.subtitle}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
};

// Guard against native module not being compiled in the dev client build
let BannerAd: any = null;
let BannerAdSize: any = null;
let TestIds: any = null;
try {
  const mobileAds = require('react-native-google-mobile-ads');
  BannerAd = mobileAds.BannerAd;
  BannerAdSize = mobileAds.BannerAdSize;
  TestIds = mobileAds.TestIds;
} catch (e) {
  // Native module not available in this build (e.g. Expo Go / dev client without ads)
}

const adUnitId = TestIds
  ? __DEV__
    ? TestIds.ADAPTIVE_BANNER
    : 'ca-app-pub-3892796629709741/2201021145'
  : null;

function GamesScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<any>();

  const handleGamePress = (game: Game) => {
    navigation.navigate('GameLobby', { gameId: game.id });
  };

  const featuredGame = GAMES.find((g) => g.featured);
  const otherGames = GAMES.filter((g) => !g.featured);

  return (
    <LinearGradient colors={['#0a0e1a', '#101830', '#0a0e1a']} style={screenStyles.container}>
      <SafeAreaView style={screenStyles.safeArea}>
        {/* --- Top Bar --- */}
        <View style={screenStyles.topBar}>
          <TouchableOpacity
            style={screenStyles.iconButton}
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          >
            <Ionicons name="menu" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={screenStyles.logoContainer}>
            <Text style={screenStyles.logoText}>ALPHA</Text>
            <Text style={screenStyles.logoAccent}>BATTLE</Text>
          </View>

          <TouchableOpacity
            style={screenStyles.iconButton}
            onPress={() => navigation.navigate('notifications')}
          >
            <Ionicons name="notifications" size={22} color="#fff" />
            <View style={screenStyles.notifDot} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={screenStyles.scrollContent}
        >
          {/* --- Featured Game --- */}
          {featuredGame && (
            <>
              <Text style={screenStyles.sectionTitle}>🔥 Featured</Text>
              <FeaturedGameCard
                game={featuredGame}
                onPress={() => handleGamePress(featuredGame)}
                screenWidth={width}
              />
            </>
          )}

          {/* --- All Games --- */}
          <Text style={[screenStyles.sectionTitle, { marginTop: 28 }]}>🎮 All Games</Text>
          <View style={screenStyles.gridRow}>
            {/* Show the featured game in the grid too, plus others */}
            {GAMES.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onPress={() => handleGamePress(game)}
                screenWidth={width}
              />
            ))}
          </View>

          {/* --- Quick Stats Bar --- */}
          <View style={screenStyles.statsBar}>
            <View style={screenStyles.statItem}>
              <Ionicons name="people" size={20} color="#64748b" />
              <Text style={screenStyles.statValue}>4.2k</Text>
              <Text style={screenStyles.statLabel}>Online</Text>
            </View>
            <View style={screenStyles.statDivider} />
            <View style={screenStyles.statItem}>
              <Ionicons name="trophy" size={20} color="#64748b" />
              <Text style={screenStyles.statValue}>12k+</Text>
              <Text style={screenStyles.statLabel}>Matches Today</Text>
            </View>
            <View style={screenStyles.statDivider} />
            <View style={screenStyles.statItem}>
              <Ionicons name="shield-checkmark" size={20} color="#64748b" />
              <Text style={screenStyles.statValue}>Fair</Text>
              <Text style={screenStyles.statLabel}>Play Verified</Text>
            </View>
          </View>
        </ScrollView>

        {/* --- Ad Banner --- */}
        <View style={screenStyles.adContainer}>
          {BannerAd && adUnitId && (
            <BannerAd
              unitId={adUnitId}
              size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
              requestOptions={{
                requestNonPersonalizedAdsOnly: true,
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ✅ Bottom Tab Navigation including Games
export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#FFD700',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          backgroundColor: '#0f1629',
          height: 70,
          paddingBottom: 8,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.08)',
          elevation: 20,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 15,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.5,
        },
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Wallet') iconName = 'wallet';
          else if (route.name === 'Market') iconName = 'swap-horizontal';
          else if (route.name === 'Profile') iconName = 'person-circle';
          else if (route.name === 'Games') iconName = 'game-controller';
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

// ============================
//        STYLES
// ============================

const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 5 : 15,
    paddingBottom: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#0f1629',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  logoAccent: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFD700',
    letterSpacing: 2,
    marginLeft: 4,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 20,
    marginBottom: 14,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 16,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: 20,
    marginTop: 28,
    paddingVertical: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  statLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  adContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
});

const featuredStyles = StyleSheet.create({
  container: {
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    alignSelf: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    gap: 4,
  },
  featuredText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  playersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  playersText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  playRow: {
    flexDirection: 'row',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 25,
    gap: 6,
  },
  playButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
});

const cardStyles = StyleSheet.create({
  container: {
    height: 190,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 14,
  },
  playersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  playersText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});