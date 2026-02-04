import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../../config/api';

class SocketService {
    private socket: Socket | null = null;
    private gameId: string | null = null;
    private listeners: Map<string, Function[]> = new Map();

    connect() {
        if (this.socket?.connected) return;

        console.log('[SocketService] Connecting to:', API_BASE_URL);
        this.socket = io(API_BASE_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        this.setupBaseListeners();
    }

    private setupBaseListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('[SocketService] Connected:', this.socket?.id);
            if (this.gameId) {
                console.log('[SocketService] Rejoining game:', this.gameId);
                this.socket?.emit('join-game', this.gameId);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('[SocketService] Disconnected');
        });

        this.socket.on('connect_error', (err) => {
            console.error('[SocketService] Connection error:', err.message);
        });

        // Opponent move handler
        this.socket.on('opponent-move', (move: any) => {
            // console.log('[SocketService] Received opponent move:', move);
            this.emitLocal('opponent-move', move);
        });
    }

    joinGame(gameId: string) {
        if (!this.socket) this.connect();

        this.gameId = gameId;
        if (this.socket?.connected) {
            console.log('[SocketService] Joining game room:', gameId);
            this.socket?.emit('join-game', gameId);
        } else {
            // Will join automatically on connect event
            console.log('[SocketService] Socket not ready, will join on connect:', gameId);
        }
    }

    leaveGame(gameId: string) {
        if (this.socket?.connected) {
            console.log('[SocketService] Leaving game room:', gameId);
            this.socket.emit('leave-game', gameId);
        }
        this.gameId = null;
    }

    emitMove(gameId: string, move: any) {
        if (!this.socket?.connected) {
            console.warn('[SocketService] Cannot emit move, socket disconnected');
            return;
        }
        // console.log('[SocketService] Emitting move for game:', gameId);
        this.socket.emit('game-move', { gameId, move });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // --- Subscription Management ---

    onOpponentMove(callback: (move: any) => void) {
        return this.on('opponent-move', callback);
    }

    private on(event: string, callback: Function) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(event);
            if (callbacks) {
                this.listeners.set(event, callbacks.filter(cb => cb !== callback));
            }
        };
    }

    private emitLocal(event: string, data: any) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(data));
        }
    }
}

export const socketService = new SocketService();
