import { getRankFromRating } from '../../../../../utils/rank';
import { Ionicons } from '@expo/vector-icons';
import React, { useState, useEffect } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { WhotTimerRing } from './WhotTimerRing';

interface Props {
  name: string;
  rating: number;
  cardCount: number;
  avatar?: string | null;
  country?: string;
  isAI?: boolean;
  isCurrentPlayer?: boolean;
  showCardCount?: boolean;
  style?: any; // Allow style override
  // Timer props
  turnStartTime?: number;
  turnDuration?: number;
  warningYellowAt?: number;
  warningRedAt?: number;
  serverTimeOffset?: number;
}

const WhotPlayerProfile = ({
  name,
  rating,
  cardCount,
  avatar,
  country = 'CA',
  isAI = false,
  isCurrentPlayer = false,
  showCardCount = true,
  style,
  turnStartTime,
  turnDuration,
  warningYellowAt,
  warningRedAt,
  serverTimeOffset = 0,
}: Props) => {
  const { width, height } = useWindowDimensions();
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    setIsLandscape(width > height);
  }, [width, height]);

  const displayName = name.split('..')[0]; // Clean up the name
  const displayAvatar = avatar || `https://ui-avatars.com/api/?name=${displayName}&background=0D8ABC&color=fff`;
  const rank = getRankFromRating(rating) || { icon: '🌱', level: 'Unranked' };

  return (
    <View style={[
      styles.container,
      isLandscape && styles.containerLandscape,
      style // Apply override last
    ]}>

      {/* 1. Player Name */}
      <View style={styles.nameRow}>
        <Text style={[styles.playerName, isLandscape && styles.textLandscape]}>
          {displayName}
        </Text>
        {isAI && (
          <Ionicons
            name="hardware-chip-outline"
            size={isLandscape ? 12 : 14}
            color="#0ff"
            style={{ marginLeft: 4 }}
          />
        )}
      </View>

      {/* 2. Avatar + Card Count Badge + Timer Ring */}
      <View style={styles.profileWrapper}>

        {/* The Timer Ring (Under the Avatar) */}
        <WhotTimerRing
          isActive={isCurrentPlayer}
          turnStartTime={turnStartTime}
          turnDuration={turnDuration}
          warningYellowAt={warningYellowAt}
          warningRedAt={warningRedAt}
          serverTimeOffset={serverTimeOffset}
          size={isLandscape ? 58 : 72}
          strokeWidth={isLandscape ? 3 : 4}
        />

        <View style={[
          styles.avatarContainer,
          isLandscape && styles.avatarContainerLandscape,
          isCurrentPlayer && styles.currentPlayerAvatar
        ]}>
          <Image source={{ uri: displayAvatar }} style={styles.avatar} />
        </View>

        {/* The Badge (Card Count) */}
        {showCardCount && (
          <View style={[styles.badge, isLandscape && styles.badgeLandscape]}>
            <Text style={[styles.badgeText, isLandscape && styles.badgeTextLandscape]}>
              {cardCount}
            </Text>
          </View>
        )}
      </View>

      {/* 3. Rating Info */}
      <View style={styles.ratingContainer}>

        {/* Row: Icon + Name */}
        <View style={styles.ratingRow}>
          <Text style={[styles.ratingIcon, isLandscape && styles.textLandscape]}>
            {rank.icon}
          </Text>
          <Text style={[styles.ratingName, isLandscape && styles.textSmallLandscape]}>
            {rank.level}
          </Text>
        </View>

        {/* Rating Number (Below the row) */}
        <Text style={[styles.ratingNumber, isLandscape && styles.textSmallLandscape]}>
          {rating}
        </Text>

      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  // --- Containers ---
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: "70%",
    top: -120,
    width: 110, // Slightly wider to accommodate side-by-side text
  },
  containerLandscape: {
    marginRight: "74%",
    top: 35,
    transform: [{ scale: 1 }],
  },

  // --- 1. Name Styles ---
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    zIndex: 10,
  },
  playerName: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 15,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
  },

  // --- 2. Avatar Styles ---
  profileWrapper: {
    position: "relative",
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "#ccc",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  avatarContainerLandscape: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },

  // Active Player Highlight
  currentPlayerAvatar: {
    borderColor: '#FFD700', // Gold border
    shadowColor: "#FFD700",
    elevation: 15,
  },

  // Badge Styles
  badge: {
    position: "absolute",
    top: 0,
    right: -4,
    backgroundColor: "#8B0000",
    borderWidth: 2,
    borderColor: "#FFF",
    borderRadius: 8,
    minWidth: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    elevation: 6,
    zIndex: 20,
  },
  badgeLandscape: {
    minWidth: 18,
    height: 18,
    right: -2,
    borderWidth: 1.5,
  },
  badgeText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
  },
  badgeTextLandscape: {
    fontSize: 10,
  },

  // --- 3. Rating Styles ---
  ratingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingRow: {
    flexDirection: 'row', // Side by side
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4, // Space between Icon and Name
    marginBottom: 0,
  },
  ratingIcon: {
    fontSize: 16,
    textAlign: 'center',
  },
  ratingName: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ratingNumber: {
    color: "#FFD700", // Gold
    fontWeight: "bold",
    fontSize: 11,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
    marginTop: 1,
  },

  // Landscape Text Overrides
  textLandscape: {
    fontSize: 13,
  },
  textSmallLandscape: {
    fontSize: 10,
  },
});

export default WhotPlayerProfile;