import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    FlatList,
    Keyboard,
    SafeAreaView,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { toggleChatVisibility } from '../../store/slices/chatSlice';
import { socketService } from '../../services/api/socketService';

interface MatchChatOverlayProps {
    matchId: string;
}

export const MatchChatOverlay: React.FC<MatchChatOverlayProps> = React.memo(({ matchId }) => {
    const dispatch = useAppDispatch();
    const { messages, isChatVisible } = useAppSelector(state => state.chat);
    const { profile } = useAppSelector(state => state.user);
    const [inputText, setInputText] = useState('');
    const [isQuickChatOpen, setIsQuickChatOpen] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const listRef = useRef<FlatList>(null);

    const QUICK_MESSAGES = [
        "👋 Hi",
        "🍀 Good luck",
        "😄 Nice one",
        "😅 Oops",
        "🔥 Wow",
        "😂 Haha",
        "🤝 Good game"
    ];

    const handleQuickSend = (msg: string) => {
        socketService.sendMatchMessage(matchId, msg);
        setIsQuickChatOpen(false); // Close drawer after send
    };

    // Explicitly track keyboard size for 100% reliable positioning, especially on Android modals
    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvt, (e) => {
            setKeyboardHeight(e.endCoordinates.height);
        });
        const hideSub = Keyboard.addListener(hideEvt, () => {
            setKeyboardHeight(0);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (isChatVisible && messages.length > 0) {
            setTimeout(() => {
                listRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages, isChatVisible]);

    const handleClose = () => {
        dispatch(toggleChatVisibility(false));
    };

    const handleSend = () => {
        const trimmed = inputText.trim();
        if (!trimmed || trimmed.length > 300) return;

        socketService.sendMatchMessage(matchId, trimmed);
        setInputText('');
    };

    const renderMessage = ({ item }: { item: any }) => {
        const isMe = item.senderId === profile?.id;

        // Safely parse time, fallback to 'Now' if formatting totally failed
        let timeStr = 'Now';
        try {
            if (item.timestamp) {
                const date = new Date(item.timestamp);
                if (!isNaN(date.getTime())) {
                    timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
            }
        } catch (e) { }

        // Fallback message string if nested weirdly
        const msgText = typeof item.message === 'string' ? item.message : String(item.message || '');

        return (
            <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : styles.messageWrapperOpponent]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOpponent]}>
                    <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOpponent]}>
                        {msgText}
                    </Text>
                </View>
                <Text style={styles.timeText}>{timeStr}</Text>
            </View>
        );
    };

    return (
        <Modal
            visible={isChatVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={handleClose}
        >
            <View style={[styles.overlayContainer, { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 40 : 0 }]}>
                {/* Touchable background to dismiss */}
                <TouchableOpacity style={styles.backgroundDismiss} activeOpacity={1} onPress={handleClose} />

                <View style={styles.chatContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Match Chat</Text>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={15}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Message List */}
                    <FlatList
                        ref={listRef}
                        style={{ flex: 1, zIndex: 1 }}
                        data={messages}
                        keyExtractor={(item, index) => item.id || index.toString()}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="chatbubbles-outline" size={48} color="#555" />
                                <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
                            </View>
                        }
                        onLayout={() => {
                            if (messages.length > 0) {
                                listRef.current?.scrollToEnd({ animated: false });
                            }
                        }}
                    />

                    {/* Input Area */}
                    <SafeAreaView style={{ backgroundColor: '#252525', zIndex: 2 }}>
                        {/* Quick Chat Drawer */}
                        {isQuickChatOpen && (
                            <View style={styles.quickChatContainer}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChatScroll}>
                                    {QUICK_MESSAGES.map((msg, idx) => (
                                        <TouchableOpacity key={idx} style={styles.quickChatPill} onPress={() => handleQuickSend(msg)}>
                                            <Text style={styles.quickChatText}>{msg}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        <View style={styles.inputArea}>
                            <TouchableOpacity onPress={() => setIsQuickChatOpen(!isQuickChatOpen)} style={styles.quickChatToggle}>
                                <Ionicons name={isQuickChatOpen ? "close-circle" : "flash"} size={26} color="#2ca444" />
                            </TouchableOpacity>
                            <TextInput
                                style={styles.input}
                                placeholder="Type a message..."
                                placeholderTextColor="#888"
                                value={inputText}
                                onChangeText={setInputText}
                                maxLength={300}
                                multiline
                            />
                            <TouchableOpacity
                                style={[
                                    styles.sendButton,
                                    (!inputText.trim() || inputText.length > 300) && styles.sendButtonDisabled
                                ]}
                                onPress={handleSend}
                                disabled={!inputText.trim() || inputText.length > 300}
                            >
                                <Ionicons name="send" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </View>
            </View>
        </Modal>
    );
});

const styles = StyleSheet.create({
    overlayContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backgroundDismiss: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)', // Dim the game screen slightly
    },
    chatContainer: {
        backgroundColor: '#1E1E1E',
        height: '60%', // Takes up bottom 60% of screen
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeBtn: {
        padding: 5,
    },
    listContent: {
        padding: 15,
        paddingBottom: 20,
        flexGrow: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: '#888',
        marginTop: 10,
        fontSize: 14,
    },
    messageWrapper: {
        marginBottom: 12,
        maxWidth: '80%',
    },
    messageWrapperMe: {
        alignSelf: 'flex-end',
    },
    messageWrapperOpponent: {
        alignSelf: 'flex-start',
    },
    bubble: {
        padding: 12,
        borderRadius: 16,
    },
    bubbleMe: {
        backgroundColor: '#2ca444', // Green
        borderBottomRightRadius: 4,
    },
    bubbleOpponent: {
        backgroundColor: '#333', // Dark Gray
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 15,
    },
    messageTextMe: {
        color: '#fff',
    },
    messageTextOpponent: {
        color: '#E0E0E0',
    },
    timeText: {
        fontSize: 10,
        color: '#777',
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        paddingBottom: Platform.OS === 'android' ? 20 : 10, // Additional bump for Android nav bar
        backgroundColor: '#252525',
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    input: {
        flex: 1,
        backgroundColor: '#151515',
        color: '#fff',
        borderRadius: 22,
        paddingHorizontal: 15,
        paddingTop: Platform.OS === 'ios' ? 14 : 10,
        paddingBottom: Platform.OS === 'ios' ? 14 : 10,
        maxHeight: 120,
        minHeight: 44, // Matches send button height to ensure perfect center alignment
        fontSize: 15,
        textAlignVertical: 'center',
    },
    sendButton: {
        backgroundColor: '#2ca444',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
    sendButtonDisabled: {
        backgroundColor: '#555',
    },
    quickChatToggle: {
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickChatContainer: {
        backgroundColor: '#202020',
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    quickChatScroll: {
        paddingHorizontal: 15,
        alignItems: 'center',
    },
    quickChatPill: {
        backgroundColor: '#333',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#444',
        marginRight: 8,
    },
    quickChatText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
});
