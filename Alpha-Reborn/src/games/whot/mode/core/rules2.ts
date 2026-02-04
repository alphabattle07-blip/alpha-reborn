// rule2.ts
import { Card, GameState } from "./types"; // ✅ FIXED: Import from core/types.ts

/**
 * Check if a move is valid in Rule 2.
 */
export const isValidMoveRule2 = (card: Card, state: GameState): boolean => {
  if (state.pile.length === 0) return true;
  const topCard = state.pile[state.pile.length - 1];

  // If this player is forced to draw, they cannot play any card.
  if (
    state.pendingAction?.type === "draw" &&
    state.pendingAction.playerIndex === state.currentPlayer
  ) {
    return false;
  }

  // If this player is in a continuation sequence...
  if (
    state.pendingAction?.type === "continue" &&
    state.pendingAction.playerIndex === state.currentPlayer
  ) {
    const specialCard = state.lastPlayedCard || topCard; // The card that triggered this

    // For 'Hold On' (1), any valid play is allowed
    if (specialCard.number === 1) {
      return card.suit === specialCard.suit || card.number === specialCard.number;
    }

    // For 'Pick 2' (2) and 'General Market' (14), continuation MUST match suit
    if (specialCard.number === 2 || specialCard.number === 14) {
      // ✅ --- REVERTED LOGIC --- ✅
      // Now, you only need to match the suit.
      // You CAN play a 2 on a 2, or a 14 on a 14.
      return card.suit === specialCard.suit;
    }
  }

  // Default validation
  return card.suit === topCard.suit || card.number === topCard.number;
};

/**
 * Apply Rule 2 effects.
 */
export const applyCardEffectRule2 = (
  card: Card,
  state: GameState,
  playerIndex: number
): GameState => {
  const newState: GameState = { ...state };

  const getNextPlayerIndex = (currentIdx: number, steps: number = 1) => {
    return (
      (currentIdx + newState.direction * steps + newState.players.length) %
      newState.players.length
    );
  };

  const opponentIndex = getNextPlayerIndex(playerIndex, 1);

  // --- Apply Card Effect and determine next state ---
  switch (card.number) {
    case 1: // Hold On
      newState.currentPlayer = playerIndex; // Same player
      newState.pendingAction = { type: "continue", playerIndex: playerIndex };
      break;

    case 2: // Pick Two
      newState.currentPlayer = playerIndex; // Same player
      newState.pendingAction = {
        type: "draw",
        playerIndex: opponentIndex,
        count: 2,
        returnTurnTo: playerIndex, // ✅ FIXED: Added this required property
      };
      break;

    case 14: // General Market
      newState.currentPlayer = playerIndex; // Same player
      newState.pendingAction = {
        type: "draw",
        playerIndex: opponentIndex,
        count: 1,
        returnTurnTo: playerIndex, // ✅ FIXED: Added this required property
      };
      break;

    default: // Normal card
      // Playing a normal card *ends* any sequence.
      newState.currentPlayer = getNextPlayerIndex(playerIndex, 1);
      newState.pendingAction = null;
      break;
  }

  // --- Update State ---
  newState.pile = [...newState.pile, card];
  newState.lastPlayedCard = card; // Store this for validation

  // Remove card from player's hand
  newState.players = newState.players.map((p, idx) =>
    idx === playerIndex
      ? { ...p, hand: p.hand.filter((c) => c.id !== card.id) }
      : p
  );

  return newState;
};