import { Card, CardSuit } from "./types"; // ✅ FIXED: Import from core/types.ts

/**
 * Define the card distribution for each suit.
 */
const SUIT_CARDS: { [key in CardSuit]?: number[] } = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
  // 'whot' is handled separately
};

/**
 * Generate a full Whot deck depending on rule version.
 */
export const generateDeck = (
  ruleVersion: "rule1" | "rule2" = "rule1"
): Card[] => {
  const deck: Card[] = [];

  for (const suit in SUIT_CARDS) {
    const cardSuit = suit as CardSuit;
    SUIT_CARDS[cardSuit]?.forEach((num) => {
      deck.push({
        id: `${cardSuit}-${num}`,
        suit: cardSuit,
        number: num,
        rank: `${cardSuit}-${num}`,
      });
    });
  }

  // Add WHOT cards based on rule version
  // Per your file, Rule 2 gets 0 WHOT cards.
  const whotCount = ruleVersion === "rule1" ? 5 : 0;
  for (let i = 1; i <= whotCount; i++) {
    deck.push({
      id: `whot-${i}`,
      suit: "whot",
      number: 20,
      rank: `whot-${i}`,
    });
  }

  return deck;
};

/**
 * Shuffle any deck (Fisher–Yates algorithm).
 */
export const shuffleDeck = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};