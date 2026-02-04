// whot-core/computer.ts
import { Card, GameState, CardSuit } from "../core/types";
import { isValidMoveRule1 } from "../core/rules";   // Rule 1 logic
import { isValidMoveRule2 } from "../core/rules2";                 // Rule 2 logic



export const chooseComputerSuit = (hand: Card[]): CardSuit => {
  const suitCounts: Record<string, number> = {
    circle: 0,
    triangle: 0,
    cross: 0,
    square: 0,
    star: 0,
  };

  // Count suits in hand (ignore Whot cards for counting)
  hand.forEach((card) => {
    if (card.suit !== "whot") {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }
  });

  // Find the suit with the highest count
  let bestSuit: CardSuit = "circle"; // Default
  let maxCount = -1;

  (Object.keys(suitCounts) as CardSuit[]).forEach((suit) => {
    if (suitCounts[suit] > maxCount) {
      maxCount = suitCounts[suit];
      bestSuit = suit;
    }
  });

  // If hand is empty or only Whots, pick random
  if (maxCount === 0) {
    const suits: CardSuit[] = ["circle", "triangle", "cross", "square", "star"];
    return suits[Math.floor(Math.random() * suits.length)];
  }

  return bestSuit;
};

export const chooseComputerMove = (
  state: GameState,
  playerIndex: number,
  level: 1 | 2 | 3 | 4 | 5
): Card | null => {
  const player = state.players[playerIndex];
  const hand = player.hand;

  // Pick ruleset based on level
  const isRule2 = level >= 3;
  const isValidMove = isRule2 ? isValidMoveRule2 : isValidMoveRule1;

  // Find valid moves
  const validMoves = hand.filter((card) => isValidMove(card, state));

  if (validMoves.length === 0) {
    return null; // No valid move → must pick from market
  }

  switch (level) {
    case 1: {
      // Apprentice → random move
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    case 2: {
      // Knight → prefer matching suit/number
      const topCard = state.pile[state.pile.length - 1];
      const preferred = validMoves.filter(
        (c) => c.suit === topCard.suit || c.number === topCard.number
      );
      return preferred.length > 0
        ? preferred[Math.floor(Math.random() * preferred.length)]
        : validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    case 3: {
      // Warrior → save specials, play normals first
      const normals = validMoves.filter(
        (c) => c.suit !== "whot" && ![1, 2, 8, 14, 20].includes(c.number)
      );
      return normals.length > 0 ? normals[0] : validMoves[0];
    }

    case 4: {
      // Master → block opponent if they’re close to winning
      const opponent = state.players[(playerIndex + 1) % state.players.length];
      if (opponent.hand.length <= 2) {
        const blocking = validMoves.filter((c) =>
          [1, 2, 8, 14, 20].includes(c.number) || c.suit === "whot"
        );
        if (blocking.length > 0) return blocking[0];
      }
      return validMoves[0];
    }

    case 5: {
      // Alpha → strategic, play suit with most cards
      const suitCounts: Record<string, number> = {};
      hand.forEach((c) => {
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
      });
      const bestSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

      const strategic = validMoves.filter((c) => c.suit === bestSuit);
      if (strategic.length > 0) return strategic[0];

      return validMoves[0];
    }
  }
};
