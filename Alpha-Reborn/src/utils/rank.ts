// rank.ts
export const getRankFromRating = (rating: number) => {
  if (rating >= 2250) {
    return { level: 'Alpha', icon: '🔱' };
  }
  if (rating >= 2000) {
    return { level: 'Master', icon: '👑' };
  }
  if (rating >= 1750) {
    return { level: 'Warrior', icon: '⚔️' };
  }
  if (rating >= 1500) {
    return { level: 'Knight', icon: '🛡️' };
  }
  if (rating >= 1250) {
    return { level: 'Apprentice', icon: '🎓' };
  }
  if (rating < 1250) {
  return { level: 'Rookie', icon: '🌱' };
}
};
