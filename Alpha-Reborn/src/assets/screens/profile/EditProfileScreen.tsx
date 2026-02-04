// import React, { useState } from 'react';
// import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet } from 'react-native';
// import * as ImagePicker from 'expo-image-picker';
// import { getFlagEmoji } from '@/utils/flags';
// import { getRankFromRating } from '@/utils/rank';
// import { Star, Medal, ArrowLeft } from 'lucide-react-native';

// export default function ProfileScreen({ player, isOwnProfile, currentGameMode, onAvatarChange }) {
//   const [avatar, setAvatar] = useState(player.avatar);
//   const rank = getRankFromRating(player.rating);
//   const showMcoin = ['Warrior', 'Master', 'Alpha'].includes(rank.level);
//   const visibleStats = isOwnProfile ? player.stats : { [currentGameMode]: player.stats[currentGameMode] };

//   const handlePickImage = async () => {
//     const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
//     if (permissionResult.granted === false) {
//       alert('Permission to access camera roll is required!');
//       return;
//     }

//     const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
//     if (!result.canceled) {
//       const uri = result.assets[0].uri;
//       setAvatar(uri);
//       if (onAvatarChange) onAvatarChange(uri);
//     }
//   };

//   return (
//     <ScrollView style={styles.container}>
//       <View style={styles.headerRow}>
//         <TouchableOpacity>
//           <ArrowLeft size={24} />
//         </TouchableOpacity>
//         <Text style={styles.headerText}>Profile</Text>
//       </View>

//       <View style={styles.profileSection}>
//         <TouchableOpacity onPress={isOwnProfile ? handlePickImage : null}>
//           <Image
//             source={avatar ? { uri: avatar } : require('@/assets/avatar-placeholder.png')}
//             style={styles.avatar}
//           />
//         </TouchableOpacity>
//         <Text style={styles.name}>{player.name}</Text>
//         <Text style={styles.country}>{getFlagEmoji(player.country)}</Text>
//         <View style={styles.rankRow}>
//           <Text style={styles.rankIcon}>{rank.icon}</Text>
//           <Text style={styles.rankText}>{rank.level}</Text>
//         </View>

//         <View style={styles.coinRow}>
//           <Star size={16} color="gold" />
//           <Text style={styles.coinText}>{player.rating} R-coin</Text>
//         </View>

//         <View style={styles.coinRow}>
//           <Medal size={16} color="purple" />
//           <Text style={styles.coinText}>{showMcoin ? `${player.mcoin} M-coin` : 'Unavailable'}</Text>
//         </View>

//         {isOwnProfile && (
//           <TouchableOpacity style={styles.editButton}>
//             <Text style={styles.editButtonText}>Edit Profile</Text>
//           </TouchableOpacity>
//         )}
//       </View>

//       <View style={styles.section}>
//         <Text style={styles.sectionTitle}>Game Stats</Text>
//         {Object.entries(visibleStats).map(([mode, stat]) => (
//           <View key={mode} style={styles.statRow}>
//             <Text style={styles.statMode}>{mode.toUpperCase()}</Text>
//             <Text style={styles.statText}>Wins: {stat.wins}  Losses: {stat.losses}  Draws: {stat.draws}</Text>
//           </View>
//         ))}
//       </View>

//       <View style={styles.section}>
//         <Text style={styles.sectionTitle}>Recent Matches</Text>
//         <Text style={styles.sectionText}>Match logs will appear here.</Text>
//       </View>

//       <View style={styles.section}>
//         <Text style={styles.sectionTitle}>Achievements</Text>
//         <Text style={styles.sectionText}>Highlight badges, ranks, and trophies.</Text>
//       </View>
//     </ScrollView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     padding: 16,
//     backgroundColor: '#fff',
//   },
//   headerRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 16,
//   },
//   headerText: {
//     marginLeft: 8,
//     fontSize: 20,
//     fontWeight: 'bold',
//   },
//   profileSection: {
//     alignItems: 'center',
//     marginBottom: 24,
//   },
//   avatar: {
//     width: 96,
//     height: 96,
//     borderRadius: 48,
//     marginBottom: 8,
//   },
//   name: {
//     fontSize: 18,
//     fontWeight: '600',
//   },
//   country: {
//     fontSize: 14,
//     color: 'gray',
//   },
//   rankRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginTop: 8,
//   },
//   rankIcon: {
//     fontSize: 18,
//     marginRight: 4,
//   },
//   rankText: {
//     fontSize: 16,
//     color: '#444',
//   },
//   coinRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginTop: 4,
//   },
//   coinText: {
//     marginLeft: 6,
//     fontSize: 14,
//   },
//   editButton: {
//     marginTop: 12,
//     backgroundColor: '#3B82F6',
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//     borderRadius: 20,
//   },
//   editButtonText: {
//     color: 'white',
//     fontWeight: '500',
//   },
//   section: {
//     marginBottom: 20,
//   },
//   sectionTitle: {
//     fontSize: 16,
//     fontWeight: '600',
//     marginBottom: 8,
//   },
//   sectionText: {
//     fontSize: 14,
//     color: 'gray',
//   },
//   statRow: {
//     marginBottom: 8,
//   },
//   statMode: {
//     fontWeight: '500',
//   },
//   statText: {
//     fontSize: 14,
//     color: '#666',
//   },
// });
