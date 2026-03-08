import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ChatMessage {
    id: string; // usually timestamp + senderId for uniqueness
    senderId: string;
    message: string;
    timestamp: string;
}

interface ChatState {
    messages: ChatMessage[];
    unreadCount: number;
    isChatVisible: boolean;
}

const initialState: ChatState = {
    messages: [],
    unreadCount: 0,
    isChatVisible: false,
};

const chatSlice = createSlice({
    name: 'chat',
    initialState,
    reducers: {
        setHistory: (state, action: PayloadAction<ChatMessage[]>) => {
            state.messages = action.payload;
            state.unreadCount = 0; // History implies they just joined or reconnect, treat as read
        },
        addMessage: (state, action: PayloadAction<{ message: ChatMessage; currentUserId: string }>) => {
            const { message, currentUserId } = action.payload;

            // DEDUPLICATION: Check if message with this ID already exists to prevent UI duplicates
            // and unique key warnings in React.
            if (state.messages.some(m => m.id === message.id)) {
                console.log(`[ChatSlice] Ignoring duplicate message ID: ${message.id}`);
                return;
            }

            state.messages.push(message);

            // If the chat is closed AND this message is from the opponent, bump unread
            if (!state.isChatVisible && message.senderId !== currentUserId) {
                state.unreadCount += 1;
            }
        },
        toggleChatVisibility: (state, action: PayloadAction<boolean>) => {
            state.isChatVisible = action.payload;
            if (action.payload) {
                state.unreadCount = 0; // Clear unread when opened
            }
        },
        resetUnreadCount: (state) => {
            state.unreadCount = 0;
        },
        clearChat: (state) => {
            state.messages = [];
            state.unreadCount = 0;
            state.isChatVisible = false;
        }
    }
});

export const { setHistory, addMessage, toggleChatVisibility, resetUnreadCount, clearChat } = chatSlice.actions;
export default chatSlice.reducer;
