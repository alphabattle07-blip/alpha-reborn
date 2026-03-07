import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, StyleProp, ViewStyle, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { toggleChatVisibility } from '../../store/slices/chatSlice';

interface ChatToggleButtonProps {
    style?: StyleProp<ViewStyle>;
}

export const ChatToggleButton: React.FC<ChatToggleButtonProps> = ({ style }) => {
    const dispatch = useAppDispatch();
    const { unreadCount, messages, isChatVisible } = useAppSelector(state => state.chat);
    const { profile } = useAppSelector(state => state.user);

    const [popoutMessage, setPopoutMessage] = useState<string | null>(null);
    const slideAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // Track message array lengths to only popout on genuinely new incoming events
    const prevLen = useRef(messages.length);

    const handlePress = () => {
        dispatch(toggleChatVisibility(true));
        setPopoutMessage(null); // Dismiss popout instantly if chat is opened manually
    };

    // Watch for new incoming messages
    useEffect(() => {
        const isNewMessage = messages.length > prevLen.current;
        prevLen.current = messages.length;

        if (isNewMessage && messages.length > 0 && !isChatVisible) {
            const lastMessage = messages[messages.length - 1];

            // Only show popout if the message was sent by the opponent
            if (lastMessage.senderId !== profile?.id) {
                // Ensure text is safely parsed
                let msgText = typeof lastMessage.message === 'string'
                    ? lastMessage.message
                    : String(lastMessage.message || '');

                setPopoutMessage(msgText);

                // Reset animations
                slideAnim.setValue(0);
                fadeAnim.setValue(0);

                // Reveal: slide right slightly and fade in
                Animated.parallel([
                    Animated.timing(slideAnim, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                    }),
                    Animated.timing(fadeAnim, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                    })
                ]).start();

                // Auto-hide after 3.5s
                const timer = setTimeout(() => {
                    Animated.parallel([
                        Animated.timing(slideAnim, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                        }),
                        Animated.timing(fadeAnim, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                        })
                    ]).start(() => setPopoutMessage(null));
                }, 3500);

                return () => clearTimeout(timer);
            }
        }
    }, [messages, isChatVisible, profile?.id]);

    return (
        <View style={[styles.wrapper, style]}>
            <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.8}>
                <Ionicons name="chatbubbles" size={28} color="#fff" />
                {unreadCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>

            {/* Transient Popout Bubble (Appears to the right of the button) */}
            {popoutMessage && (
                <Animated.View style={[
                    styles.popoutBubble,
                    {
                        opacity: fadeAnim,
                        transform: [{
                            translateX: slideAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-15, 0] // Slides slightly out from the button
                            })
                        }]
                    }
                ]} pointerEvents="none">
                    <Text style={styles.popoutText} numberOfLines={2}>
                        {popoutMessage}
                    </Text>
                </Animated.View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    container: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#2ca444', // Alpha Battle green
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
        zIndex: 10,
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#ff4444',
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 2,
        borderColor: '#2ca444',
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    popoutBubble: {
        position: 'absolute',
        left: 60, // Sits exactly 10px to the right of the 50px wide button
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        paddingHorizontal: 15,
        paddingVertical: 12,
        borderRadius: 20,
        maxWidth: 200,
        borderWidth: 1,
        borderColor: '#444',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 6,
        zIndex: 5,
    },
    popoutText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    }
});
