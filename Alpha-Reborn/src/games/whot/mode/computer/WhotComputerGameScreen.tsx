// whotComputerGameScreen.tsx
import { SkFont } from "@shopify/react-native-skia";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Component,
  ErrorInfo,
  ReactNode
} from "react";

import {
  ActivityIndicator,
  Button,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { getCoords } from "../core/coordinateHelper";
import { Card, CardSuit, GameState } from "../core/types";
import AnimatedCardList, {
  AnimatedCardListHandle,
} from "../core/ui/AnimatedCardList";
import MemoizedBackground from "../core/ui/MemoizedBackground";
import WhotSuitSelector from "../core/ui/WhotSuitSelector";
import {
  calculateHandScore,
  executeForcedDraw,
  finalizeMarketExhaustion,
  getReshuffledState,
  initGame,
  pickCard,
  playCard,
} from "../core/game";
import ComputerUI from "./whotComputerUI";
import { WHOT_LEVELS as levels, ComputerLevel } from "../core/types";

import { usePlayerProfile } from "../../../../../scripts/hooks/usePlayerProfile";
import { useSharedValue } from "react-native-reanimated";
import WhotCoreUI from "../core/ui/WhotCoreUI";
import { useWhotFonts } from "../core/ui/useWhotFonts";
import { chooseComputerMove, chooseComputerSuit } from "./whotComputerLogic";
import { WhotAssetManager } from "../core/ui/WhotAssetManager";
import { useNavigation } from "@react-navigation/native";

// Error Boundary for Computer Mode
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class WhotErrorBoundary extends Component<{ children: ReactNode; onGoBack: () => void }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; onGoBack: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Unknown error occurred' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('WhotErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#ef5350', fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>⚠️ Game Error</Text>
          <Text style={{ color: '#FFD700', textAlign: 'center', marginBottom: 20 }}>{this.state.errorMessage}</Text>
          <TouchableOpacity
            style={{ padding: 15, borderWidth: 1, borderColor: '#d32f2f', borderRadius: 8 }}
            onPress={this.props.onGoBack}
          >
            <Text style={{ color: '#ef5350', fontSize: 16, fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}


type GameData = {
  gameState: GameState;
  allCards: Card[];
};

const WhotComputerUI = () => {
  const { width, height } = useWindowDimensions();
  const navigation = useNavigation();
  const isLandscape = width > height;
  const { font: loadedFont, whotFont: loadedWhotFont, areLoaded } =
    useWhotFonts();
  const playerProfile = usePlayerProfile("whot");
  const [gameInstanceId, setGameInstanceId] = useState(0);
  const [readyToRender, setReadyToRender] = useState(false);

  // ✅ STABLE DIMENSIONS
  const [stableWidth, setStableWidth] = useState(width);
  const [stableHeight, setStableHeight] = useState(height);
  const [stableFont, setStableFont] = useState<SkFont | null>(null);
  const [stableWhotFont, setStableWhotFont] = useState<SkFont | null>(null);
  const pileCoords = useMemo(() => {
    return getCoords("pile", { cardIndex: 0 }, stableWidth, stableHeight);
  }, [stableWidth, stableHeight]);

  useLayoutEffect(() => {
    const widthChanged = Math.abs(stableWidth - width) > 1;
    const heightChanged = Math.abs(stableHeight - height) > 1;
    if (widthChanged) setStableWidth(width);
    if (heightChanged) setStableHeight(height);
  }, [width, height, stableWidth, stableHeight]);

  useEffect(() => {
    if (areLoaded && !stableFont && loadedFont && loadedWhotFont) {
      setStableFont(loadedFont);
      setStableWhotFont(loadedWhotFont);
    }
  }, [areLoaded, stableFont, loadedFont, loadedWhotFont]);

  useEffect(() => {
    WhotAssetManager.preload().then(() => {
      setAssetsReady(true);
    });

    const timer = setTimeout(() => {
      setReadyToRender(true);
    }, 800);

    return () => clearTimeout(timer);
  }, []);


  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

  const [computerLevel, setComputerLevel] = useState<ComputerLevel>(
    levels[0].value
  );
  const [game, setGame] = useState<GameData | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [isCardListReady, setIsCardListReady] = useState(false);

  const cardListRef = useRef<AnimatedCardListHandle>(null);
  const [hasDealt, setHasDealt] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);


  const playerHand = useMemo(
    () => game?.gameState.players[0].hand || [],
    [game?.gameState.players[0].hand]
  );

  const marketCardCount = game?.gameState.market.length || 0;

  const computerState = useMemo(() => {
    if (!game) {
      return {
        name: "Computer",
        handLength: 0,
        isCurrentPlayer: false,
      };
    }
    const computerPlayer = game.gameState.players[1];
    const isComputerTurn = game.gameState.currentPlayer === 1;
    return {
      name: computerPlayer.name,
      handLength: computerPlayer.hand.length,
      isCurrentPlayer: isComputerTurn,
    };
  }, [
    game?.gameState.players[1]?.name,
    game?.gameState.players[1]?.hand.length,
    game?.gameState.currentPlayer,
  ]);

  const playerState = useMemo(() => {
    if (!game) {
      return {
        name: playerProfile.name,
        rating: playerProfile.rating,
        country: playerProfile.country,
        avatar: playerProfile.avatar,
        handLength: 0,
        isCurrentPlayer: false,
      };
    }

    return {
      name: playerProfile.name,
      rating: playerProfile.rating,
      country: playerProfile.country,
      avatar: playerProfile.avatar,
      handLength: game.gameState.players[0].hand.length,
      isCurrentPlayer: game.gameState.currentPlayer === 0,
    };
  }, [
    game?.gameState?.players?.[0]?.hand?.length,
    game?.gameState?.currentPlayer,
    playerProfile,
  ]);

  const playerHandLimit = 5;
  const layoutHandSize = 6;
  const isPagingActive = playerHand.length > playerHandLimit;
  const showPagingButton = !!game && isPagingActive;
  const gameRef = useRef(game);
  const isAnimatingRef = useRef(isAnimating);
  const isPagingActiveRef = useRef(isPagingActive);

  const playerHandIdsSV = useSharedValue<string[]>([]);
  const lastHandIdStringRef = useRef<string | null>(null);

  useEffect(() => {
    const newHandIds = playerHand.map((c) => c.id);
    const newHandIdString = newHandIds.join(",");
    if (newHandIdString !== lastHandIdStringRef.current) {
      playerHandIdsSV.value = newHandIds;
      lastHandIdStringRef.current = newHandIdString;
    }
  }, [playerHand]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    isAnimatingRef.current = isAnimating;
  }, [isAnimating]);

  useEffect(() => {
    isPagingActiveRef.current = isPagingActive;
  }, [isPagingActive]);

  const initializeGame = useCallback((lvl: ComputerLevel) => {
    const ruleVersion = lvl >= 3 ? "rule2" : "rule1";
    const { gameState, allCards } = initGame(
      ["Player", "Computer"],
      5,
      ruleVersion
    );

    setGame({ gameState, allCards });
    setAllCards(allCards);
    setSelectedLevel(levels.find((l) => l.value === lvl)?.label || null);
    setComputerLevel(lvl);
    setIsCardListReady(false);
    setIsAnimating(true);
    setHasDealt(false);
  }, []);

  // ✅ HELPER: Visually moves cards from Pile -> Market
  const animateReshuffle = useCallback(async () => {
    const dealer = cardListRef.current;
    const currentGame = gameRef.current;

    if (!dealer || !currentGame) return;

    const { pile } = currentGame.gameState;

    if (pile.length <= 1) return;

    console.log("♻️ Animation: Moving pile cards back to market...");

    const cardsToMove = pile.slice(0, pile.length - 1);

    const promises = cardsToMove.map(async (card) => {
      const randomRot = Math.floor(Math.random() * 4 - 2);

      // ✅ FIX: Move AND Flip concurrently so it lands face-down
      await Promise.all([
        dealer.dealCard(
          card,
          "market",
          {
            cardIndex: 0,
            rotation: randomRot,
          },
          false
        ),
        dealer.flipCard(card, false),
      ]);
    });

    await Promise.all(promises);
    await new Promise((r) => setTimeout(r, 200));
  }, []);

  // 🧩 ✅ HELPER: Runs the sequential draw loop (Pick 2 / Pick 5)
  const runForcedDrawSequence = useCallback(
    async (startingState: GameState): Promise<GameState> => {
      const dealer = cardListRef.current;
      if (!dealer) return startingState;

      let currentState = startingState;
      const drawAction = currentState.pendingAction;

      if (!drawAction || drawAction.type !== "draw") {
        return startingState;
      }

      const { playerIndex, count } = drawAction;
      const target = playerIndex === 0 ? "player" : "computer";

      console.log(`🔥 Forcing ${target} to draw ${count} card(s) sequentially.`);

      for (let i = 0; i < count; i++) {
        // ✅ 1. PRE-CHECK: If market empty, animate reshuffle FIRST
        if (currentState.market.length === 0 && currentState.pile.length > 1) {
          await animateReshuffle();
          currentState = getReshuffledState(currentState);
          setGame((prev) => {
            gameRef.current = prev ? { ...prev, gameState: currentState } : null;
            return gameRef.current;
          });
        }

        const { newState, drawnCard } = executeForcedDraw(currentState);

        if (!drawnCard) {
          console.warn("Market empty, stopping forced draw.");
          currentState = newState;
          break;
        }

        // 2. Set state logic - this is a regular async function, NOT a worklet
        setGame((prev) => {
          gameRef.current = prev ? { ...prev, gameState: newState } : null;
          return gameRef.current;
        });

        // ✅ 3. FORCE TELEPORT TO MARKET (CRITICAL STEP)
        // Before starting animation, snap the card to Market position instantly.
        dealer.teleportCard(drawnCard, "market", { cardIndex: 0 });

        // ✅ 4. SMALL DELAY
        // Allow UI thread to register the teleport before starting the fly animation.
        await new Promise((r) => setTimeout(r, 40));

        // 5. ANIMATE TO HAND
        const targetPlayer = newState.players[playerIndex];
        const visibleHand = targetPlayer.hand.slice(0, layoutHandSize);
        const animationPromises: Promise<void>[] = [];

        visibleHand.forEach((card, index) => {
          const isTheNewCard = card.id === drawnCard.id;

          animationPromises.push(
            dealer.dealCard(
              card,
              target,
              {
                cardIndex: index,
                handSize: layoutHandSize,
              },
              false
            )
          );

          if (isTheNewCard && target === "player") {
            animationPromises.push(dealer.flipCard(drawnCard, true));
          }
        });

        await Promise.all(animationPromises);
        currentState = newState;
        await new Promise((res) => setTimeout(res, 200));
      }

      return currentState;
    },
    [layoutHandSize, animateReshuffle]
  );

  const handleSuitSelection = useCallback((selectedSuit: CardSuit) => {
    const currentGame = gameRef.current;
    if (!currentGame) return;

    const { gameState } = currentGame;
    const { pendingAction } = gameState;

    if (!pendingAction || pendingAction.type !== "call_suit") return;

    const newState: GameState = {
      ...gameState,
      calledSuit: selectedSuit,
      pendingAction: null,
      currentPlayer:
        pendingAction.nextAction === "pass"
          ? (gameState.currentPlayer + 1) % gameState.players.length
          : gameState.currentPlayer,
    };

    setGame((prev) => (prev ? { ...prev, gameState: newState } : null));
  }, []);

  const activeCalledSuit = useMemo(() => {
    if (!game) return null;
    const { pile, calledSuit } = game.gameState;
    const topCard = pile[pile.length - 1];
    if (topCard?.number === 20 && calledSuit) {
      return calledSuit;
    }
    return null;
  }, [game?.gameState.pile, game?.gameState.calledSuit]);

  const SPECIAL_CARD_DELAY = 500;

  const handleComputerTurn = useCallback(async () => {
    const dealer = cardListRef.current;
    const currentGame = gameRef.current;
    const animating = isAnimatingRef.current;

    if (
      !currentGame ||
      animating ||
      currentGame.gameState.currentPlayer !== 1 ||
      !dealer
    ) {
      return;
    }

    console.log("🤖 Computer's turn starting...");
    setIsAnimating(true);

    try {
      const oldState = currentGame.gameState;
      const { ruleVersion } = oldState;
      const computerPlayerIndex = 1;

      const move = chooseComputerMove(
        oldState,
        computerPlayerIndex,
        computerLevel
      );

      if (move) {
        console.log("🤖 Computer chose to PLAY:", move.id);

        let newState: GameState;
        try {
          newState = playCard(oldState, computerPlayerIndex, move);
        } catch (e: any) {
          const { newState: pickState, drawnCards } = pickCard(
            oldState,
            computerPlayerIndex
          );
          setGame((prevGame) =>
            prevGame ? { ...prevGame, gameState: pickState } : null
          );
          if (drawnCards.length > 0) {
            // Force teleport to market first for safety
            drawnCards.forEach((c) =>
              dealer.teleportCard(c, "market", { cardIndex: 0 })
            );
            await new Promise((r) => setTimeout(r, 40));

            const newHand = pickState.players[computerPlayerIndex].hand;
            const promises = newHand.map((card, index) =>
              dealer.dealCard(
                card,
                "computer",
                { cardIndex: index, handSize: newHand.length },
                false
              )
            );
            await Promise.all(promises);
          }
          return;
        }

        setGame((prevGame) =>
          prevGame ? { ...prevGame, gameState: newState } : null
        );

        const finalPileIndex = newState.pile.length - 1;
        const animationPromises: Promise<void>[] = [];

        animationPromises.push(
          dealer.dealCard(move, "pile", { cardIndex: finalPileIndex }, false)
        );
        animationPromises.push(dealer.flipCard(move, true));

        const newHand = newState.players[computerPlayerIndex].hand;
        newHand.forEach((card, index) =>
          animationPromises.push(
            dealer.dealCard(
              card,
              "computer",
              { cardIndex: index, handSize: newHand.length },
              true
            )
          )
        );

        await Promise.all(animationPromises);

        if (
          newState.pendingAction?.type === "call_suit" &&
          newState.pendingAction.playerIndex === computerPlayerIndex
        ) {
          const bestSuit = chooseComputerSuit(
            newState.players[computerPlayerIndex].hand
          );
          await new Promise((res) => setTimeout(res, 800));
          const finalState: GameState = {
            ...newState,
            calledSuit: bestSuit,
            pendingAction: null,
            currentPlayer:
              newState.pendingAction.nextAction === "pass"
                ? (newState.currentPlayer + 1) % newState.players.length
                : newState.currentPlayer,
          };
          setGame((prev) => (prev ? { ...prev, gameState: finalState } : null));
          return;
        }

        if (newState.pendingAction?.type === "draw") {
          await new Promise((resolve) => setTimeout(resolve, SPECIAL_CARD_DELAY));
          const finalState = await runForcedDrawSequence(newState);
          setGame((prevGame) =>
            prevGame ? { ...prevGame, gameState: finalState } : null
          );
        }
      } else {
        // ... inside the else { // CASE B: PICK block

        console.log("🤖 Computer chose to PICK");

        // 1. Reshuffle check
        let stateToPickFrom = oldState;
        if (oldState.market.length === 0 && oldState.pile.length > 1) {
          await animateReshuffle();
          stateToPickFrom = getReshuffledState(oldState);
          setGame((prev) => {
            gameRef.current = prev ? { ...prev, gameState: stateToPickFrom } : null;
            return gameRef.current;
          });
        }

        // 2. Call the updated pickCard logic
        const { newState, drawnCards } = pickCard(stateToPickFrom, computerPlayerIndex);

        // ✅ FIX: Check if we just surrendered a defense (Pick 2/3)
        // If pickCard returned NO cards, but the state changed to "draw", 
        // it means the computer gave up on defending.
        if (
          drawnCards.length === 0 &&
          newState.pendingAction?.type === "draw"
        ) {
          console.log("🏳️ Computer surrenders defense -> Triggering Forced Draw");

          // Update state to "draw" mode
          setGame((prev) => (prev ? { ...prev, gameState: newState } : null));

          // Slight delay for state to settle
          await new Promise((r) => setTimeout(r, 200));

          // 🚀 Trigger the forced draw animation sequence
          const finalState = await runForcedDrawSequence(newState);

          setGame((prev) => (prev ? { ...prev, gameState: finalState } : null));
          setIsAnimating(false);
          return;
        }

        // ... [The rest of the standard pick logic continues below] ...

        if (drawnCards.length === 0) {
          // Standard empty market case
          setGame((prevGame) =>
            prevGame ? { ...prevGame, gameState: newState } : null
          );
          return;
        }

        setGame((prevGame) =>
          prevGame ? { ...prevGame, gameState: newState } : null
        );

        const newHand = newState.players[computerPlayerIndex].hand;
        const animationPromises: Promise<void>[] = [];

        // ✅ FIX: Force Teleport computer drawn cards to Market
        drawnCards.forEach((card) => {
          dealer.teleportCard(card, "market", { cardIndex: 0 });
        });
        await new Promise((r) => setTimeout(r, 40));

        newHand.forEach((card, index) => {
          animationPromises.push(
            dealer.dealCard(
              card,
              "computer",
              { cardIndex: index, handSize: newHand.length },
              false
            )
          );
        });

        await Promise.all(animationPromises);
      }
    } catch (err) {
      console.error("🔥 Error during handleComputerTurn:", err);
    } finally {
      setIsAnimating(false);
    }
  }, [computerLevel, runForcedDrawSequence, layoutHandSize, animateReshuffle]);

  // ✅ UPDATED: Handle Pick with Robust Animation Sequence
  const handlePickFromMarket = useCallback(async () => {
    const dealer = cardListRef.current;
    const currentGame = gameRef.current;
    const animating = isAnimatingRef.current;

    if (
      !currentGame ||
      animating ||
      currentGame.gameState.currentPlayer !== 0 ||
      !dealer
    ) {
      return;
    }

    setIsAnimating(true);

    // 1. VISUAL RESHUFFLE CHECK
    let logicalState = currentGame.gameState;
    if (logicalState.market.length === 0) {
      if (logicalState.pile.length > 1) {
        await animateReshuffle();
        logicalState = getReshuffledState(logicalState);
        setGame((prev) => {
          const updated = prev ? { ...prev, gameState: logicalState } : null;
          gameRef.current = updated;
          return updated;
        });
      }
    }


    // 2. LOGIC PICK
    const oldState = logicalState;
    const { newState: stateAfterPick, drawnCards } = pickCard(oldState, 0);

    // ✅ FIX: Handle Player Surrender (Defend -> Draw)
    if (
      drawnCards.length === 0 &&
      stateAfterPick.pendingAction?.type === "draw"
    ) {
      console.log("🏳️ Player surrenders defense -> Triggering Forced Draw");

      setGame((prev) => (prev ? { ...prev, gameState: stateAfterPick } : null));

      // 🚀 Trigger the forced draw animation sequence
      const finalState = await runForcedDrawSequence(stateAfterPick);

      setGame((prev) => (prev ? { ...prev, gameState: finalState } : null));
      setIsAnimating(false);
      return;
    }

    // Standard "Nothing to pick" case
    if (drawnCards.length === 0) {
      setGame((prevGame) =>
        prevGame ? { ...prevGame, gameState: stateAfterPick } : null
      );
      setIsAnimating(false);
      return;
    }

    // 3. CALCULATE NEW HAND
    const currentHand = stateAfterPick.players[0].hand;
    const drawnCardIds = new Set(drawnCards.map((c) => c.id));
    const oldHandCards = currentHand.filter(
      (card) => !drawnCardIds.has(card.id)
    );
    const newHandOrder = [...drawnCards, ...oldHandCards];

    const newState = {
      ...stateAfterPick,
      players: stateAfterPick.players.map((player, index) => {
        if (index === 0) return { ...player, hand: newHandOrder };
        return player;
      }),
    };

    const newVisibleHand = newHandOrder.slice(0, playerHandLimit);
    const oldVisibleHand = oldState.players[0].hand.slice(0, playerHandLimit);
    const newVisibleHandIds = new Set(newVisibleHand.map((c) => c.id));
    const cardsLeaving = oldVisibleHand.filter(
      (c) => !newVisibleHandIds.has(c.id)
    );

    setGame((prevGame) =>
      prevGame ? { ...prevGame, gameState: newState } : null
    );

    // ✅ 4. CRITICAL FIX: FORCE TELEPORT TO MARKET FIRST
    // We isolate the drawn cards and snap them to the Market pile.
    drawnCards.forEach((card) => {
      dealer.teleportCard(card, "market", { cardIndex: 0 });
    });

    // ✅ 5. SMALL DELAY (Force UI thread to catch up)
    await new Promise((r) => setTimeout(r, 40));

    // 6. ANIMATE TO HAND
    const animationPromises: Promise<void>[] = [];

    newVisibleHand.forEach((card, index) => {
      const options = { cardIndex: index, handSize: layoutHandSize };

      animationPromises.push(dealer.dealCard(card, "player", options, false));

      if (drawnCardIds.has(card.id)) {
        animationPromises.push(dealer.flipCard(card, true));
      }
    });

    cardsLeaving.forEach((card, index) => {
      animationPromises.push(
        dealer.dealCard(
          card,
          "player",
          { cardIndex: playerHandLimit + index, handSize: layoutHandSize },
          false
        )
      );
    });

    // Hidden cards animation
    for (const card of drawnCards) {
      const isVisible = newVisibleHand.some((c) => c.id === card.id);
      if (!isVisible) {
        // Even hidden cards must snap to market then move to hidden slot
        dealer.teleportCard(card, "market", { cardIndex: 0 });
        animationPromises.push(
          dealer.dealCard(card, "market", { cardIndex: 0 }, false)
        );
        animationPromises.push(dealer.flipCard(card, true));
      }
    }

    await Promise.all(animationPromises);
    setIsAnimating(false);
  }, [animateReshuffle, playerHandLimit, layoutHandSize, runForcedDrawSequence]);

  const handlePagingPress = useCallback(async () => {
    const dealer = cardListRef.current;
    const currentGame = gameRef.current;
    const animating = isAnimatingRef.current;
    const pagingActive = isPagingActiveRef.current;
    if (!dealer || animating || !currentGame || !pagingActive) return;
    setIsAnimating(true);
    const oldHand = currentGame.gameState.players[0].hand;
    const oldVisibleHand = oldHand.slice(0, playerHandLimit);
    const cardToMove = oldHand[oldHand.length - 1];
    const remainingCards = oldHand.slice(0, oldHand.length - 1);
    const newHand = [cardToMove, ...remainingCards];
    const newVisibleHand = newHand.slice(0, playerHandLimit);
    const cardEntering = cardToMove;
    const cardLeaving = oldVisibleHand[playerHandLimit - 1];
    const newState = {
      ...currentGame.gameState,
      players: currentGame.gameState.players.map((p, i) =>
        i === 0 ? { ...p, hand: newHand } : p
      ),
    };
    setGame((prevGame) =>
      prevGame ? { ...prevGame, gameState: newState } : null
    );
    if (cardEntering) {
      dealer.teleportCard(cardEntering, "player", {
        cardIndex: -1,
        handSize: layoutHandSize,
      });
    }
    const animationPromises: Promise<void>[] = [];
    newVisibleHand.forEach((card, index) => {
      animationPromises.push(
        dealer.dealCard(
          card,
          "player",
          { cardIndex: index, handSize: layoutHandSize },
          false
        )
      );
    });
    if (cardLeaving) {
      animationPromises.push(
        dealer.dealCard(
          cardLeaving,
          "player",
          { cardIndex: playerHandLimit, handSize: layoutHandSize },
          false
        )
      );
    }
    await Promise.all(animationPromises);
    setIsAnimating(false);
  }, []);

  const onCardListReady = useCallback(() => {
    console.log("✅ Card list reported ready. Waiting for ref binding...");

    // ✅ FIX: Small delay ensures cardListRef.current is attached before we try to deal
    setTimeout(() => {
      setIsCardListReady(true);
    }, 300);
  }, []);

  const handleNewBattle = useCallback(() => {
    setGame(null);
    setSelectedLevel(null);
  }, []);

  const handleRestart = useCallback(() => {
    if (selectedLevel) {
      const lvlValue = levels.find((l) => l.label === selectedLevel)?.value || 1;

      // 1. Force new ID
      setGameInstanceId((prev) => prev + 1);

      // 2. Reset flags explicitly
      setGame(null);
      setAllCards([]);
      setIsAnimating(false);
      setHasDealt(false);
      setIsCardListReady(false); // ✅ Reset this too!

      setTimeout(() => {
        initializeGame(lvlValue);
      }, 100);
    }
  }, [selectedLevel, initializeGame]);

  useEffect(() => {
    const revealCards = async () => {
      const dealer = cardListRef.current;
      if (game?.gameState.winner && dealer) {
        const computerHand = game.gameState.players[1].hand;
        const revealPromises: Promise<void>[] = [];
        computerHand.forEach((card) => {
          revealPromises.push(dealer.flipCard(card, true));
        });
        await Promise.all(revealPromises);
      }
    };
    revealCards();
  }, [game?.gameState.winner]);

  // ✅ LISTEN FOR MARKET EXHAUSTION
  useEffect(() => {
    if (game?.gameState.marketExhausted) {
      console.log("⏳ MARKET EXHAUSTED DETECTED! Starting delay...");
      console.log("Current Winner in State:", game.gameState.winner);

      const timer = setTimeout(() => {
        setGame((prev) => {
          if (!prev) return null;
          console.log("🏁 Timeout finished. Calling finalizeMarketExhaustion.");
          const finalState = finalizeMarketExhaustion(prev.gameState);
          return { ...prev, gameState: finalState };
        });
      }, 4000); // 4 seconds delay

      return () => clearTimeout(timer);
    }
  }, [game?.gameState.marketExhausted]);

  const handlePlayCard = useCallback(
    async (card: Card) => {
      const dealer = cardListRef.current;
      const currentGame = gameRef.current;
      const animating = isAnimatingRef.current;
      if (
        !currentGame ||
        animating ||
        currentGame.gameState.currentPlayer !== 0 ||
        !dealer
      ) {
        return;
      }
      setIsAnimating(true);
      try {
        let newState: GameState;
        const playedCard: Card = card;
        try {
          newState = playCard(
            currentGame.gameState,
            0,
            card
          );
        } catch (error: any) {
          console.log("Invalid move:", error.message);
          return;
        }

        const oldPlayerHand = currentGame.gameState.players[0].hand;
        const oldVisibleHand = oldPlayerHand.slice(0, playerHandLimit);
        const oldVisibleHandIds = new Set(oldVisibleHand.map((c) => c.id));
        const newHand = newState.players[0].hand;
        const newVisibleHand = newHand.slice(0, playerHandLimit);
        const newlyVisibleCards: Card[] = [];
        newVisibleHand.forEach((handCard) => {
          if (!oldVisibleHandIds.has(handCard.id)) {
            newlyVisibleCards.push(handCard);
          }
        });

        setGame((prevGame) =>
          prevGame ? { ...prevGame, gameState: newState } : null
        );

        if (newlyVisibleCards.length > 0) {
          newlyVisibleCards.forEach((newCard, index) => {
            const offscreenIndex = playerHandLimit + index;
            dealer.teleportCard(newCard, "player", {
              cardIndex: offscreenIndex,
              handSize: layoutHandSize,
            });
          });
        }

        const animationPromises: Promise<void>[] = [];
        const finalPileIndex = newState.pile.length - 1;
        animationPromises.push(
          dealer.dealCard(
            playedCard,
            "pile",
            { cardIndex: finalPileIndex },
            false
          )
        );
        animationPromises.push(dealer.flipCard(playedCard, true));

        newVisibleHand.forEach((handCard, index) => {
          animationPromises.push(
            dealer.dealCard(
              handCard,
              "player",
              { cardIndex: index, handSize: layoutHandSize },
              false
            )
          );
        });

        await Promise.all(animationPromises);

        if (newState.pendingAction?.type === "draw") {
          console.log(
            `⏳ Special card played! Waiting ${SPECIAL_CARD_DELAY}ms...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, SPECIAL_CARD_DELAY)
          );
          const finalState = await runForcedDrawSequence(newState);
          setGame((prevGame) =>
            prevGame ? { ...prevGame, gameState: finalState } : null
          );
        }
      } catch (err) {
        console.error("Error during handlePlayCard:", err);
      } finally {
        setIsAnimating(false);
      }
    },
    [runForcedDrawSequence, layoutHandSize, playerHandLimit]
  );

  const showSuitSelector = useMemo(() => {
    if (!game) return false;
    const { pendingAction, currentPlayer } = game.gameState;
    return (
      pendingAction?.type === "call_suit" && pendingAction.playerIndex === 0
    );
  }, [game?.gameState.pendingAction, game?.gameState.currentPlayer]);

  useEffect(() => {
    if (!game || isAnimating || !hasDealt) return;
    if (game.gameState.pendingAction?.type === "draw") return;

    if (game.gameState.currentPlayer === 1) {
      const timer = setTimeout(() => {
        handleComputerTurn();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [
    game?.gameState.currentPlayer,
    game?.gameState.pendingAction,
    isAnimating,
    hasDealt,
    handleComputerTurn,
  ]);

  useEffect(() => {
    // 🔍 DEBUGGING: Check conditions
    if (isCardListReady && !hasDealt && isAnimating) {
      console.log("👀 Checking Deal Conditions:", {
        ready: isCardListReady,
        ref: !!cardListRef.current,
        game: !!game,
        hasDealt,
        animating: isAnimating
      });
    }

    if (
      !isCardListReady ||
      !cardListRef.current ||
      !game ||
      hasDealt ||
      !isAnimating
    ) {
      return;
    }

    const dealer = cardListRef.current;
    let isMounted = true;

    const dealSmoothly = async () => {
      console.log("🎴 Starting smooth deal...");
      const { players, pile } = game.gameState;
      const playerHand = players[0].hand;
      const computerHand = players[1].hand;

      // ... (Rest of your existing dealing logic remains the same) ...

      const computerHandSize = computerHand.length;
      const visiblePlayerHand = playerHand.slice(0, playerHandLimit);
      const hiddenPlayerHand = playerHand.slice(playerHandLimit);
      const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
      const dealDelay = 150;

      // 1. Deal Computer
      for (let i = 0; i < computerHandSize; i++) {
        if (!isMounted) return;
        const computerCard = computerHand[i];
        if (computerCard) {
          await dealer.dealCard(
            computerCard,
            "computer",
            { cardIndex: i, handSize: computerHand.length },
            false
          );
          await delay(dealDelay);
        }
      }

      // 2. Deal Player
      for (let i = 0; i < visiblePlayerHand.length; i++) {
        if (!isMounted) return;
        const playerCard = visiblePlayerHand[i];
        if (playerCard) {
          await dealer.dealCard(
            playerCard,
            "player",
            { cardIndex: i, handSize: layoutHandSize },
            false
          );
          await delay(dealDelay);
        }
      }

      // 3. Hidden cards to market
      for (const card of hiddenPlayerHand) {
        if (!isMounted) return;
        if (card) dealer.dealCard(card, "market", { cardIndex: 0 }, true);
      }

      // 4. Pile
      for (const pileCard of pile) {
        if (pileCard)
          await dealer.dealCard(pileCard, "pile", { cardIndex: 0 }, false);
      }

      await delay(500);
      if (!isMounted) return;

      // 5. Flip
      const flipPromises: Promise<void>[] = [];
      visiblePlayerHand.forEach((card) => {
        if (card) flipPromises.push(dealer.flipCard(card, true));
      });
      const topPileCard = pile[pile.length - 1];
      if (topPileCard) flipPromises.push(dealer.flipCard(topPileCard, true));
      await Promise.all(flipPromises);

      console.log("✅ Deal complete.");
      if (isMounted) {
        setHasDealt(true);
        setIsAnimating(false);
      }
    };

    const timerId = setTimeout(dealSmoothly, 100); // Small start delay
    return () => {
      isMounted = false;
      clearTimeout(timerId);
    };
  }, [isCardListReady, game, hasDealt, isAnimating, playerHandLimit]);

  useLayoutEffect(() => {
    const currentGame = gameRef.current;
    const animating = isAnimatingRef.current;
    if (
      !isCardListReady ||
      !cardListRef.current ||
      !currentGame ||
      animating ||
      !hasDealt
    )
      return;
    const dealer = cardListRef.current;
    const { players, pile, market } = currentGame.gameState;
    const playerHand = players[0].hand;
    const visiblePlayerHand = playerHand.slice(0, playerHandLimit);
    const hiddenPlayerHand = playerHand.slice(playerHandLimit);
    visiblePlayerHand.forEach((card, index) => {
      if (card)
        dealer.dealCard(
          card,
          "player",
          { cardIndex: index, handSize: layoutHandSize },
          true
        );
    });
    hiddenPlayerHand.forEach((card) => {
      if (card) dealer.dealCard(card, "market", { cardIndex: 0 }, true);
    });
    market.forEach((card) => {
      if (card) dealer.dealCard(card, "market", { cardIndex: 0 }, true);
    });
    const computerHand = players[1].hand;
    computerHand.forEach((card, index) => {
      if (card)
        dealer.dealCard(
          card,
          "computer",
          { cardIndex: index, handSize: computerHand.length },
          true
        );
    });
    pile.forEach((card, index) => {
      if (card)
        dealer.dealCard(
          card,
          "pile",
          { cardIndex: index, handSize: pile.length },
          true
        );
    });
  }, [stableWidth, stableHeight, isCardListReady, hasDealt]);

  if (!readyToRender || !assetsReady || !stableFont || !stableWhotFont) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.title}>Preparing Arena...</Text>
      </View>
    );
  }

  if (!selectedLevel) {
    return (
      <View style={styles.levelSelector}>
        <Text style={styles.title}>Choose Difficulty</Text>
        {levels.map((level) => (
          <TouchableOpacity
            key={level.value}
            style={styles.levelButton}
            onPress={() => initializeGame(level.value)}
          >
            <Text style={styles.levelText}>{level.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <WhotCoreUI
      game={game}
      playerState={playerState}
      opponentState={computerState}
      marketCardCount={marketCardCount}
      activeCalledSuit={activeCalledSuit}
      showSuitSelector={showSuitSelector}
      isAnimating={isAnimating}
      cardListRef={cardListRef}
      onCardPress={handlePlayCard}
      onPickFromMarket={handlePickFromMarket}
      onPagingPress={handlePagingPress}
      onSuitSelect={handleSuitSelection}
      onCardListReady={onCardListReady}
      showPagingButton={showPagingButton}
      allCards={allCards}
      playerHandIdsSV={playerHandIdsSV}
      gameInstanceId={gameInstanceId}
      stableWidth={stableWidth}
      stableHeight={stableHeight}
      stableFont={stableFont}
      stableWhotFont={stableWhotFont}
      isLandscape={isLandscape}
      gameOver={{
        winner: game?.gameState.winner || null,
        onRematch: handleRestart,
        onNewBattle: handleNewBattle,
        level: computerLevel,
        playerName: playerProfile.name,
        opponentName: levels.find((l) => l.value === computerLevel)?.label.split(" ")[0] + " AI",
        playerRating: playerProfile.rating,
        result: game?.gameState.winner?.id === game?.gameState.players[0].id ? "win" : "loss"
      }}
    />
  );
};

const WhotComputerGameScreen = () => {
  const navigation = useNavigation();
  return (
    <WhotErrorBoundary onGoBack={() => navigation.goBack()}>
      <WhotComputerUI />
    </WhotErrorBoundary>
  );
};

export default WhotComputerGameScreen;


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  levelSelector: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1a1a1a'
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30
  },
  levelButton: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    marginVertical: 8,
    width: '85%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444'
  },
  levelText: { color: 'white', fontSize: 18, fontWeight: '500' },
});
