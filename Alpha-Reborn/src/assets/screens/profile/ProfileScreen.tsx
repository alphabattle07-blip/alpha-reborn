import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Button,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../../navigation/types';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { fetchUserProfile, updateUserProfileThunk, logoutUser } from '../../../store/slices/authSlice';
import { fetchAllGameStatsThunk } from '../../../store/thunks/gameStatsThunks';
import { getFlagEmoji } from '../../../utils/flags';
import { getRankFromRating } from '../../../utils/rank';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { UserProfile, GameStats } from '../../../services/api/authService';
import {
  requestMediaLibraryPermissionsAsync,
  launchImageLibraryAsync,
  MediaTypeOptions
} from 'expo-image-picker';

import Toast from 'react-native-toast-message';

type ProfileScreenProps = {
  isOwnProfile?: boolean;
};

type ProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ProfileScreenRouteProp = RouteProp<RootStackParamList, 'profile'>;

export default function ProfileScreen({ isOwnProfile: propIsOwnProfile }: ProfileScreenProps) {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const route = useRoute<ProfileScreenRouteProp>();
  const dispatch = useAppDispatch();

  const isOwnProfile = propIsOwnProfile ?? (route.params?.userId === undefined);

  // --- REDUX STATE ---
  const { token } = useAppSelector((state) => state.auth);
  const { profile: reduxProfile, loading: userLoading, error: userError } = useAppSelector((state) => state.user);

  // Game Stats from Redux (Slice)
  const { gameStats: reduxGameStats, loading: gameStatsLoading } = useAppSelector((state) => state.gameStats);
  const gameStatsArray = Object.values(reduxGameStats);

  // --- LOCAL STATE ---
  const [otherPlayerProfile, setOtherPlayerProfile] = useState<UserProfile | null>(null);
  const [otherPlayerLoading, setOtherPlayerLoading] = useState(false);
  const [otherPlayerError, setOtherPlayerError] = useState<string | null>(null);

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Cloudinary configuration (You should ideally move these to a .env or config file)
  const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/daj1kuk7w/image/upload';
  const UPLOAD_PRESET = 'alpha_battle_preset'; // You still need to create this in Cloudinary dashboard

  const { userId } = route.params || {};

  // --- DATA FETCHING ---
  const loadData = useCallback(async () => {
    if (!token) return;

    if (isOwnProfile) {
      // 1. Always fetch Profile (contains embedded stats usually)
      try {
        await dispatch(fetchUserProfile(undefined)).unwrap();
      } catch (err) {
        console.log("Profile fetch error:", err);
      }

      // 2. Try to fetch detailed Stats, but don't crash if it fails
      try {
        await dispatch(fetchAllGameStatsThunk()).unwrap();
      } catch (err) {
        console.log("Stats fetch error (ignoring to use profile fallback):", err);
      }
    } else if (userId) {
      // Fetch other player
      setOtherPlayerLoading(true);
      try {
        const profile = await dispatch(fetchUserProfile(userId)).unwrap();
        setOtherPlayerProfile(profile);
      } catch (error: any) {
        setOtherPlayerError(error.message || 'Failed to load profile');
      } finally {
        setOtherPlayerLoading(false);
      }
    }
  }, [isOwnProfile, token, userId, dispatch]);

  // --- RE-FETCH ON FOCUS (Crucial Fix) ---
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const playerToShow = isOwnProfile ? reduxProfile : otherPlayerProfile;

  // Only show full loading screen if we have absolutely no data
  const isLoading = (isOwnProfile ? userLoading : otherPlayerLoading) && !playerToShow && !refreshing;
  const error = isOwnProfile ? userError : otherPlayerError;

  const DEFAULT_GAMES = [
    // { id: 'chess', title: 'Chess' },
    // { id: 'ayo', title: 'Ayo' },
    { id: 'whot', title: 'Whot' },
    { id: 'ludo', title: 'Ludo' },
    // { id: 'draughts', title: 'Draughts' },
  ];

  // --- RENDER PREPARATION ---

  // MERGE STRATEGY: Try to find stats in the Redux Slice first. 
  // If not found (e.g. fetch failed), fall back to the `gameStats` array inside the Profile object.
  const profileEmbeddedStats = playerToShow?.gameStats || [];

  const statsToRender = DEFAULT_GAMES.map(game => {
    // 1. If viewing own profile, try Redux Slice first.
    let existingStat = isOwnProfile 
      ? gameStatsArray.find(stat => stat.gameId === game.id) 
      : undefined;

    // 2. If missing (or viewing someone else), fallback to Profile Embedded Stats
    if (!existingStat) {
      const embedded = profileEmbeddedStats.find(s => s.gameId === game.id);
      if (embedded) {
        existingStat = {
          id: embedded.id || `emb-${game.id}`,
          gameId: embedded.gameId,
          title: game.title,
          wins: embedded.wins,
          losses: embedded.losses,
          draws: embedded.draws,
          rating: embedded.rating,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as GameStats;
      }
    }

    return {
      id: existingStat?.id || `temp-${game.id}`,
      gameId: game.id,
      title: game.title,
      wins: existingStat?.wins ?? 0,
      losses: existingStat?.losses ?? 0,
      draws: existingStat?.draws ?? 0,
      rating: existingStat?.rating ?? 1000,
      createdAt: existingStat?.createdAt || new Date().toISOString(),
      updatedAt: existingStat?.updatedAt || new Date().toISOString(),
      hasExistingStats: !!existingStat,
    };
  });

  // Auto-select first game
  useEffect(() => {
    if (statsToRender.length > 0 && !selectedGameId) {
      setSelectedGameId(statsToRender[0].gameId);
    }
  }, [statsToRender, selectedGameId]);

  const selectedGame = statsToRender.find((stat) => stat.gameId === selectedGameId);
  const totalRating = selectedGame ? selectedGame.rating : (playerToShow?.rating ?? 1000);
  const rank = getRankFromRating(totalRating);

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: () => {
            dispatch(logoutUser());
            navigation.replace("Auth");
          }
        }
      ]
    );
  };

  const pickImage = async () => {
    if (!isOwnProfile) return;

    // Request permissions
    const { status } = await requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'Permission Denied',
        text2: 'Sorry, we need camera roll permissions to make this work!',
      });
      return;
    }

    let result = await launchImageLibraryAsync({
      mediaTypes: MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      handleUpload(result.assets[0].uri);
    }
  };

  const handleUpload = async (uri: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: 'image/jpeg',
        name: 'profile.jpg',
      } as any);
      formData.append('upload_preset', UPLOAD_PRESET);

      const response = await fetch(CLOUDINARY_URL, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.secure_url) {
        await dispatch(updateUserProfileThunk({ avatar: data.secure_url })).unwrap();
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: 'Profile picture updated!',
        });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      Toast.show({
        type: 'error',
        text1: 'Upload Failed',
        text2: error.message || 'Something went wrong',
      });
    } finally {
      setUploading(false);
    }
  };

  // --- RENDER UI ---

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2E86DE" />
          <Text style={styles.loadingText}>Loading Profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !playerToShow) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <Button title="Retry" onPress={loadData} />
        </View>
      </SafeAreaView>
    );
  }

  if (isOwnProfile && !token) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Feather name="user" size={64} color="gray" />
          <Text style={styles.title}>Authentication Required</Text>
          <Text style={styles.subtitle}>Please sign in to view your profile</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('Auth', { screen: 'SignIn' } as any)}
          >
            <Text style={styles.buttonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!playerToShow) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.centered}
        >
          <Text>No profile data available.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const avatar = playerToShow.avatar ?? null;
  const name = playerToShow.name ?? 'Unknown Player';
  const country = playerToShow.country ?? '';

  return (
    <LinearGradient colors={['#0a0e1a', '#101830', '#0a0e1a']} style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFD700" />
          }
        >
          {/* --- Header --- */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{isOwnProfile ? 'MY PROFILE' : 'PLAYER PROFILE'}</Text>
            <View style={{ width: 42 }} />
          </View>

          {/* --- Profile Card --- */}
          <View style={styles.profileHero}>
            <TouchableOpacity
              onPress={pickImage}
              disabled={!isOwnProfile || uploading}
              style={styles.avatarWrapper}
            >
              <LinearGradient
                colors={['#FFD700', '#FFA000', '#FFD700']}
                style={styles.avatarGlow}
              >
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Ionicons name="person" size={48} color="#64748b" />
                  </View>
                )}
              </LinearGradient>
              {isOwnProfile && (
                <View style={styles.editBadge}>
                  {uploading ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#000" />
                  )}
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.userInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.playerName}>{name}</Text>
                <Text style={styles.countryFlag}>{getFlagEmoji(country)}</Text>
              </View>
              
              <View style={styles.rankContainer}>
                <LinearGradient
                  colors={['rgba(255,215,0,0.15)', 'rgba(255,160,0,0.25)']}
                  style={styles.rankBadge}
                >
                  <Text style={styles.rankIcon}>{rank?.icon ?? '🌱'}</Text>
                  <Text style={styles.rankText}>{rank?.level?.toUpperCase() ?? 'ROOKIE'}</Text>
                </LinearGradient>
              </View>
            </View>
          </View>

          {/* --- Main Dashboard --- */}
          <View style={styles.dashboard}>
            <Text style={styles.sectionTitle}>🏆 Combat Records</Text>
            
            <View style={styles.statsCard}>
               <View style={styles.gameTabs}>
                 {statsToRender.map((s) => (
                    <TouchableOpacity
                      key={s.gameId}
                      style={[
                        styles.gameTab,
                        selectedGameId === s.gameId && styles.activeGameTab
                      ]}
                      onPress={() => setSelectedGameId(s.gameId)}
                    >
                      <Text style={[
                        styles.gameTabText,
                        selectedGameId === s.gameId && styles.activeGameTabText
                      ]}>
                        {s.title.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
               </View>

               {selectedGame && (
                 <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                       <Text style={styles.statVal}>{selectedGame.rating}</Text>
                       <Text style={styles.statLabel}>RATING</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                       <Text style={[styles.statVal, { color: '#10b981' }]}>{selectedGame.wins}</Text>
                       <Text style={styles.statLabel}>WINS</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                       <Text style={[styles.statVal, { color: '#ef4444' }]}>{selectedGame.losses}</Text>
                       <Text style={styles.statLabel}>LOSSES</Text>
                    </View>
                 </View>
               )}
            </View>

            {/* --- Performance Summary --- */}
            <TouchableOpacity style={styles.actionCard} activeOpacity={0.7}>
               <View style={styles.actionIcon}>
                  <Ionicons name="analytics" size={24} color="#FFD700" />
               </View>
               <View style={styles.actionTextContent}>
                  <Text style={styles.actionTitle}>Performance Summary</Text>
                  <Text style={styles.actionSubtitle}>View your career growth and analytics</Text>
               </View>
               <Ionicons name="chevron-forward" size={20} color="#64748b" />
            </TouchableOpacity>

            {isOwnProfile && (
              <TouchableOpacity 
                style={styles.logoutBtn} 
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={22} color="#ef4444" />
                <Text style={styles.logoutBtnText}>TERMINATE SESSION</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  scrollView: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#64748b', fontSize: 14, marginTop: 12, fontWeight: '600' },
  errorText: { color: '#ef4444', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  
  // --- Header ---
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

  // --- Hero Section ---
  profileHero: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 30,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 20,
  },
  avatarGlow: {
    width: 124,
    height: 124,
    borderRadius: 62,
    padding: 3, // Glow border thickness
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 20,
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#0a0e1a',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  editBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#FFD700',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0a0e1a',
  },
  userInfo: {
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playerName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  countryFlag: {
    fontSize: 24,
  },
  rankContainer: {
    marginTop: 12,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    gap: 8,
  },
  rankIcon: {
    fontSize: 18,
  },
  rankText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  // --- Dashboard ---
  dashboard: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 16,
  },
  statsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 2,
    overflow: 'hidden',
    marginBottom: 20,
  },
  gameTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 22,
    margin: 6,
    padding: 4,
  },
  gameTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 18,
  },
  activeGameTab: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  gameTabText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  activeGameTabText: {
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    paddingVertical: 24,
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // --- Actions ---
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,215,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionTextContent: {
    flex: 1,
  },
  actionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  actionSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    gap: 10,
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
});