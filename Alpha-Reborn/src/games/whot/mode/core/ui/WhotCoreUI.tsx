import React, { useMemo, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, Pressable, TouchableOpacity } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { SkFont } from '@shopify/react-native-skia';
import { Card, CardSuit, GameState, ComputerLevel } from '../types';
import AnimatedCardList, { AnimatedCardListHandle } from './AnimatedCardList';
import MemoizedBackground from './MemoizedBackground';
import WhotSuitSelector from './WhotSuitSelector';
import ActiveSuitCard from './ActiveSuitCard';
import { MarketPile } from './MarketPile';
import WhotPlayerProfile from './whotplayerProfile';
import ComputerUI from '../../computer/whotComputerUI';
import { CARD_HEIGHT, PORTRAIT_PLAYER_BOTTOM_MARGIN, PORTRAIT_COMPUTER_TOP_MARGIN, HAND_CONTAINER_HEIGHT, PORTRAIT_COMPUTER_HAND_LEFT_MARGIN, PORTRAIT_OPPONENT_PROFILE_TOP, PORTRAIT_COMPUTER_CONTAINER_LEFT } from './whotConfig';
import { getCoords } from '../coordinateHelper';
import GameOverModal from './GameOverModal';
import QuickMuteButton from '../../../../../components/QuickMuteButton';

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
    level?: ComputerLevel;
    marketCardCount: number;
    activeCalledSuit: CardSuit | null;
    showSuitSelector: boolean;

    // Dual-Tier Timer Props
    turnEndTime?: number;
    turnDuration?: number;
    warningYellowAt?: number;
    warningRedAt?: number;
    serverTimeOffset?: number;

    isAnimating: boolean;
    cardListRef: React.RefObject<AnimatedCardListHandle>;
    onCardPress: (card: Card) => void;
    onFeedback?: (message: string) => void;
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
        result: 'win' | 'loss' | 'draw';
        isOnline?: boolean;
        reason?: string;
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

    turnEndTime,
    turnDuration,
    warningYellowAt,
    warningRedAt,
    serverTimeOffset = 0,

    isAnimating,
    cardListRef,
    onCardPress,
    onFeedback,
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
    const [measuredHeight, setMeasuredHeight] = React.useState(stableHeight);
    const [measuredWidth, setMeasuredWidth] = React.useState(stableWidth);

    const handleLayout = React.useCallback((event: any) => {
        const { width: w, height: h } = event.nativeEvent.layout;
        setMeasuredWidth(w);
        setMeasuredHeight(h);
    }, []);

    const gameTickSV = useSharedValue(0);
    const lastTickTimeRef = useRef(0);

    // Validation SharedValues
    const isMyTurnSV = useSharedValue(playerState.isCurrentPlayer);
    const lastCardOnPileSV = useSharedValue<Card | null>(game?.gameState?.lastPlayedCard || null);
    const pendingActionSV = useSharedValue(game?.gameState?.pendingAction || null);
    const calledSuitSV = useSharedValue(activeCalledSuit);
    const ruleVersionSV = useSharedValue(game?.gameState?.ruleVersion || 'rule1');
    const currentPlayerIndexSV = useSharedValue(game?.gameState?.currentPlayer || 0);

    useFrameCallback((frameInfo) => {
        const { timestamp } = frameInfo;
        if (timestamp - lastTickTimeRef.current >= 33.3) { // 30Hz
            gameTickSV.value += 1;
            lastTickTimeRef.current = timestamp;
        }
    });

    // 🔄 SYNC React State to SharedValues
    React.useEffect(() => {
        isMyTurnSV.value = playerState.isCurrentPlayer;
    }, [playerState.isCurrentPlayer]);

    React.useEffect(() => {
        lastCardOnPileSV.value = game?.gameState?.lastPlayedCard || null;
    }, [game?.gameState?.lastPlayedCard]);

    React.useEffect(() => {
        pendingActionSV.value = game?.gameState?.pendingAction || null;
    }, [game?.gameState?.pendingAction]);

    React.useEffect(() => {
        calledSuitSV.value = activeCalledSuit;
    }, [activeCalledSuit]);

    React.useEffect(() => {
        ruleVersionSV.value = game?.gameState?.ruleVersion || 'rule1';
    }, [game?.gameState?.ruleVersion]);

    React.useEffect(() => {
        currentPlayerIndexSV.value = game?.gameState?.currentPlayer || 0;
    }, [game?.gameState?.currentPlayer]);

    const pileCoords = useMemo(() => {
        return getCoords("pile", { cardIndex: 0 }, measuredWidth, measuredHeight);
    }, [measuredWidth, measuredHeight]);


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
        <View style={styles.container} onLayout={handleLayout}>

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

                            turnEndTime={turnEndTime}
                            turnDuration={turnDuration}
                            warningYellowAt={warningYellowAt}
                            warningRedAt={warningRedAt}
                            serverTimeOffset={serverTimeOffset}
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

                        turnEndTime={turnEndTime}
                        turnDuration={turnDuration}
                        warningYellowAt={warningYellowAt}
                        warningRedAt={warningRedAt}
                        serverTimeOffset={serverTimeOffset}
                    />
                </View>
            )}

            <MemoizedBackground width={measuredWidth} height={measuredHeight} />

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
                    width={measuredWidth}
                    height={measuredHeight}
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
                    width={measuredWidth}
                    height={measuredHeight}
                    onCardPress={onCardPress}
                    onReady={onCardListReady}

                    gameTickSV={gameTickSV}
                    isMyTurnSV={isMyTurnSV}
                    lastCardOnPileSV={lastCardOnPileSV}
                    pendingActionSV={pendingActionSV}
                    calledSuitSV={calledSuitSV}
                    ruleVersionSV={ruleVersionSV}
                    currentPlayerIndexSV={currentPlayerIndexSV}
                    onFeedback={onFeedback}
                />
            )}

            {activeCalledSuit && (
                <ActiveSuitCard
                    key={activeCalledSuit}
                    suit={activeCalledSuit}
                    x={pileCoords.x}
                    y={pileCoords.y}
                    font={stableFont}
                />
            )}

            <WhotSuitSelector
                isVisible={showSuitSelector}
                onSelectSuit={onSuitSelect}
                width={measuredWidth}
                height={measuredHeight}
                font={stableFont}
            />


            {gameOver && (
                <GameOverModal
                    visible={!!gameOver.winner}
                    winner={gameOver.winner}
                    onRematch={gameOver.onRematch}
                    onNewBattle={gameOver.onNewBattle}
                    level={gameOver.level as any}
                    playerName={gameOver.playerName}
                    opponentName={gameOver.opponentName}
                    playerRating={gameOver.playerRating}
                    result={gameOver.result}
                    isOnline={gameOver.isOnline}
                    reason={gameOver.reason}
                />
            )}

            <View style={styles.soundControlContainer} pointerEvents="box-none">
                <QuickMuteButton gameId="whot" />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    centerContent: { justifyContent: "center", alignItems: "center", padding: 20 },
    loadingTitle: { color: '#FFD700', fontSize: 18, marginTop: 10 },
    computerUIContainer: {
        position: "absolute",
        top: PORTRAIT_OPPONENT_PROFILE_TOP,
        left: 0,
        width: PORTRAIT_COMPUTER_CONTAINER_LEFT,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
    },
    playerUIContainer: {
        position: "absolute",
        bottom: 40,
        right: 20,
        alignSelf: "flex-end",
        zIndex: 10,
    },
    soundControlContainer: {
        position: 'absolute',
        top: 40,
        right: 20,
        zIndex: 9999,
        elevation: 100,
    },
    handContainerBase: {
        position: "absolute",
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        borderTopLeftRadius: 20,
        zIndex: 0,
        height: HAND_CONTAINER_HEIGHT,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
    },
    playerHandContainerPortrait: { bottom: PORTRAIT_PLAYER_BOTTOM_MARGIN, left: "3%", right: 85, width: "auto" },
    computerHandContainerPortrait: { top: PORTRAIT_COMPUTER_TOP_MARGIN, left: PORTRAIT_COMPUTER_CONTAINER_LEFT, right: "5%", width: "auto" },
    playerHandContainerLandscape: { bottom: 8, left: "21%", right: "21%", width: "auto" },
    computerHandContainerLandscape: { top: 8, left: "24%", right: "24%", width: "auto" },
    pagingContainer: {
        position: "absolute",
        zIndex: 100,
        left: 0,
        right: 0,
        height: HAND_CONTAINER_HEIGHT,
        pointerEvents: "box-none",
    },
    pagingContainerPortrait: { bottom: PORTRAIT_PLAYER_BOTTOM_MARGIN, right: 0, width: 85, left: 'auto' },
    pagingContainerLandscape: { bottom: 8, width: "90%" },
    pagingButtonBase: {
        position: "absolute",
        right: 0,
        width: "100%",
        height: HAND_CONTAINER_HEIGHT,
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
    rightPagingButton: { marginRight: 0 },
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

// MEMOIZATION: Only re-render if visual layout props or game ID change.
// We intentionally IGNORE 'game', 'playerState', 'opponentState' object reference changes
// because we rely on SharedValues for the data updates, or we only want to re-render 
// if specific fields like 'marketCardCount' change.
export default React.memo(WhotCoreUI, (prev, next) => {
    // 1. Layout & Stability Props (Must match)
    if (prev.gameInstanceId !== next.gameInstanceId) return false;

    // Fix: Interface uses stableWidth/stableHeight, not width/height directly in some cases
    if (prev.stableWidth !== next.stableWidth || prev.stableHeight !== next.stableHeight) return false;

    // Check if fonts changed
    if (prev.stableFont !== next.stableFont || prev.stableWhotFont !== next.stableWhotFont) return false;

    if (prev.isLandscape !== next.isLandscape) return false;

    // 2. High-Level Game Flags
    if (prev.showSuitSelector !== next.showSuitSelector) return false;
    if (prev.marketCardCount !== next.marketCardCount) return false;
    if (prev.activeCalledSuit !== next.activeCalledSuit) return false;
    if (prev.showPagingButton !== next.showPagingButton) return false;

    // 3. Game Over State
    if (prev.gameOver !== next.gameOver) return false;

    // 4. Turn & Timer — MUST re-render when turn changes so the timer ring switches player
    if (prev.playerState.isCurrentPlayer !== next.playerState.isCurrentPlayer) return false;
    if (prev.opponentState.isCurrentPlayer !== next.opponentState.isCurrentPlayer) return false;
    if (prev.turnEndTime !== next.turnEndTime) return false;
    if (prev.warningYellowAt !== next.warningYellowAt) return false;
    if (prev.warningRedAt !== next.warningRedAt) return false;

    // 5. Hand counts — must re-render when card count changes for badge display
    if (prev.playerState.handLength !== next.playerState.handLength) return false;
    if (prev.opponentState.handLength !== next.opponentState.handLength) return false;

    return true; // Props relevant to LAYOUT are identical.
});
