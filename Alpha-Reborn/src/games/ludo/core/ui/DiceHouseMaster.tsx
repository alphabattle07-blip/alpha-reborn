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

// ─── Constants ───────────────────────────────────────────────────────────────
const DICE_POS = {
    blue:  { x: 0.385, y: 0.800 },
    green: { x: 0.600, y: 0.270 },
} as const;

const HOUSE_W = 90;
const HOUSE_H = 60;

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
}) => {
    const { width: screenW, height: screenH } = useWindowDimensions();

    const pos = DICE_POS[activeColor];
    const houseLeft = pos.x * screenW - HOUSE_W / 2;
    const houseTop  = pos.y * screenH - HOUSE_H / 2;

    const touchStyle = {
        position: 'absolute' as const,
        left: houseLeft,
        top:  houseTop,
        width:  HOUSE_W + 4,
        height: HOUSE_H + 4,
    };

    if (!isShown) return null;

    return (
        <>
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
                        width={HOUSE_W + 4}
                        height={HOUSE_H + 4}
                        borderRadius={17}
                        strokeWidth={3}
                    />
                </View>
            )}
        </>
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
