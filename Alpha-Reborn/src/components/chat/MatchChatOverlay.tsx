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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { toggleChatVisibility } from '../../store/slices/chatSlice';
import { socketService } from '../../services/api/socketService';

interface MatchChatOverlayProps {
    matchId: string;
}

export const MatchChatOverlay: React.FC<MatchChatOverlayProps> = ({ matchId }) => {
    const dispatch = useAppDispatch();
    const { messages, isChatVisible } = useAppSelector(state => state.chat);
    const { profile } = useAppSelector(state => state.user);
    const [inputText, setInputText] = useState('');
    const listRef = useRef<FlatList>(null);

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
        const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
            <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : styles.messageWrapperOpponent]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOpponent]}>
                    <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOpponent]}>
                        {item.message}
                    </Text>
                </View>
                <Text style={styles.timeText}>{time}</Text>
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
            <View style={styles.overlayContainer}>
                {/* Touchable background to dismiss */}
                <TouchableOpacity style={styles.backgroundDismiss} activeOpacity={1} onPress={handleClose} />

                <KeyboardAvoidingView
                    style={styles.chatContainer}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
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
                    <View style={styles.inputArea}>
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
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

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
        paddingBottom: Platform.OS === 'ios' ? 25 : 10,
        backgroundColor: '#252525',
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    input: {
        flex: 1,
        backgroundColor: '#151515',
        color: '#fff',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingTop: 10,
        paddingBottom: 10,
        maxHeight: 100,
        minHeight: 40,
        fontSize: 15,
    },
    sendButton: {
        backgroundColor: '#2ca444',
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
    sendButtonDisabled: {
        backgroundColor: '#555',
    }
});
