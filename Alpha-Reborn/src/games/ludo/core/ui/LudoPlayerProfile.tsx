// LudoPlayerProfile.tsx
import React from 'react';
import { View, Text, StyleSheet, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getRankFromRating } from '../../../../utils/rank';

interface LudoPlayerProfileProps {
    name: string;
    rating: number;
    avatar?: string | null;
    isAI?: boolean;
    isActive?: boolean;
    color?: string;
    score?: number; // E.g. tokens in home
}

const LudoPlayerProfile: React.FC<LudoPlayerProfileProps> = ({
    name,
    rating,
    avatar,
    isAI = false,
    isActive = false,
    color = '#fff',
    score = 0
}) => {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const displayName = name.split('..')[0];
    const displayAvatar = avatar || `https://ui-avatars.com/api/?name=${displayName}&background=0D8ABC&color=fff`;
    const rank = getRankFromRating(rating) || { icon: '🌱', level: 'Unranked' };

    return (
        <View style={[styles.container, isLandscape && styles.containerLandscape]}>
            {/* Row: Avatar + Score Badge */}
            <View style={styles.avatarRow}>
                <View style={styles.profileWrapper}>
                    <View style={[
                        styles.avatarContainer,
                        isLandscape && styles.avatarContainerLandscape,
                        isActive && { borderColor: '#FFD700', elevation: 15, shadowColor: '#FFD700' },
                        !isActive && { borderColor: color }
                    ]}>
                        <Image source={{ uri: displayAvatar }} style={styles.avatar} />
                    </View>

                    {/* Score Badge (Seeds in Home) */}
                    <View style={[styles.badge, isLandscape && styles.badgeLandscape]}>
                        <Text style={[styles.badgeText, isLandscape && styles.badgeTextLandscape]}>
                            {score}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Column: Name, Rank, Rating */}
            <View style={styles.infoColumn}>
                {/* Player Name */}
                <Text style={[styles.playerName, isLandscape && styles.textLandscape]}>
                    {displayName}
                </Text>

                {/* Rank Label + AI Icon */}
                <View style={styles.rankRow}>
                    <Text style={[styles.ratingName, isLandscape && styles.textSmallLandscape]}>
                        {rank.level}
                    </Text>
                    {isAI && (
                        <Ionicons
                            name="hardware-chip-outline"
                            size={isLandscape ? 10 : 12}
                            color="#0ff"
                            style={{ marginLeft: 4 }}
                        />
                    )}
                </View>

                {/* Rating Value */}
                <Text style={[styles.ratingNumber, isLandscape && styles.textSmallLandscape]}>
                    {rating}
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 65,
    },
    containerLandscape: {
        transform: [{ scale: 0.8 }],
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    infoColumn: {
        marginLeft: 10,
        alignItems: 'flex-start',
    },
    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    playerName: {
        color: "#FFF",
        fontWeight: "900",
        fontSize: 14,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 2,
    },
    profileWrapper: {
        position: "relative",
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 3,
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
    },
    avatar: {
        width: "100%",
        height: "100%",
    },
    badge: {
        position: "absolute",
        top: 0,
        right: -4,
        backgroundColor: "#8B0000",
        borderWidth: 2,
        borderColor: "#FFF",
        borderRadius: 8,
        minWidth: 20,
        height: 20,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 4,
        elevation: 6,
        zIndex: 20,
    },
    badgeLandscape: {
        minWidth: 16,
        height: 16,
        right: -2,
    },
    badgeText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 11,
    },
    badgeTextLandscape: {
        fontSize: 9,
    },
    ratingContainer: {
        alignItems: 'center',
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
    },
    ratingIcon: {
        fontSize: 14,
    },
    ratingName: {
        color: "#FFF",
        fontWeight: "700",
        fontSize: 11,
    },
    ratingNumber: {
        color: "#FFD700",
        fontWeight: "bold",
        fontSize: 10,
        marginTop: 1,
    },
    textLandscape: {
        fontSize: 12,
    },
    textSmallLandscape: {
        fontSize: 9,
    },
});

export default LudoPlayerProfile;
