import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// Game banner images
const gameBanners: Record<string, ImageSourcePropType> = {
  whot: require('../../../assets/images/games/whot_banner.png'),
  ludo: require('../../../assets/images/games/ludo_banner.png'),
};

type ModeOption = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: readonly [string, string, ...string[]];
  disabled?: boolean;
  tag?: string;
};

const MODES: ModeOption[] = [
  {
    key: 'online',
    title: 'Online Multiplayer',
    subtitle: 'Compete with players worldwide',
    icon: 'earth',
    gradient: ['#3b82f6', '#1d4ed8'],
    tag: 'POPULAR',
  },
  {
    key: 'computer',
    title: 'VS Computer',
    subtitle: 'Practice against advanced AI',
    icon: 'hardware-chip',
    gradient: ['#8b5cf6', '#6d28d9'],
  },
  {
    key: 'battle',
    title: 'Battle Ground',
    subtitle: 'Coming soon — High-stakes tournaments',
    icon: 'flame',
    gradient: ['#334155', '#1e293b'],
    disabled: true,
    tag: 'SOON',
  },
];

const ModeCard = ({
  mode,
  onPress,
}: {
  mode: ModeOption;
  onPress: () => void;
}) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    disabled={mode.disabled}
    style={[cardStyles.container, mode.disabled && cardStyles.disabled]}
  >
    <LinearGradient
      colors={mode.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={cardStyles.gradient}
    >
      <View style={cardStyles.row}>
        <View style={cardStyles.iconWrap}>
          <Ionicons name={mode.icon} size={28} color="#fff" />
        </View>
        <View style={cardStyles.textWrap}>
          <View style={cardStyles.titleRow}>
            <Text style={cardStyles.title}>{mode.title}</Text>
            {mode.tag && (
              <View
                style={[
                  cardStyles.tagBadge,
                  mode.disabled && cardStyles.tagBadgeDisabled,
                ]}
              >
                <Text
                  style={[
                    cardStyles.tagText,
                    mode.disabled && cardStyles.tagTextDisabled,
                  ]}
                >
                  {mode.tag}
                </Text>
              </View>
            )}
          </View>
          <Text style={cardStyles.subtitle}>{mode.subtitle}</Text>
        </View>
        {!mode.disabled && (
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.6)" />
        )}
      </View>
    </LinearGradient>
  </TouchableOpacity>
);

export default function GameLobby() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { gameId } = route.params as any;

  const handleNavigate = (mode: string) => {
    navigation.navigate('GameModeScreen', { gameId, mode });
  };

  const gameName = gameId.charAt(0).toUpperCase() + gameId.slice(1);
  const banner = gameBanners[gameId] || gameBanners.whot;

  return (
    <LinearGradient colors={['#0a0e1a', '#101830', '#0a0e1a']} style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        {/* --- Header --- */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.lobbyTitle}>{gameName}</Text>
            <Text style={styles.lobbyAccent}>ARENA</Text>
          </View>

          <View style={{ width: 42 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* --- Hero Banner --- */}
          <View style={styles.heroBanner}>
            <Image source={banner} style={styles.heroImage} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(10,14,26,0.95)']}
              style={styles.heroOverlay}
            >
              <View style={styles.heroBadgeRow}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.heroTitle}>{gameName}!</Text>
              <Text style={styles.heroSubtitle}>Choose your arena and battle</Text>
            </LinearGradient>
          </View>

          {/* --- Mode Selection --- */}
          <Text style={styles.sectionTitle}>⚔️ Select Mode</Text>

          {MODES.map((mode) => (
            <ModeCard
              key={mode.key}
              mode={mode}
              onPress={() => handleNavigate(mode.key)}
            />
          ))}

          {/* --- Footer Stats --- */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Ionicons name="people" size={18} color="#64748b" />
              <Text style={styles.statValue}>
                {gameId === 'whot' ? '2.4k' : '1.8k'}
              </Text>
              <Text style={styles.statLabel}>Online</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="trophy" size={18} color="#64748b" />
              <Text style={styles.statValue}>
                {gameId === 'whot' ? '8k+' : '5k+'}
              </Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="shield-checkmark" size={18} color="#64748b" />
              <Text style={styles.statValue}>Fair</Text>
              <Text style={styles.statLabel}>Play</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ===================== STYLES =====================

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 5 : 15,
    paddingBottom: 10,
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
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lobbyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  lobbyAccent: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFD700',
    letterSpacing: 2,
    marginLeft: 6,
  },
  scrollContent: {
    paddingBottom: 30,
  },

  // --- Hero ---
  heroBanner: {
    height: 200,
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.15)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 20,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  liveText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },

  // --- Section ---
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 20,
    marginBottom: 14,
    marginTop: 20,
    letterSpacing: 0.5,
  },

  // --- Stats ---
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 16,
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
    fontSize: 15,
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
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});

const cardStyles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 14,
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
  disabled: {
    opacity: 0.45,
    elevation: 0,
    shadowOpacity: 0,
  },
  gradient: {
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  textWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  tagBadge: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  tagBadgeDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tagText: {
    color: '#FFD700',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tagTextDisabled: {
    color: '#94a3b8',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
});
