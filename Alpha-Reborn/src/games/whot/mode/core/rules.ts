// rule
import { Card, GameState, CardSuit } from "./types";

/**
 * Check if a move is valid in "Rule 1".
 */
export const isValidMoveRule1 = (card: Card, state: GameState): boolean => {
  const { pile, pendingAction, lastPlayedCard, calledSuit } = state;
  if (pile.length === 0) return true;

  const topCard = pile[pile.length - 1];
  const cardToMatch = lastPlayedCard || topCard;

  // --- 1. Defense State (Defend pending for current player) ---
  if (
    pendingAction?.type === "defend" &&
    pendingAction.playerIndex === state.currentPlayer
  ) {
    // ✅ DEFENSE LOGIC:
    // You can ONLY play the exact number that is attacking you.
    // (e.g., if attacked by 2, you must play 2. If 5, must play 5).
    const attackNumber = lastPlayedCard?.number || topCard.number;
    return card.number === attackNumber;
  }

  // --- 2. Continuation State (after 1, 8, 14, or successful defense) ---
  if (pendingAction?.type === "continue") {
    // WHOT is always allowed
    if (card.number === 20) return true;

    // ✅ FIX: Allow stacking 8s (Suspension) just like 1s (Hold On)
    // If continuing after Hold-On (1) or Suspension (8), we can play:
    // - The same number (stacking)
    // - The same suit (ending the chain)
    if (cardToMatch.number === 1 || cardToMatch.number === 8) {
      return (
        card.number === cardToMatch.number || card.suit === cardToMatch.suit
      );
    }

    // If a suit was just called by WHOT, must follow that suit
    if (cardToMatch.number === 20 && calledSuit) {
      return card.suit === calledSuit;
    }

    // Otherwise, must match the SHAPE (suit) of the card that started this
    return card.suit === cardToMatch.suit;
  }

  // --- 3. Normal Turn ---
  if (!pendingAction) {
    // If WHOT was just played, must follow called suit
    if (topCard.number === 20 && calledSuit) {
      return card.suit === calledSuit || card.number === 20;
    }

    // Standard rule: match suit or number (always applies in normal turn)
    return (
      card.suit === topCard.suit ||
      card.number === topCard.number ||
      card.number === 20
    );
  }

  return false;
};

/**
 * Apply "Rule 1" effects and set the *next* pending action.
 */
export const applyCardEffectRule1 = (
  card: Card,
  state: GameState,
  playerIndex: number
): GameState => {
  const newState: GameState = {
    ...state,
    pile: [...state.pile, card],
    lastPlayedCard: card,
    // Remove card from player's hand
    players: state.players.map((p, idx) =>
      idx === playerIndex
        ? { ...p, hand: p.hand.filter((c) => c.id !== card.id) }
        : p
    ),
  };

  const getNextPlayerIndex = (steps = 1) => {
    return (
      (playerIndex + newState.direction * steps + newState.players.length) %
      newState.players.length
    );
  };

  const opponentIndex = getNextPlayerIndex(1);
  const wasInBattle =
    state.pendingAction?.type === "draw" &&
    state.pendingAction.playerIndex === opponentIndex;

  // Helper to check if we are currently countering an attack
  const isCounteringAttack =
    state.pendingAction?.type === "defend" &&
    state.pendingAction.playerIndex === playerIndex;

  switch (card.number) {
    // --- Group 1: Hold On, Suspension, General Market ---
    case 1: // Hold On
      newState.currentPlayer = playerIndex;
      newState.pendingAction = { type: "continue", playerIndex: playerIndex };
      break;

    case 8: // Suspension
      // ✅ Treated exactly like Hold On (1) for stacking purposes
      newState.currentPlayer = playerIndex;
      newState.pendingAction = { type: "continue", playerIndex: playerIndex };
      break;

    case 14: // General Market
      newState.currentPlayer = opponentIndex; // Pass turn to opponent to draw
      newState.pendingAction = {
        type: "draw",
        playerIndex: opponentIndex,
        count: 1,
        returnTurnTo: playerIndex,
      };
      break;

    // --- Group 2: Pick 2, Pick 3 (Attacks) ---
    case 2: {
      // Pick Two

      // ✅ DEFENSE LOGIC (CANCEL & RESET):
      // If we are currently under attack (defend state) and we played the matching 2...
      if (isCounteringAttack && state.lastPlayedCard?.number === 2) {
        // 1. Cancel the pending action (Attack is neutralized)
        newState.pendingAction = null;
        // 2. Game resets to normal play -> Turn moves to the NEXT player
        newState.currentPlayer = getNextPlayerIndex(1);
        break; // Exit immediately
      }

      // ✅ OFFENSE LOGIC (INITIATE ATTACK):
      // Standard Pick 2 attack (nobody is defending yet, or we are starting a new attack)
      newState.currentPlayer = opponentIndex; // Victim's turn
      newState.pendingAction = {
        type: "defend", // Use "defend" to allow counter-play
        playerIndex: opponentIndex,
        count: 2,
        returnTurnTo: playerIndex,
      };
      break;
    }

    case 5: {
      // Pick Three

      // ✅ DEFENSE LOGIC (CANCEL & RESET):
      // If we are under attack and played the matching 5...
      if (isCounteringAttack && state.lastPlayedCard?.number === 5) {
        // 1. Cancel the pending action
        newState.pendingAction = null;
        // 2. Game resets to normal play -> Turn moves to the NEXT player
        newState.currentPlayer = getNextPlayerIndex(1);
        break; // Exit immediately
      }

      // ✅ OFFENSE LOGIC (INITIATE ATTACK):
      newState.currentPlayer = opponentIndex;
      newState.pendingAction = {
        type: "defend",
        playerIndex: opponentIndex,
        count: 3,
        returnTurnTo: playerIndex,
      };
      break;
    }

    // --- Group 3: WHOT ---
    case 20:
      newState.calledSuit = undefined;
      newState.currentPlayer = playerIndex;
      newState.pendingAction = {
        type: "call_suit",
        playerIndex: playerIndex,
        nextAction: wasInBattle ? "continue" : "pass",
      };
      break;

    // --- Normal Card ---
    default:
      newState.currentPlayer = getNextPlayerIndex(1);
      newState.pendingAction = null;
      newState.lastPlayedCard = null;
      break;
  }

  return newState;
};