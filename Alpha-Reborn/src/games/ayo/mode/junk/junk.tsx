// WhotComputerGameScreen.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, StyleSheet, Dimensions, Text, Button, ScrollView } from "react-native";
import { Canvas, Rect } from "@shopify/react-native-skia";
import { runOnJS } from 'react-native-reanimated';

import AnimatedCardList, { AnimatedCardListHandle } from "../core/ui/AnimatedCardList";
import { Card } from '../core/types';
import { getCoords } from '../core/coordinateHelper';
import { initGame } from '../core/whotLogic';

const levels = [{ label: "Easy", value: 1 }];

// Helper type for clarity
type GameData = ReturnType<typeof initGame>;

const WhotComputerGameScreen = () => {
    const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
    const [game, setGame] = useState<GameData | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const [allCards, setAllCards] = useState<Card[]>([]);
    const [cardsReady, setCardsReady] = useState(false);

    const cardListRef = useRef<AnimatedCardListHandle>(null);
    const marketPosition = useMemo(() => getCoords('market'), []);

    const initializeGame = useCallback((lvl: string) => {
        const gameData = initGame(["Player", "Computer"], 6);
        setAllCards(gameData.allCards);
        setGame(gameData);
        setSelectedLevel(lvl);
        setIsAnimating(true);
    }, []);

    useEffect(() => {
        if (game && allCards.length > 0) {
            const timer = setTimeout(() => setCardsReady(true), 100);
            return () => clearTimeout(timer);
        }
    }, [game, allCards]);

    // ✅ REFACTORED AGAIN: This logic is now simple, sequential, and bug-free.
    useEffect(() => {
        if (!cardsReady || !cardListRef.current || !game) return;

        const dealer = cardListRef.current;

        const dealSequentially = async () => {
            console.log("Starting SEQUENTIAL deal...");
            const handSize = game.gameState.players[0].hand.length;

            // 1. Deal all cards face down to their initial positions
            const flipPromises: Promise<void>[] = [];

            for (let i = 0; i < handSize; i++) {
                const playerCard = game.gameState.players[0].hand[i];
                const computerCard = game.gameState.players[1].hand[i];

                // Deal to Player (face down)
                if (playerCard) {
                    await dealer.dealCard(playerCard, 'player', { cardIndex: i, handSize }, false);
                }

                // Deal to Computer (face down)
                if (computerCard) {
                    await dealer.dealCard(computerCard, 'computer', { cardIndex: i, handSize }, false);
                }
            }

            // 2. Deal the open card to the pile (face down)
            const pileCard = game.gameState.pile[0];
            if (pileCard) {
                await dealer.dealCard(pileCard, 'pile', { cardIndex: 0, handSize: 1 }, false);
            }

            // Add a small delay before flipping all cards
            await new Promise(resolve => setTimeout(resolve, 500));

            // 3. Flip all player cards and the pile card simultaneously
            for (let i = 0; i < handSize; i++) {
                const playerCard = game.gameState.players[0].hand[i];
                if (playerCard) {
                    flipPromises.push(dealer.flipCard(playerCard, true));
                }
            }
            if (pileCard) {
                flipPromises.push(dealer.flipCard(pileCard, true));
            }

            await Promise.all(flipPromises);

            console.log("Deal sequence complete.");
            runOnJS(setIsAnimating)(false);
        };

        dealSequentially();
        setCardsReady(false); // Prevent this from running again

    }, [cardsReady, game]);

    if (!selectedLevel) {
        // ... Level selection JSX is unchanged ...
        return (
            <View style={[styles.container, styles.centerContent]}>
                <Text style={styles.title}>Select Computer Level</Text>
                {levels.map((level) => (
                    <View key={level.value} style={styles.levelButtonContainer}>
                        <Button
                            title={`${level.label}`}
                            onPress={() => initializeGame(level.label)}
                            color="#1E5E4E"
                        />
                    </View>
                ))}
            </View>
        );
    }
    
    return (
      <View style={StyleSheet.absoluteFillObject}>
  <Canvas style={[StyleSheet.absoluteFillObject, isAnimating && { zIndex: 21 }]}>
    <Rect
      x={0}
      y={0}
      width={Dimensions.get('window').width}
      height={Dimensions.get('window').height}
      color="#1E5E4E"
    />
  </Canvas>

  {/* ✅ Move gesture-enabled content OUTSIDE the Canvas */}
  {allCards.length > 0 && (
    <AnimatedCardList
      ref={cardListRef}
      cardsInPlay={allCards}
      marketPos={marketPosition}
      onCardPress={(card) => {
        console.log("Card pressed:", card);
      }}
    />
  )}
</View>

    );
};

// ... Styles are unchanged ...
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1E5E4E' },
    centerContent: { justifyContent: 'center', alignItems: 'center', padding: 20 },
    title: { fontSize: 24, color: '#FFF', marginBottom: 20, textAlign: 'center' },
    levelButtonContainer: { marginBottom: 15, width: 200 },
    controlsOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 150, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    playerHandText: { color: 'white', fontSize: 16, marginBottom: 10 },
    blocker: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 20 }
});


export default WhotComputerGameScreen;                                                                                                                   import React from 'react';
import { Canvas, Group, Skia } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { WhotCardFace } from './WhotCardFace'; 
import { WhotCardBack } from './WhotCardBack'; 
import { useWhotFonts } from './useWhotFonts';
import type { AnimatedCard } from './WhotCardTypes';

interface AnimatedWhotCardProps {
    card: AnimatedCard;
}

export const AnimatedWhotCard = ({ card }: AnimatedWhotCardProps) => {
    const { x, y, rotate, suit, number, width, height } = card; 
    const { font, whotFont } = useWhotFonts();

    const transform = useDerivedValue(() => {
        return [{ translateX: x.value }, { translateY: y.value }];
    }, [x, y]);

    const animationTransform = useDerivedValue(() => {
        const matrix = Skia.Matrix();
        matrix.translate(width / 2, height / 2);
        matrix.scale(Math.cos(rotate.value), 1);
        matrix.translate(-width / 2, -height / 2);
        return matrix;
    }, [rotate, width, height]);

    const faceCorrectionMatrix = Skia.Matrix();
    faceCorrectionMatrix.translate(width / 2, height / 2);
    faceCorrectionMatrix.scale(-1, 1);
    faceCorrectionMatrix.translate(-width / 2, -height / 2);

    const backOpacity = useDerivedValue(() => {
        return rotate.value <= Math.PI / 2 ? 1 : 0;
    }, [rotate]);

    const frontOpacity = useDerivedValue(() => {
        return rotate.value >= Math.PI / 2 ? 1 : 0;
    }, [rotate]);

    return (
        <Canvas style={{ width, height }}>
            <Group transform={transform}>
                <Group matrix={animationTransform}>
                    <Group opacity={backOpacity}>
                        <WhotCardBack width={width} height={height} />
                    </Group>
                    <Group opacity={frontOpacity} matrix={faceCorrectionMatrix}>
                        <WhotCardFace
                            suit={suit}
                            number={number}
                            width={width}
                            height={height}
                            font={font}
                            whotFont={whotFont}
                        />
                    </Group>
                </Group>
            </Group>
        </Canvas>
    );
};
  // AnimatedCardList.tsx
  
  import React, { forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
  import { WithTimingConfig } from 'react-native-reanimated';
  import { getCoords } from '../coordinateHelper';
  import { Card } from '../types'; // Correct import
  import IndividualAnimatedCard, { IndividualCardHandle } from './IndividualAnimatedCard';
  
  export interface AnimatedCardListHandle {
      dealCard: (
          card: Card,
          target: 'player' | 'computer' | 'pile',
          options: { cardIndex: number; handSize: number },
          shouldFlip: boolean
      ) => Promise<void>;
      flipCard: (
          card: Card,
          isFaceUp: boolean
      ) => Promise<void>;
  }
  
  interface AnimatedCardListProps {
      cardsInPlay: Card[];
      marketPos: { x: number; y: number };
      onCardPress: (card: Card) => void;
  }
  
  const AnimatedCardList = forwardRef<AnimatedCardListHandle, AnimatedCardListProps>(
      ({ cardsInPlay, marketPos, onCardPress }, ref) => {
          const cardRefs = useRef<{ [key: string]: IndividualCardHandle | null }>({});
          
          const dealCard = useCallback(
              async (cardToDeal: Card, target: 'player' | 'computer' | 'pile', options: { cardIndex: number; handSize: number }, shouldFlip: boolean) => {
                  const cardRef = cardRefs.current[cardToDeal.id];
                  if (!cardRef) {
                      console.error('Card ref not found:', cardToDeal.id);
                      return;
                  }
                  
                  const targetCoords = getCoords(target, options);
                  const moveConfig: WithTimingConfig = { duration: 400 };
                  const flipConfig: WithTimingConfig = { duration: 400 };
  
                  const movePromise = cardRef.moveCard(targetCoords.x, targetCoords.y, moveConfig);
                  const flipPromise = shouldFlip
                      ? cardRef.flipCard(true, flipConfig)
                      : Promise.resolve();
  
                  await Promise.all([movePromise, flipPromise]);
              },
              []
          );
          
          const flipCard = useCallback(
              async (cardToFlip: Card, isFaceUp: boolean) => {
                  const cardRef = cardRefs.current[cardToFlip.id];
                  if (!cardRef) {
                      console.error('Card ref not found for flipping:', cardToFlip.id);
                      return;
                  }
                  const flipConfig: WithTimingConfig = { duration: 400 };
                  await cardRef.flipCard(isFaceUp, flipConfig);
              },
              []
          );
          
          AnimatedCardList.displayName = 'AnimatedCardList';
  
          useImperativeHandle(ref, () => ({
              dealCard,
              flipCard,
          }));
          
          return (
              <>
                  {cardsInPlay.map((card, i) => (
                      <IndividualAnimatedCard
                          key={card.id}
                          card={card}
                          index={i}
                          ref={(el) => { cardRefs.current[card.id] = el; }}
                          initialPosition={marketPos}
                          onPress={onCardPress}
                      />
                  ))}
              </>
          );
      }
  );
  
  export default AnimatedCardList;                                                                                                                   // IndividualAnimatedCard.tsx
  import React, { forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
  import { View } from 'react-native'; // Import View
  import Animated, {
      useSharedValue,
      withTiming,
      WithTimingConfig,
      runOnJS,
      useAnimatedStyle,   // ✅ add this
  } from 'react-native-reanimated';
  
  
  import { AnimatedWhotCard } from './AnimatedWhotCard';
  import { Card, AnimatedCard, CARD_WIDTH, CARD_HEIGHT } from './WhotCardTypes';
  import { GestureDetector, Gesture } from 'react-native-gesture-handler';
  
  // This handle defines the functions that the parent component can call on this card
  export interface IndividualCardHandle {
      moveCard: (
          targetX: number,
          targetY: number,
          config?: WithTimingConfig
      ) => Promise<void>;
      flipCard: (
          isFaceUp: boolean,
          config?: WithTimingConfig
      ) => Promise<void>;
  }
  
  interface IndividualAnimatedCardProps {
      card: Card;
      index: number;
      initialPosition: { x: number; y: number };
      onPress: (card: Card) => void;
  }
  
  const IndividualAnimatedCard = forwardRef<IndividualCardHandle, IndividualAnimatedCardProps>(
      ({ card, index, initialPosition, onPress }, ref) => {
          // --- Animated State ---
          // We subtract half the card's dimensions because getCoords provides the CENTER point,
          // but Skia draws from the TOP-LEFT corner.
          const x = useSharedValue(initialPosition.x - CARD_WIDTH / 2);
          const y = useSharedValue(initialPosition.y - CARD_HEIGHT / 2);
          
          // Rotation state: 0 = face down (0°), 1 = face up (180°)
          const rotate = useSharedValue(0);
  
          // --- Animation Logic ---
  
          // Expose control functions to the parent component (AnimatedCardList)
          useImperativeHandle(ref, () => ({
              /**
               * Animates the card's position to a new target.
               * Returns a promise that resolves when the animation is complete.
               */
              moveCard: (targetX, targetY, config = { duration: 300 }) => {
                  console.log(`Moving card ${card.id} to (${targetX}, ${targetY})`);
                  return new Promise((resolve) => {
                      // Adjust target coordinates from center to top-left for drawing
                      const adjustedX = targetX - CARD_WIDTH / 2;
                      const adjustedY = targetY - CARD_HEIGHT / 2;
                      
                      const onComplete = (finished?: boolean) => {
                          'worklet';
                          if (finished) {
                              runOnJS(resolve)();
                          }
                      };
  
                      x.value = withTiming(adjustedX, config, onComplete);
                      y.value = withTiming(adjustedY, config); // Only one callback needed
                  });
              },
  
              /**
               * Animates the card's flip rotation.
               * Returns a promise that resolves when the animation is complete.
               */
              flipCard: (isFaceUp, config = { duration: 300 }) => {
                  return new Promise((resolve) => {
                      const onComplete = (finished?: boolean) => {
                          'worklet';
                          if (finished) {
                              runOnJS(resolve)();
                          }
                      };
                      
                      rotate.value = withTiming(isFaceUp ? Math.PI : 0, config, onComplete);
                  });
              },
          }));
  
          // --- Render ---
  
          // Combine the static card data with the dynamic animated values
          const animatedCardData: AnimatedCard = {
              ...card,
              x,
              y,
              rotate,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              initialIndex: index,
          };
  
          const tapGesture = Gesture.Tap().onEnd(() => {
              // Use runOnJS to call the React state-related function from the UI thread
              console.log("Card tapped!", card.id);
              if(onPress) {
                  console.log("onPress is defined, calling it.");
                  runOnJS(onPress)(card);
              } else {
                  console.log("onPress is undefined!");
              }
          });
  
          const animatedStyle = useAnimatedStyle(() => {
              return {
                  transform: [
                      { translateX: x.value },
                      { translateY: y.value },
                      { rotateY: `${rotate.value}rad` },
                  ],
              };
          });
  
          // The AnimatedWhotCard component handles the actual Skia drawing
          return (
              <GestureDetector gesture={tapGesture}>
                  <Animated.View style={[animatedStyle, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>
                      <AnimatedWhotCard card={animatedCardData} />
                  </Animated.View>
              </GestureDetector>
          );
      }
  );
  
  IndividualAnimatedCard.displayName = 'IndividualAnimatedCard';
  
  export default IndividualAnimatedCard;                                                                                                                                  