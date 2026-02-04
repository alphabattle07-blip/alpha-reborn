// import React from 'react';
// import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';
// import CountryFlag from 'react-native-country-flag';
// import { Ionicons } from '@expo/vector-icons';
// import { usePlayerProfile } from '../../hooks/usePlayerProfile';
// import { useSelector } from 'react-redux';
// import { RootState } from '../../store/index';

// const getRank = (rating: number) => {
//   if (rating >= 1900) return { name: 'Alpha', icon: '🔱' };
//   if (rating >= 1700) return { name: 'Master', icon: '👑' };
//   if (rating >= 1500) return { name: 'Warrior', icon: '🔷' };
//   if (rating >= 1250) return { name: 'Pro', icon: '🟢' };
//   return { name: 'Rookie', icon: '🟤' };
// };

// const PlayerProfileCompact = ({
//   name,
//   country,
//   rating,
//   avatar,
//   timeLeft,
//   isAI = false,
//   score = 0,
//   isActive = false,
//   isOwnProfile = false,
// }: {
//   name: string;
//   country: string;
//   rating: number;
//   avatar?: string | null;
//   timeLeft?: string;
//   isAI?: boolean;
//   score?: number;
//   isActive?: boolean;
//   isOwnProfile?: boolean;
// }) => {
//   const { width, height } = useWindowDimensions();
//   const userProfile = useSelector((state: RootState) => state.user.profile);
//   const { profile, loading, error } = usePlayerProfile();

//   if (isOwnProfile && loading) {
//     return <Text>Loading...</Text>;
//   }

//   if (isOwnProfile && error) {
//     return <Text>Error loading profile</Text>;
//   }

//   const rank = getRank(rating);
//   const displayName = isOwnProfile && userProfile ? userProfile.name : name;
//   const displayAvatar = avatar || 'https://ui-avatars.com/api/?name=' + displayName;
//   const isPortrait = height >= width;

//   return (
//     <View
//       style={[
//         styles.container,
//         isPortrait ? styles.portraitContainer : styles.landscapeContainer,
//       ]}
//     >
//       <View style={styles.avatarContainer}>
//         {isAI ? (
//           <Ionicons
//             name="hardware-chip-outline"
//             size={48}
//             color="#E5E5E5"
//             style={styles.aiIcon}
//           />
//         ) : (
//           <Image source={{ uri: displayAvatar }} style={styles.avatar} />
//         )}
//       </View>

//       <View
//         style={[
//           styles.info,
//           isPortrait ? styles.infoPortrait : styles.infoLandscape,
//         ]}
//       >
//         <View style={styles.row}>
//           <Text style={styles.name}>{displayName}</Text>
//           <CountryFlag isoCode={isAI ? 'NG' : country} size={18} style={styles.flag} />
//         </View>

//         <View style={styles.row}>
//           <Text style={styles.rank}>
//             {rank.icon} {rank.name}
//           </Text>
//         </View>

//         <View style={styles.row}>
//           <Ionicons name="star" size={14} color="#FFD700" />
//           <Text style={styles.rating}> {rating}</Text>
//         </View>

//         <View style={styles.row}>
//           <Ionicons name="diamond" size={14} color="#FFD700" />
//           <Text style={styles.rating}> x{score}</Text>
//         </View>
//       </View>

//       {timeLeft && (
//         <View style={[
//           styles.timerContainer,
//           isActive && styles.activeTimerContainer
//         ]}>
//           <Ionicons
//             name="time-outline"
//             size={14}
//             color={isActive ? "#FFD700" : "#4A90E2"}
//           />
//           <Text style={[
//             styles.timer,
//             isActive && styles.activeTimer
//           ]}> {timeLeft}</Text>
//         </View>
//       )}
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     padding: 5,
//     alignItems: 'center',
//     backgroundColor: 'rgba(0, 0, 0, 0.4)',
//     borderRadius: 12,
//     width: '100%',
//     alignSelf: 'center',
//   },
//   portraitContainer: {
//     flexDirection: 'row',
//   },
//   landscapeContainer: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//   },
//   avatarContainer: {
//     marginRight: 12,
//   },
//   avatar: {
//     width: 52,
//     height: 52,
//     borderRadius: 26,
//     borderWidth: 2,
//     borderColor: 'rgba(255, 255, 255, 0.6)',
//   },
//   info: {
//     flex: 1,
//   },
//   infoPortrait: {
//     flexDirection: 'column',
//   },
//   infoLandscape: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 12,
//   },
//   row: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 4,
//   },
//   name: {
//     color: 'white',
//     fontWeight: 'bold',
//     fontSize: 18,
//     marginRight: 8,
//     textShadowColor: 'rgba(0, 0, 0, 0.8)',
//     textShadowOffset: { width: -1, height: 1 },
//     textShadowRadius: 10,
//   },
//   flag: {
//     borderRadius: 3,
//   },
//   rank: {
//     fontSize: 15,
//     color: '#E5E5E5',
//   },
//   rating: {
//     fontSize: 15,
//     color: '#FFD700',
//     marginLeft: 4,
//   },
//   timerContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginLeft: 12,
//   },
//   activeTimerContainer: {
//     backgroundColor: 'rgba(255, 215, 0, 0.2)',
//     borderRadius: 8,
//     padding: 4,
//     borderWidth: 1,
//     borderColor: '#FFD700',
//   },
//   timer: {
//     fontSize: 15,
//     color: '#4A90E2',
//     marginLeft: 4,
//   },
//   activeTimer: {
//     color: '#FFD700',
//     fontWeight: 'bold',
//   },
//   aiIcon: {
//     width: 52,
//     height: 52,
//     textAlign: 'center',
//     textAlignVertical: 'center',
//   },
// });

// export default PlayerProfileCompact;