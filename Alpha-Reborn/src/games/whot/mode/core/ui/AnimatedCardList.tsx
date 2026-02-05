// AnimatedCardList.tsx
import React, {
  memo,
  forwardRef,
  useRef,
  useImperativeHandle,
  useMemo,
  useEffect,
} from "react";
import { SkFont } from "@shopify/react-native-skia";
import { Card, CardSuit, PendingAction, RuleVersion } from "../types"; // Make sure this path is correct
import { SharedValue } from "react-native-reanimated";
import { getCoords } from "../coordinateHelper"; // Make sure this path is correct
import IndividualAnimatedCard, {
  IndividualAnimatedCardHandle,
} from "./IndividualAnimatedCard";

// Props from WhotComputerGameScreen
interface Props {
  cardsInPlay: Card[];
  playerHandIdsSV: SharedValue<string[]>;
  font: SkFont | null;
  whotFont: SkFont | null;
  width: number;
  height: number;
  onCardPress: (card: Card) => void;
  onReady: () => void;
  gameTickSV: SharedValue<number>;

  // Validation Props
  isMyTurnSV: SharedValue<boolean>;
  lastCardOnPileSV: SharedValue<Card | null>;
  pendingActionSV: SharedValue<PendingAction | null>;
  calledSuitSV: SharedValue<CardSuit | null>;
  ruleVersionSV: SharedValue<RuleVersion>;
  currentPlayerIndexSV: SharedValue<number>;
  onFeedback?: (message: string) => void;
}

// Public handle for WhotComputerGameScreen
export interface AnimatedCardListHandle {
  dealCard: (
    card: Card,
    target: "player" | "computer" | "pile" | "market",
    options?: any,
    instant?: boolean,
    timestamp?: number
  ) => Promise<void>;
  flipCard: (card: Card, show: boolean) => Promise<void>;
  teleportCard: (
    card: Card,
    target: "player" | "computer" | "pile" | "market",
    options?: any,
    timestamp?: number
  ) => void;
}

const AnimatedCardList = memo(
  forwardRef<AnimatedCardListHandle, Props>(
    (
      {
        cardsInPlay,
        playerHandIdsSV,
        font,
        whotFont,
        width,
        height,
        onCardPress,
        onReady,
        gameTickSV,
        isMyTurnSV,
        lastCardOnPileSV,
        pendingActionSV,
        calledSuitSV,
        ruleVersionSV,
        currentPlayerIndexSV,
        onFeedback,
      },
      ref
    ) => {
      // A Map to hold refs for all 54 cards
      const cardRefs = useRef<Map<string, IndividualAnimatedCardHandle>>(
        new Map()
      );

      // Stable position for the market
      const marketPos = useMemo(
        () => getCoords("market", {}, width, height),
        [width, height]
      );

      // Call onReady when fonts are loaded
      useEffect(() => {
        if (font && whotFont) {
          console.log("LOG ✅ Card list is ready, calling onReady().");
          onReady();
        }
      }, [font, whotFont, onReady]);

      // --- Public API for the parent component ---
      useImperativeHandle(ref, () => ({
        dealCard: async (card: Card, target: any, options: any, instant: any, timestamp: any) => {
          const cardRef = cardRefs.current.get(card.id);
          if (cardRef) {
            await cardRef.dealTo(target, options, instant, timestamp);
          } else {
            console.warn(`No ref found for card ${card.id} during deal.`);
          }
        },
        flipCard: async (card: Card, show: boolean) => {
          const cardRef = cardRefs.current.get(card.id);
          if (cardRef) {
            await cardRef.flip(show);
          } else {
            console.warn(`No ref found for card ${card.id} during flip.`);
          }
        },
        teleportCard: (card: Card, target: any, options: any, timestamp: any) => {
          const cardRef = cardRefs.current.get(card.id);
          if (cardRef) {
            cardRef.teleportTo(target, options, timestamp);
          } else {
            console.warn(`No ref found for card ${card.id} during teleport.`);
          }
        },
      }));
      if (!font || !whotFont) {
        return null;
      }

      return (
        <>
          {cardsInPlay.map((card) => (
            <IndividualAnimatedCard
              key={card.id}
              ref={(node) => {
                // Keep the ref map updated
                if (node) {
                  cardRefs.current.set(card.id, node);
                } else {
                  cardRefs.current.delete(card.id);
                }
              }}
              card={card}
              font={font}
              whotFont={whotFont}
              marketPos={marketPos}
              playerHandIdsSV={playerHandIdsSV}
              width={width}
              height={height}
              onPress={onCardPress}
              gameTickSV={gameTickSV}
              isMyTurnSV={isMyTurnSV}
              lastCardOnPileSV={lastCardOnPileSV}
              pendingActionSV={pendingActionSV}
              calledSuitSV={calledSuitSV}
              ruleVersionSV={ruleVersionSV}
              currentPlayerIndexSV={currentPlayerIndexSV}
              onFeedback={onFeedback}
            />
          ))}
        </>
      );
    }
  )
);
export default AnimatedCardList;


