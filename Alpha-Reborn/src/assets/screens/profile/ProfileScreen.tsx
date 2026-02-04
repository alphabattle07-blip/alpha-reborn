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
} from 'react-native';
import { useNavigation, NavigationProp, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';
import { useAppDispatch, useAppSelector } from '../../../../scripts/store/hooks';
import { fetchUserProfile } from '../../../../scripts/store/thunks/authThunks';
import { fetchAllGameStatsThunk } from '../../../../scripts/store/thunks/gameStatsThunks';
import { getFlagEmoji } from '../../utils/flags';
import { getRankFromRating } from '../../utils/rank';
import { ArrowLeft, User, Camera, LogOut } from 'lucide-react-native';
import { UserProfile, GameStats } from '../../../services/api/authService';
import {
  requestMediaLibraryPermissionsAsync,
  launchImageLibraryAsync,
  MediaTypeOptions
} from 'expo-image-picker';
import { updateUserProfileThunk, logoutUser } from '../../../../scripts/store/thunks/authThunks';
import Toast from 'react-native-toast-message';

type ProfileScreenProps = {
  isOwnProfile?: boolean;
};

type ProfileScreenNavigationProp = NavigationProp<RootStackParamList>;
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
    { id: 'chess', title: 'Chess' },
    { id: 'ayo', title: 'Ayo' },
    { id: 'whot', title: 'Whot' },
    { id: 'ludo', title: 'Ludo' },
    { id: 'draughts', title: 'Draughts' },
  ];

  // --- RENDER PREPARATION ---

  // MERGE STRATEGY: Try to find stats in the Redux Slice first. 
  // If not found (e.g. fetch failed), fall back to the `gameStats` array inside the Profile object.
  const profileEmbeddedStats = playerToShow?.gameStats || [];

  const statsToRender = DEFAULT_GAMES.map(game => {
    // 1. Try Redux Slice
    let existingStat = gameStatsArray.find(stat => stat.gameId === game.id);

    // 2. If missing, try Profile Embedded Stats (mapped to match interface)
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
          <User size={64} color="gray" />
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
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2E86DE" />
        }
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ArrowLeft size={24} />
          </TouchableOpacity>
          <Text style={styles.headerText}>Profile</Text>
        </View>

        <View style={styles.profileSection}>
          <TouchableOpacity
            onPress={pickImage}
            disabled={!isOwnProfile || uploading}
            style={styles.avatarContainer}
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <User size={48} color="gray" />
              </View>
            )}
            {isOwnProfile && (
              <View style={styles.editBadge}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Camera size={16} color="#fff" />
                )}
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.playerName}>{name}</Text>
          <Text style={styles.countryFlag}>{getFlagEmoji(country)}</Text>

          <View style={styles.rankRow}>
            <Text style={styles.rankIcon}>{rank?.icon ?? '🌱'}</Text>
            <Text style={styles.rankText}>{rank?.level ?? 'Rookie'}</Text>
          </View>
        </View>

        <View style={styles.coinSection}>
          {selectedGame && (
            <View style={styles.rCoinBlock}>
              <Text style={styles.coinHeader}>R-Coin: {selectedGame.title}</Text>
              <Text style={styles.coinValue}>{selectedGame.rating ?? 1000}</Text>
            </View>
          )}
        </View>

        <View style={styles.gameListContainer}>
          <Text style={styles.gameListTitle}>Games</Text>
          <ScrollView horizontal style={styles.gamesScrollView} showsHorizontalScrollIndicator={false}>
            {/* Even if loading, if we have rendered stats (e.g. from profile fallback), show them */}
            {statsToRender.length === 0 ? (
              <Text style={styles.noGamesText}>No games played yet</Text>
            ) : (
              <>
                {statsToRender.map((s) => (
                  <TouchableOpacity
                    key={s.gameId}
                    style={[
                      styles.gameChip,
                      selectedGameId === s.gameId && styles.selectedGameChip
                    ]}
                    onPress={() => setSelectedGameId(s.gameId)}
                  >
                    <Text style={[
                      styles.gameChipText,
                      selectedGameId === s.gameId && styles.selectedGameChipText
                    ]}>
                      {s.title}
                    </Text>
                  </TouchableOpacity>
                )
                )}
              </>
            )}
          </ScrollView>
        </View>

        {selectedGame && (
          <View style={styles.statBlock}>
            <Text style={styles.statTitle}>{selectedGame.title} Stats</Text>
            <View style={styles.detailedStatsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Wins</Text>
                <Text style={styles.statValue}>{selectedGame.wins ?? 0}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Losses</Text>
                <Text style={styles.statValue}>{selectedGame.losses ?? 0}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Draws</Text>
                <Text style={styles.statValue}>{selectedGame.draws ?? 0}</Text>
              </View>
            </View>
            <View style={styles.ratingBlock}>
              <Text style={styles.statLabel}>R-Coin</Text>
              <Text style={styles.statValue}>{selectedGame.rating ?? 1000}</Text>
            </View>
          </View>
        )}

        {isOwnProfile && (
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollView: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 30 },
  button: { backgroundColor: '#2E86DE', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8, marginTop: 20 },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerText: { marginLeft: 12, fontSize: 20, fontWeight: '700' },
  profileSection: { alignItems: 'center', padding: 16 },
  avatarContainer: { position: 'relative', marginBottom: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: '#E5E7EB' },
  avatarPlaceholder: { backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#2E86DE',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  playerName: { fontSize: 22, fontWeight: 'bold' },
  countryFlag: { marginTop: 4, fontSize: 18 },
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, marginTop: 12, backgroundColor: '#F3F4F6' },
  rankIcon: { fontSize: 18, marginRight: 6 },
  rankText: { fontWeight: '600', fontSize: 16 },
  coinSection: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16, marginBottom: 16 },
  rCoinBlock: { padding: 12, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', marginRight: 16, minWidth: 120 },
  coinHeader: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 },
  coinValue: { fontSize: 20, fontWeight: 'bold', color: '#10B981' },
  gameListContainer: { paddingHorizontal: 16, marginBottom: 16 },
  gameListTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  gamesScrollView: { flexDirection: 'row' },
  gameChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#E5E7EB', marginRight: 10 },
  selectedGameChip: { backgroundColor: '#2E86DE' },
  gameChipText: { color: '#4B5563', fontWeight: '600' },
  selectedGameChipText: { color: '#fff' },
  statBlock: { marginTop: 24, width: '100%', padding: 16, backgroundColor: '#F9FAFB', borderRadius: 10, alignItems: 'center' },
  statTitle: { fontWeight: '700', fontSize: 18, marginBottom: 8 },
  detailedStatsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  statItem: { alignItems: 'center', marginHorizontal: 10 },
  statLabel: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginTop: 4 },
  ratingBlock: { marginTop: 16, alignItems: 'center' },
  noGamesText: { fontSize: 16, color: '#6B7280', textAlign: 'center', padding: 20 },
  loadingText: { fontSize: 16, color: '#666', marginTop: 10 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    paddingVertical: 15,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});