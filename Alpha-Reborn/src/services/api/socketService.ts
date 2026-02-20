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
                console.log('[SocketService] Rejoining game on connect:', this.gameId);
                this.joinGame(this.gameId); // Use method to ensure proper flow
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

        // ✅ HANDLE FULL STATE SYNC as a potential "move" (for robustness)
        this.socket.on('gameStateUpdate', (payload: any) => {
            // We can treat this as an opponent-move event so WhotOnline picks it up
            // WhotOnline checks if payload has 'type' (Action) or is just state (Sync)
            // So simply forwarding it works.
            // console.log('[SocketService] Received Game State Update');
            this.emitLocal('opponent-move', payload?.board || payload);
        });
    }

    joinGame(gameId: string) {
        this.gameId = gameId;
        if (!this.socket) {
            this.connect();
        } else if (this.socket.connected) {
            console.log('[SocketService] Joining game room:', gameId);
            this.socket.emit('joinGame', gameId);
        } else {
            // Already connecting/disconnected, will be handled by 'connect' listener
            console.log('[SocketService] Socket not ready, will join on connect:', gameId);
        }
    }

    leaveGame(gameId: string) {
        if (this.socket?.connected) {
            console.log('[SocketService] Leaving game room:', gameId);
            this.socket.emit('leaveGame', gameId);
        }
        this.gameId = null;
    }

    register(userId: string) {
        if (!this.socket) this.connect();

        if (this.socket?.connected) {
            console.log('[SocketService] Registering user immediately:', userId);
            this.socket.emit('register', userId);
        } else {
            console.log('[SocketService] Socket not connected, queuing registration for:', userId);
            // Use a one-time listener for the NEXT connect event
            this.socket?.once('connect', () => {
                console.log('[SocketService] Connected, executing queued registration for:', userId);
                this.socket?.emit('register', userId);
            });
        }
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
