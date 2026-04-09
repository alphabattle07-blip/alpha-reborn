// DiceHouseMaster.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Touch-only dice controller. NO Canvas! Dice VISUALS are now rendered
// inside LudoSkiaBoard's Canvas via shared values from useDiceAnimations.
// This eliminates the second GPU surface entirely → zero EGL crashes.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import {
    StyleSheet,
    useWindowDimensions,
    View,
    TouchableOpacity,
    Text,
} from 'react-native';
import { LudoTimerRing } from './LudoTimerRing';



// ─── Types ───────────────────────────────────────────────────────────────────
interface TimerProps {
    isActive: boolean;
    turnStartTime?: number;
    turnDuration?: number;
    yellowAt?: number;
    redAt?: number;
    serverTimeOffset?: number;
}

interface DiceHouseMasterProps {
    activeColor: 'blue' | 'green';
    waitingForRoll: boolean;
    disabled?: boolean;
    rankIcon: string;
    onPress: () => void;
    isRolling?: boolean;
    timerProps?: TimerProps;
    isShown?: boolean;
    style?: any;
    // Responsive Layout Props
    boardX: number;
    boardY: number;
    boardSize: number;
}

// ─── Component (Touch + Timer ONLY — no Canvas!) ─────────────────────────────
export const DiceHouseMaster: React.FC<DiceHouseMasterProps> = ({
    activeColor,
    waitingForRoll,
    disabled = false,
    rankIcon,
    onPress,
    isRolling = false,
    timerProps,
    isShown = true,
    style,
    boardX,
    boardY,
    boardSize,
}) => {
    const { width: screenW } = useWindowDimensions();

    // Responsive sizing
    const houseW = boardSize * 0.23; // Scaled relative to board
    const houseH = boardSize * 0.13;
    const yardWidth = (boardSize / 15 * 0.7 * 4) + (boardSize * 0.016) + (boardSize * 0.034); // matches LudoNativeBoard calc
    const gap = screenW * 0.05; // 5% screen width gap

    let houseLeft = 0;
    let houseTop = 0;

    if (activeColor === 'blue') {
        houseLeft = boardX + yardWidth + gap;
        houseTop = boardY + boardSize + (boardSize * 0.048); // aligned with Blue yard top
    } else {
        houseLeft = (boardX + boardSize - yardWidth) - gap - houseW;
        houseTop = boardY + (-0.095 * boardSize) - (houseH / 2); // Shifted up further to avoid touching board
    }

    const touchStyle = {
        position: 'absolute' as const,
        left: houseLeft,
        top: houseTop,
        width: houseW,
        height: houseH,
    };

    return (
        <View style={style} pointerEvents="box-none">
            {/* Touch target */}
            <View style={touchStyle} pointerEvents="box-none">
                <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={onPress}
                    disabled={disabled || !waitingForRoll || isRolling}
                    activeOpacity={0.75}
                />

                {waitingForRoll && !isRolling && (
                    <View style={styles.overlayContainer} pointerEvents="none">
                        <Text style={styles.rankIcon}>{rankIcon}</Text>
                    </View>
                )}
            </View>

            {/* Timer ring */}
            {timerProps?.isActive && (
                <View style={[touchStyle, styles.timerWrapper]} pointerEvents="none">
                    <LudoTimerRing
                        isActive={timerProps.isActive}
                        turnStartTime={timerProps.turnStartTime}
                        turnDuration={timerProps.turnDuration}
                        redAt={timerProps.redAt}
                        serverTimeOffset={timerProps.serverTimeOffset}
                        width={houseW}
                        height={houseH}
                        borderRadius={17}
                        strokeWidth={3}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rankIcon: {
        fontSize: 28,
    },
    timerWrapper: {},
});
