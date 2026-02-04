import React, { useMemo, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, Pressable, TouchableOpacity } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { SkFont } from '@shopify/react-native-skia';
import { Card, CardSuit, GameState } from '../types';
import AnimatedCardList, { AnimatedCardListHandle } from './AnimatedCardList';
import MemoizedBackground from './MemoizedBackground';
import WhotSuitSelector from './WhotSuitSelector';
import ActiveSuitCard from './ActiveSuitCard';
import { MarketPile } from './MarketPile';
import WhotPlayerProfile from './whotplayerProfile';
import ComputerUI from '../../computer/whotComputerUI';
import { CARD_HEIGHT } from './whotConfig';
import { getCoords } from '../coordinateHelper';
import GameOverModal from './GameOverModal';

// Calculate hand score for Rule 2 display
const calculateHandScore = (hand: Card[]): number => {
    return hand.reduce((total, card) => total + card.number, 0);
};

export type WhotCoreUIProps = {
    game: { gameState: GameState; allCards: Card[] } | null;
    playerState: {
        name: string;
        rating: number;
        country?: string;
        avatar?: string | null;
        handLength: number;
        isCurrentPlayer: boolean;
    };
    opponentState: {
        name: string;
        rating?: number;
        handLength: number;
        isCurrentPlayer: boolean;
        isAI?: boolean;
    };
    level?: any;
    marketCardCount: number;
    activeCalledSuit: CardSuit | null;
    showSuitSelector: boolean;
    isAnimating: boolean;
    cardListRef: React.RefObject<AnimatedCardListHandle>;
    onCardPress: (card: Card) => void;
    onPickFromMarket: () => void;
    onPagingPress: () => void;
    onSuitSelect: (suit: CardSuit) => void;
    onCardListReady: () => void;
    showPagingButton: boolean;
    allCards: Card[];
    playerHandIdsSV: any;
    gameInstanceId: string | number;
    stableWidth: number;
    stableHeight: number;
    stableFont: SkFont | null;
    stableWhotFont: SkFont | null;
    isLandscape: boolean;
    gameOver: {
        winner: any;
        onRematch: () => void;
        onNewBattle: () => void;
        level: number;
        playerName: string;
        opponentName: string;
        playerRating: number;
        result: 'win' | 'loss';
    } | null;
};

const WhotCoreUI: React.FC<WhotCoreUIProps> = ({
    game,
    playerState,
    opponentState,
    level = 1,
    marketCardCount,
    activeCalledSuit,
    showSuitSelector,
    isAnimating,
    cardListRef,
    onCardPress,
    onPickFromMarket,
    onPagingPress,
    onSuitSelect,
    onCardListReady,
    showPagingButton,
    allCards,
    playerHandIdsSV,
    gameInstanceId,
    stableWidth,
    stableHeight,
    stableFont,
    stableWhotFont,
    isLandscape,
    gameOver
}) => {
    // 💓 GAME HEARTBEAT (30Hz)
    const gameTickSV = useSharedValue(0);
    const lastTickTimeRef = useRef(0);

    useFrameCallback((frameInfo) => {
        const { timestamp } = frameInfo;
        if (timestamp - lastTickTimeRef.current >= 33.3) { // 30Hz
            gameTickSV.value += 1;
            lastTickTimeRef.current = timestamp;
        }
    });

    const pileCoords = useMemo(() => {
        return getCoords("pile", { cardIndex: 0 }, stableWidth, stableHeight);
    }, [stableWidth, stableHeight]);

    const playerHandStyle = useMemo(
        () => [
            styles.handContainerBase,
            isLandscape
                ? styles.playerHandContainerLandscape
                : styles.playerHandContainerPortrait,
        ],
        [isLandscape]
    );

    const computerHandStyle = useMemo(
        () => [
            styles.handContainerBase,
            isLandscape
                ? styles.computerHandContainerLandscape
                : styles.computerHandContainerPortrait,
        ],
        [isLandscape]
    );

    if (!stableFont || !stableWhotFont) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.loadingTitle}>Loading Game Components...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {game && (
                <View style={styles.computerUIContainer} pointerEvents="box-none">
                    {opponentState.isAI ? (
                        <ComputerUI
                            computerState={{
                                name: opponentState.name,
                                handLength: opponentState.handLength,
                                isCurrentPlayer: opponentState.isCurrentPlayer
                            }}
                            level={level as any}
                        />
                    ) : (
                        <WhotPlayerProfile
                            name={opponentState.name}
                            rating={opponentState.rating || 1200}
                            cardCount={opponentState.handLength}
                            isCurrentPlayer={opponentState.isCurrentPlayer}
                            avatar={null} // Or pass avatar if available in opponentState
                            country="Global"
                            isAI={false}
                            showCardCount={true}
                            style={{ marginRight: 0, top: 0, alignSelf: 'center' }}
                        />
                    )}
                </View>
            )}

            {game && (
                <View style={styles.playerUIContainer} pointerEvents="box-none">
                    <WhotPlayerProfile
                        name={playerState.name}
                        rating={playerState.rating}
                        country={playerState.country}
                        avatar={playerState.avatar}
                        cardCount={playerState.handLength}
                        isCurrentPlayer={playerState.isCurrentPlayer}
                    />
                </View>
            )}

            <MemoizedBackground width={stableWidth} height={stableHeight} />
            <View style={computerHandStyle} />

            {game?.gameState.marketExhausted && (
                <View style={styles.scoreContainerComputer}>
                    <Text style={styles.scoreText}>
                        Score: {calculateHandScore(game.gameState.players[1].hand)}
                    </Text>
                </View>
            )}

            <View style={playerHandStyle} />

            {game?.gameState.marketExhausted && (
                <View style={styles.scoreContainerPlayer}>
                    <Text style={styles.scoreText}>
                        Score: {calculateHandScore(game.gameState.players[0].hand)}
                    </Text>
                </View>
            )}

            <View
                style={[
                    styles.pagingContainer,
                    isLandscape ? styles.pagingContainerLandscape : styles.pagingContainerPortrait,
                ]}
                pointerEvents="box-none"
            >
                {showPagingButton && (
                    <Pressable
                        onPress={onPagingPress}
                        style={({ pressed }) => [
                            styles.pagingButtonBase,
                            styles.rightPagingButton,
                            pressed && { backgroundColor: "#e6c200" },
                        ]}
                    >
                        <Text style={styles.pagingIcon}>{">"}</Text>
                    </Pressable>
                )}
            </View>

            {game && (
                <MarketPile
                    count={marketCardCount}
                    font={stableWhotFont}
                    smallFont={stableFont}
                    width={stableWidth}
                    height={stableHeight}
                    onPress={onPickFromMarket}
                />
            )}

            {allCards.length > 0 && (
                <AnimatedCardList
                    key={gameInstanceId}
                    ref={cardListRef}
                    cardsInPlay={allCards}
                    playerHandIdsSV={playerHandIdsSV}
                    font={stableFont}
                    whotFont={stableWhotFont}
                    width={stableWidth}
                    height={stableHeight}
                    onCardPress={onCardPress}
                    onReady={onCardListReady}
                    gameTickSV={gameTickSV}
                />
            )}

            {activeCalledSuit && (
                <ActiveSuitCard
                    suit={activeCalledSuit}
                    x={pileCoords.x}
                    y={pileCoords.y}
                    font={stableFont}
                />
            )}

            <WhotSuitSelector
                isVisible={showSuitSelector}
                onSelectSuit={onSuitSelect}
                width={stableWidth}
                height={stableHeight}
                font={stableFont}
            />

            {gameOver && (
                <GameOverModal
                    visible={!!gameOver.winner}
                    winner={gameOver.winner}
                    onRematch={gameOver.onRematch}
                    onNewBattle={gameOver.onNewBattle}
                    level={gameOver.level}
                    playerName={gameOver.playerName}
                    opponentName={gameOver.opponentName}
                    playerRating={gameOver.playerRating}
                    result={gameOver.result}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    centerContent: { justifyContent: "center", alignItems: "center", padding: 20 },
    loadingTitle: { color: '#FFD700', fontSize: 18, marginTop: 10 },
    computerUIContainer: {
        position: "absolute",
        top: 50,
        alignSelf: "center",
        zIndex: 10,
    },
    playerUIContainer: {
        position: "absolute",
        bottom: 40,
        right: 20,
        alignSelf: "flex-end",
        zIndex: 10,
    },
    handContainerBase: {
        position: "absolute",
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        borderTopLeftRadius: 20,
        zIndex: 0,
        height: CARD_HEIGHT + 10,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
    },
    playerHandContainerPortrait: { bottom: "5.5%", left: "3%", right: "15%", width: "auto" },
    computerHandContainerPortrait: { top: 40, left: "26%", right: "5%", width: "auto" },
    playerHandContainerLandscape: { bottom: 8, left: "21%", right: "21%", width: "auto" },
    computerHandContainerLandscape: { top: 8, left: "24%", right: "24%", width: "auto" },
    pagingContainer: {
        position: "absolute",
        zIndex: 100,
        left: 0,
        right: 0,
        height: CARD_HEIGHT + 10,
        pointerEvents: "box-none",
    },
    pagingContainerPortrait: { bottom: "5.5%", width: "100%" },
    pagingContainerLandscape: { bottom: 8, width: "90%" },
    pagingButtonBase: {
        position: "absolute",
        right: 0,
        height: CARD_HEIGHT + 10,
        backgroundColor: "#FFD700",
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
        justifyContent: "center",
        alignItems: "center",
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
    pagingIcon: { fontSize: 36, fontWeight: "bold", color: "#000" },
    rightPagingButton: { marginRight: "5%" },
    scoreContainerComputer: {
        position: "absolute",
        top: 100,
        left: "50%",
        transform: [{ translateX: -40 }],
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: "#FFD700",
        zIndex: 999,
    },
    scoreContainerPlayer: {
        position: "absolute",
        bottom: 150,
        left: "50%",
        transform: [{ translateX: -40 }],
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: "#FFD700",
        zIndex: 999,
    },
    scoreText: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" },
});

export default WhotCoreUI;
