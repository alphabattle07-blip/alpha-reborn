import { generateDeck, shuffleDeck } from "./deck";
// ✅ We import Rule 1 from its file
import { applyCardEffectRule1, isValidMoveRule1 } from "./rules";
import { isValidMoveRule2, applyCardEffectRule2 } from "./rules2";
// ❌ DO NOT IMPORT Rule 2 here. We define it at the bottom of this file.
import {
  Card,
  CardSuit,
  GameState,
  PendingAction,
  Player,
  RuleVersion,
} from "./types";

// =========================================================
// ✅ HELPER FUNCTIONS FOR SCORING (RULE 2)
// =========================================================

/**
 * Calculates the total score of a hand (Sum of card numbers).
 * WHOT (20) counts as 20.
 */
export const calculateHandScore = (hand: Card[]): number => {
  return hand.reduce((total, card) => total + card.number, 0);
};

/**
 * Handles the Game Over state when the Market is empty in Rule 2.
 * The player with the LOWEST score wins.
 */

/**
 * Triggers the "Market Exhausted" state in Rule 2.
 * This pauses the game to show scores before declaring a winner.
 */
const triggerMarketExhaustion = (state: GameState): GameState => {
  console.log("🚫 Market Empty in Rule 2! Triggering score display...");

  return {
    ...state,
    marketExhausted: true, // Triggers UI to show scores
    pendingAction: null, // Stop all actions
    currentPlayer: -1, // Lock turns
  };
};

/**
 * FINALIZES the game after the score display delay.
 * Calculates scores and declares the winner.
 */
export const finalizeMarketExhaustion = (state: GameState): GameState => {
  console.log("🏁 Finalizing Market Exhaustion... Calculating scores.");

  // Calculate scores for all players
  const playersWithScores = state.players.map((p) => ({
    player: p,
    score: calculateHandScore(p.hand),
  }));

  // Sort by score ascending (Lowest score wins)
  playersWithScores.sort((a, b) => a.score - b.score);

  const winner = playersWithScores[0].player;
  const winnerScore = playersWithScores[0].score;

  console.log(`🏆 Market Runout! Winner: ${winner.name} with score ${winnerScore}`);

  return {
    ...state,
    marketExhausted: false, // Turn off the flag (optional due to winner trigger)
    winner: winner, // This triggers the Game Over modal
  };
};


const reshufflePileIntoMarket = (
  pile: Card[],
  market: Card[]
): { newPile: Card[]; newMarket: Card[] } => {
  if (pile.length <= 1) {
    return { newPile: pile, newMarket: market };
  }

  const topCard = pile[pile.length - 1];
  const cardsToShuffle = pile.slice(0, pile.length - 1);
  const newMarket = shuffleDeck(cardsToShuffle);

  console.log(
    `♻️ Reshuffling ${cardsToShuffle.length} cards from pile to market.`
  );

  return { newPile: [topCard], newMarket: newMarket };
};

// =========================================================
// MAIN GAME LOGIC
// =========================================================

/**
 * Initialize a new game.
 */
export const initGame = (
  playerNames: string[],
  startingHand: number = 5,
  ruleVersion: RuleVersion = "rule1"
): { gameState: GameState; allCards: Card[] } => {
  const fullDeck = shuffleDeck(generateDeck(ruleVersion));
  const players: Player[] = playerNames.map((name, idx) => {
    const hand = fullDeck.slice(idx * startingHand, (idx + 1) * startingHand);
    return { id: `player-${idx}`, name, hand };
  });

  const dealtCards = players.length * startingHand;
  const market = fullDeck.slice(dealtCards);

  let firstCard: Card;
  let initialMarket: Card[];
  let pile: Card[] = [];

  // Find the first non-special card to start the pile
  const specialNums =
    ruleVersion === "rule1" ? [1, 2, 5, 8, 14, 20] : [1, 2, 14];
  let firstCardIndex = -1;

  for (let i = 0; i < market.length; i++) {
    if (!specialNums.includes(market[i].number)) {
      firstCardIndex = i;
      break;
    }
  }

  if (firstCardIndex === -1) {
    // No non-special cards? Use first card.
    firstCardIndex = 0;
  }

  firstCard = market[firstCardIndex];
  initialMarket = [
    ...market.slice(0, firstCardIndex),
    ...market.slice(firstCardIndex + 1),
  ];
  pile = [firstCard];

  const gameState: GameState = {
    players,
    market: initialMarket!,
    pile,
    currentPlayer: 0,
    direction: 1,
    ruleVersion,
    // Init Rule 1 state
    pendingPick: 0,
    calledSuit: undefined,
    lastPlayedCard: firstCard, // The first pile card is the 'last played'
    pendingAction: null,
    // Init Rule 2 state
    mustPlayNormal: false,
    winner: null,
  };

  return { gameState, allCards: fullDeck };
};

/**
 * Select ruleset dynamically.
 */
const selectRuleSet = (ruleVersion: RuleVersion) => {
  return ruleVersion === "rule1"
    ? { isValidMove: isValidMoveRule1, applyCardEffect: applyCardEffectRule1 }
    : { isValidMove: isValidMoveRule2, applyCardEffect: applyCardEffectRule2 };
};

/**
 * Handle a player playing a card.
 */
export const playCard = (
  state: GameState,
  playerIndex: number,
  card: Card
): GameState => {
  const { isValidMove, applyCardEffect } = selectRuleSet(state.ruleVersion);

  if (!isValidMove(card, state)) {
    console.log("Invalid move based on state:", state.pendingAction);
    throw new Error("Invalid move");
  }

  // 1. Apply the move
  let newState = applyCardEffect(card, state, playerIndex);

  // 2. CHECK FOR WINNER IMMEDIATELY (Empty Hand)
  const player = newState.players[playerIndex];

  if (player.hand.length === 0) {
    console.log(`🏆 GAME OVER! Winner is ${player.name}`);
    return {
      ...newState,
      winner: player,
      pendingAction: null,
    };
  }

  return newState;
};

/**
 * Handle a player picking from the market.
 */
export const pickCard = (
  state: GameState,
  playerIndex: number
): { newState: GameState; drawnCards: Card[] } => {
  const { pendingAction, pendingPick } = state;

  // --- Rule 2 Logic ---
  if (state.ruleVersion === "rule2") {
    // Case A: Forced Draw (Defeat)
    if (
      state.pendingAction?.type === "draw" &&
      state.pendingAction.playerIndex === playerIndex
    ) {
      return { newState: state, drawnCards: [] };
    }

    const market = [...state.market];

    // Case B: Market Already Empty (User clicked empty slot)
    if (market.length === 0) {
      const endGameState = triggerMarketExhaustion(state);
      return { newState: endGameState, drawnCards: [] };
    }

    // Case C: Normal Draw
    const drawnCards = market.splice(0, 1); // Draw 1
    const newHand = [...drawnCards, ...state.players[playerIndex].hand];

    const nextPlayer = (playerIndex + state.direction + state.players.length) % state.players.length;

    let preservedPendingAction = null;
    if (state.pendingAction?.type === 'draw' && state.pendingAction.playerIndex === nextPlayer) {
      preservedPendingAction = state.pendingAction;
    }

    // Create the state with the new hand
    const stateWithCardDrawn = {
      ...state,
      market,
      players: state.players.map((p, idx) =>
        idx === playerIndex ? { ...p, hand: newHand } : p
      ),
      currentPlayer: nextPlayer, // Draw always ends turn in Rule 2
      pendingAction: preservedPendingAction,
      lastPlayedCard: null,
    };

    // ✅ CHECK IF MARKET BECAME EMPTY AFTER DRAWING
    if (market.length === 0) {
      console.log("⚡ Market just ran out after pick! Ending game...");
      const endGameState = triggerMarketExhaustion(stateWithCardDrawn);
      return { newState: endGameState, drawnCards };
    }

    return { newState: stateWithCardDrawn, drawnCards };
  }

  // --- Rule 1 Logic ---
  if (
    pendingAction?.type === "defend" &&
    pendingAction.playerIndex === playerIndex
  ) {
    // ✅ FIX: Convert "defend" to "draw" logic
    // This tells the UI: "The player accepted defeat, now force them to draw."
    const newState: GameState = {
      ...state,
      pendingAction: {
        ...pendingAction,
        type: "draw", // Switch type
        // Preserve count, playerIndex, and returnTurnTo
      } as any,
    };

    // We return drawnCards as empty [] because the UI's 
    // runForcedDrawSequence will handle the actual drawing animation.
    return { newState, drawnCards: [] };
  }

  if (
    !pendingAction ||
    (pendingAction?.type === "continue" &&
      pendingAction.playerIndex === playerIndex)
  ) {
    const market = [...state.market];

    // ✅ If market is empty, return early. The UI will handle the reshuffle.
    if (market.length === 0) {
      // The user can't draw, but we pass the turn if they were supposed to.
      // This prevents the game from getting stuck.
      const newState = {
        ...state,
        currentPlayer:
          (playerIndex + state.direction + state.players.length) %
          state.players.length,
        pendingAction: null,
        pendingPick: 0,
        lastPlayedCard: null,
      };
      return { newState, drawnCards: [] };
    }

    const drawnCards = market.splice(0, 1);
    const newHand = [...drawnCards, ...state.players[playerIndex].hand];

    const newState: GameState = {
      ...state,
      market,
      players: state.players.map((p, idx) =>
        idx === playerIndex ? { ...p, hand: newHand } : p
      ),
      currentPlayer:
        (playerIndex + state.direction + state.players.length) %
        state.players.length,
      pendingAction: null,
      pendingPick: 0,
      lastPlayedCard: null,
    };
    return { newState, drawnCards };
  }

  return { newState: state, drawnCards: [] };
};

/**
 * Handle a player calling a suit after WHOT.
 */
export const callSuit = (
  state: GameState,
  playerIndex: number,
  suit: CardSuit
): GameState => {
  if (
    state.pendingAction?.type !== "call_suit" ||
    state.pendingAction.playerIndex !== playerIndex
  ) {
    throw new Error("Not a valid time to call suit.");
  }

  const { nextAction } = state.pendingAction;

  if (nextAction === "pass") {
    const nextPlayer =
      (playerIndex + state.direction + state.players.length) %
      state.players.length;
    return {
      ...state,
      calledSuit: suit,
      currentPlayer: nextPlayer,
      pendingAction: null,
    };
  } else {
    return {
      ...state,
      calledSuit: suit,
      currentPlayer: playerIndex,
      pendingAction: {
        type: "continue",
        playerIndex: playerIndex,
      },
    };
  }
};

/**
 * Executes a single forced draw action.
 */
export const executeForcedDraw = (
  state: GameState
): { newState: GameState; drawnCard: Card | null } => {
  if (state.pendingAction?.type !== "draw") {
    return { newState: state, drawnCard: null };
  }

  const { playerIndex, count, returnTurnTo } = state.pendingAction;

  // If market is ALREADY empty, let the auto-refill handle it.
  if (state.market.length === 0) {
    console.log("Market is empty during a forced draw. Waiting for refill.");
    // We don't change state here, just signal that no card was drawn.
    // The pendingAction remains, and the game will re-evaluate.
    return { newState: state, drawnCard: null };
  }

  const market = [...state.market];
  const drawnCard = market.splice(0, 1)[0];

  const newHand = [drawnCard, ...state.players[playerIndex].hand];
  const remainingCount = count - 1;

  // ✅ CHECK IF MARKET BECAME EMPTY AFTER THIS DRAW
  if (state.ruleVersion === "rule2" && market.length === 0) {
    console.log("⚡ Market just ran out during forced draw! Ending game...");

    const tempState: GameState = {
      ...state,
      market,
      players: state.players.map((p, idx) =>
        idx === playerIndex ? { ...p, hand: newHand } : p
      ),
    };

    const endGameState = triggerMarketExhaustion(tempState);
    return { newState: endGameState, drawnCard };
  }

  let newPendingAction: PendingAction | null;

  if (remainingCount > 0) {
    newPendingAction = {
      ...state.pendingAction,
      count: remainingCount,
    };

    const newState: GameState = {
      ...state,
      market,
      players: state.players.map((p, idx) =>
        idx === playerIndex ? { ...p, hand: newHand } : p
      ),
      pendingAction: newPendingAction,
    };
    return { newState, drawnCard };

  } else {
    const nextPlayer = returnTurnTo !== undefined ? returnTurnTo : playerIndex;

    const newState: GameState = {
      ...state,
      market,
      players: state.players.map((p, idx) =>
        idx === playerIndex ? { ...p, hand: newHand } : p
      ),
      currentPlayer: nextPlayer,
      pendingAction: null,
      lastPlayedCard: null,
    };
    return { newState, drawnCard };
  }
};

export const checkWinner = (state: GameState): Player | null => {
  return state.players.find((p) => p.hand.length === 0) || null;
};

/**
 * ✅ This function is now EXPORTED and will be called by the UI *after* the reshuffle animation.
 */
export const getReshuffledState = (state: GameState): GameState => {
  const { newPile, newMarket } = reshufflePileIntoMarket(state.pile, state.market);
  return {
    ...state,
    pile: newPile,
    market: newMarket,
  };
};



