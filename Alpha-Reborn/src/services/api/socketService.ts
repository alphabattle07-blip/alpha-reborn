import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../../config/api';
import { LOGIC_VERSION } from '../../games/ludo/core/ui/LudoGameLogic';

class SocketService {
    private socket: Socket | null = null;
    private gameId: string | null = null;
    private listeners: Map<string, Function[]> = new Map();

    // Persistent state for reconnection
    private userId: string | null = null;
    private pendingMatchReadyGameId: string | null = null;
    private chatMatchId: string | null = null;

    connect() {
        if (this.socket) return;

        console.log('[SocketService] Connecting to:', API_BASE_URL);
        this.socket = io(API_BASE_URL, {
            // 1. Force WebSocket only — skip polling upgrade, prevents mid-connection glitch
            transports: ['websocket'],

            // 2. Relaxed connection timeout — gives Render time to wake from cold-start
            timeout: 45000,

            // 3. Aggressive reconnection strategy (tuned from ADB logs: was 1000/5000 = 24s gap)
            reconnection: true,
            reconnectionAttempts: Infinity,  // Never stop trying
            reconnectionDelay: 500,          // Start retrying in 500ms (was 1000)
            reconnectionDelayMax: 2000,      // Cap at 2s between attempts (was 5000)
            randomizationFactor: 0.3,        // Slight jitter, less wasted time

            autoConnect: true,
            forceNew: false,
        });

        // Transport-level error logging (catches issues connect_error misses)
        if (this.socket.io?.engine) {
            this.socket.io.engine.on('error', (err: any) => {
                console.warn('[SocketService] Engine transport error:', err?.message || err);
            });
        }

        this.setupBaseListeners();
    }

    isConnected(): boolean {
        return this.socket?.connected === true;
    }

    private setupBaseListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('[SocketService] Connected:', this.socket?.id);

            // Re-register user on every connect/reconnect
            if (this.userId) {
                console.log('[SocketService] Re-registering user:', this.userId);
                this.socket?.emit('register', this.userId);
                
                // Enforce Logic version lock
                this.socket?.emit('LOGIC_VERSION_CHECK', LOGIC_VERSION);
            }

            this.emitLocal('connect');

            // Re-join game room
            if (this.gameId) {
                console.log('[SocketService] Rejoining game on connect:', this.gameId);
                this.socket?.emit('joinGame', this.gameId);
            }

            // Re-join chat room
            if (this.chatMatchId) {
                console.log('[SocketService] Rejoining chat room on connect:', this.chatMatchId);
                this.socket?.emit('join_match_chat', this.chatMatchId);
            }

            // Re-emit MATCH_READY if pending
            if (this.pendingMatchReadyGameId) {
                console.log('[SocketService] Re-emitting MATCH_READY on connect:', this.pendingMatchReadyGameId);
                this.socket?.emit('MATCH_READY', { gameId: this.pendingMatchReadyGameId });
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[SocketService] Disconnected:', reason);
            // Force immediate reconnect for all transport failures
            // 'transport error' was MISSING before — caused 24s reconnect delay (ADB log fix)
            if (reason === 'io server disconnect' || reason === 'ping timeout' || reason === 'transport close' || reason === 'transport error') {
                console.log('[SocketService] Transport lost. Forcing immediate reconnect attempt...');
                this.socket?.connect(); 
            }
            this.emitLocal('disconnect');
        });

        this.socket.on('connect_error', (err) => {
            console.warn('[SocketService] Connection error:', err.message);
        });

        // ─── UNIFIED GAME EVENT BRIDGE ───────────────────────────────────────────
        // ─── UNIFIED GAME EVENT BRIDGE ───────────────────────────────────────────
        // The server emits all Ludo events as: gameEvent { eventId, stateVersion, type, payload, serverTime }
        // We unwrap them here so the rest of the app can subscribe to named events
        // (ludoActionUpdate, turnStarted, etc.) without knowing the envelope structure.
        
        // Envelope-level dedup: drop duplicate envelopes from reconnects/multi-session
        const processedEnvelopes = new Set<string>();
        const ENVELOPE_SET_MAX = 300;

        this.socket.on('gameEvent', (event: any) => {
            if (!event) return;

            const { type, payload, eventId, stateVersion, serverTime } = event;
            if (!type) return;

            // Dedup at the envelope level — most robust guard against double-processing
            if (eventId) {
                const envelopeKey = `${type}:${eventId}`;
                if (processedEnvelopes.has(envelopeKey)) return;
                processedEnvelopes.add(envelopeKey);
                if (processedEnvelopes.size > ENVELOPE_SET_MAX) {
                    const first = processedEnvelopes.values().next().value;
                    if (first !== undefined) processedEnvelopes.delete(first);
                }
            }

            console.log(`[SocketBridge] Received ${type} | ID: ${eventId || 'N/A'}`);

            switch (type) {
                case 'LUDO_ACTION_UPDATE':
                    // Flatten envelope into the payload shape the listener expects
                    this.emitLocal('ludoActionUpdate', {
                        ...payload,
                        eventId,
                        stateVersion,
                        serverTime,
                    });
                    break;

                case 'TURN_STARTED':
                    this.emitLocal('turnStarted', {
                        ...payload,
                        eventId,
                        stateVersion,
                        serverTime,
                    });
                    break;

                case 'DICE_ROLLING_STARTED':
                    // Route through ludoActionUpdate channel so existing handler picks it up
                    this.emitLocal('ludoActionUpdate', {
                        type: 'DICE_ROLLING_STARTED',
                        ...payload,
                        eventId,
                    });
                    break;

                case 'GAME_STATE_UPDATE': {
                    // Full-board sync (e.g. after turn timeout auto-play). 
                    // Unbox {board: scrubbed} structure generated by unified socket pipeline.
                    // Merge envelope-level versioning onto the board so client dedup works.
                    const board = payload.board || payload;
                    if (eventId && !board.eventId) board.eventId = eventId;
                    if (stateVersion !== undefined && board.stateVersion === undefined) board.stateVersion = stateVersion;
                    this.emitLocal('gameStateUpdate', board, serverTime);
                    break;
                }

                case 'MOVE_CONFIRMED':
                    // Acknowledgement that a move was accepted. Harmless but useful for latency logging.
                    this.emitLocal('moveConfirmed', payload);
                    break;

                case 'MOVE_REJECTED':
                    this.emitLocal('moveRejected', payload);
                    break;

                case 'OPPONENT_MOVE':
                    // Route through the opponent-move local channel.
                    // payload contains { excludePlayerId, type, cardId, card, suitChoice }
                    this.emitLocal('opponent-move', {
                        ...payload,
                        serverTime,
                    });
                    break;

                case 'GAME_FORFEIT':
                case 'GAME_ENDED':
                    this.emitLocal('gameEnded', payload);
                    break;

                default:
                    // Forward unknown event types for future extensibility
                    this.emitLocal(`gameEvent:${type}`, event);
                    break;
            }
        });

        // Legacy listeners retained as fallbacks:
        // - gameStateUpdate: still used by recoverLudoGame (direct socket.emit from server)
        // - gameEnded / gameForfeit: kept for non-Ludo games and direct emits
        this.socket.on('ludoActionUpdate', (data: any) => {
            // Legacy flat event — only fires if server emits it directly (not via broadcastGameEvent)
            this.emitLocal('ludoActionUpdate', data);
        });

        this.socket.on('turnStarted', (data: any) => {
            this.emitLocal('turnStarted', data);
        });



        // Legacy direct-emit listeners (not via gameEvent envelope)
        // gameStateUpdate: used by recoverLudoGame recovery path (socket.emit directly, not broadcastGameEvent)
        this.socket.on('gameStateUpdate', (payload: any) => {
            const board = payload?.board || payload;
            const serverTime = payload?.serverTime;
            this.emitLocal('gameStateUpdate', board, serverTime);
        });

        // gameEnded / gameForfeit: direct emits for non-Ludo games or legacy paths
        this.socket.on('gameEnded', (data: any) => {
            console.log('[SocketService] Received gameEnded (direct):', data);
            this.emitLocal('gameEnded', data);
        });

        this.socket.on('gameForfeit', (data: any) => {
            console.log('[SocketService] Received gameForfeit (direct):', data);
            this.emitLocal('gameEnded', data);
        });

        // Opponent move handler (non-Ludo games)
        this.socket.on('opponent-move', (move: any) => {
            this.emitLocal('opponent-move', move);
        });

        // Match Ready Handshake events
        this.socket.on('matchCountdown', (data: any) => {
            console.log('[SocketService] Received matchCountdown:', data);
            // Once countdown starts, clear the pending flag
            this.pendingMatchReadyGameId = null;
            this.emitLocal('matchCountdown', data);
        });

        this.socket.on('matchCancelled', (data: any) => {
            console.log('[SocketService] Received matchCancelled:', data);
            this.pendingMatchReadyGameId = null;
            this.emitLocal('matchCancelled', data);
        });

        // Chat events
        this.socket.on('receive_match_message', (data: any) => {
            this.emitLocal('receive_match_message', data);
        });

        this.socket.on('chat_history', (data: any) => {
            console.log('[SocketService] Received chat history:', data?.messages?.length, 'messages');
            this.emitLocal('chat_history', data);
        });

        this.socket.on('chat_status', (data: any) => {
            this.emitLocal('chat_status', data);
        });

        this.socket.on('chat_error', (data: any) => {
            console.warn('[SocketService] Chat error:', data?.message);
            this.emitLocal('chat_error', data);
        });

        this.socket.on('LOGIC_VERSION_MISMATCH', () => {
            console.error('[SocketService] FATAL: Logic version mismatch with server!');
            // Stop attempting to reconnect since the app must be forcefully updated
            if (this.socket && this.socket.io) {
                this.socket.io.reconnection(false);
            }
            this.emitLocal('LOGIC_VERSION_MISMATCH');
        });
    }

    getSocket() {
        return this.socket;
    }

    recoverLudoGame(gameId: string) {
        if (this.socket?.connected) {
            console.log('[SocketService] Emitting recoverLudoGame:', gameId);
            this.socket.emit('recoverLudoGame', gameId);
        }
    }

    joinGame(gameId: string) {
        this.gameId = gameId;
        if (!this.socket) {
            this.connect();
        } else if (this.socket.connected) {
            console.log('[SocketService] Joining game room:', gameId);
            this.socket.emit('joinGame', gameId);
        }
        // If not connected, the 'connect' handler will handle it
    }

    leaveGame(gameId: string) {
        if (this.socket?.connected) {
            console.log('[SocketService] Leaving game room:', gameId);
            this.socket.emit('leaveGame', gameId);
        }
        this.gameId = null;
        this.pendingMatchReadyGameId = null;
    }

    emitForfeit(gameId: string) {
        if (!this.socket?.connected) {
            console.warn('[SocketService] Cannot emit forfeit, socket disconnected');
            return;
        }
        console.log('[SocketService] Emitting forfeitGame for game:', gameId);
        this.socket.emit('forfeitGame', { gameId });
    }

    register(userId: string) {
        this.userId = userId; // Store for reconnects
        if (!this.socket) this.connect();

        if (this.socket?.connected) {
            console.log('[SocketService] Registering user:', userId);
            this.socket.emit('register', userId);
        }
        // If not connected, the 'connect' handler will handle it
    }

    emitMove(gameId: string, move: any) {
        if (!this.socket?.connected) {
            console.warn('[SocketService] Cannot emit move, socket disconnected. Reconnecting...');
            this.connect();
            return;
        }

        // Map frontend action types to backend engine types
        let backendMove: any = { ...move };
        if (move.type === 'CARD_PLAYED') {
            backendMove.type = 'PLAY_CARD';
        } else if (move.type === 'PICK_CARD') {
            backendMove.type = 'DRAW';
        } else if (move.type === 'FORCED_DRAW') {
            backendMove.type = 'DRAW';
        }

        try {
            console.log('[SocketService] Emitting gameAction:', backendMove.type, 'for game:', gameId);
            this.socket.emit('gameAction', {
                gameId,
                gameType: 'whot',
                data: backendMove
            });
        } catch (e: any) {
            console.warn('[SocketService] EmitMove failed:', e.message || e);
            // Don't crash the app if socket layer throws
        }
    }

    emitAction(gameId: string, gameType: string, data: any) {
        if (!this.socket?.connected) {
            console.warn(`[SocketService] Cannot emit action for ${gameType}, socket disconnected. Reconnecting...`);
            this.connect();
            return;
        }
        try {
            console.log(`[SocketService] Emitting gameAction: ${data?.type} for game: ${gameId}`);
            this.socket.emit('gameAction', {
                gameId,
                gameType,
                data
            });
        } catch (e: any) {
            console.warn('[SocketService] EmitAction failed:', e.message || e);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // --- Subscription Management ---

    onConnect(callback: () => void) {
        return this.on('connect', callback);
    }

    onDisconnect(callback: () => void) {
        return this.on('disconnect', callback);
    }

    onOpponentMove(callback: (move: any) => void) {
        return this.on('opponent-move', callback);
    }

    onGameStateUpdate(callback: (board: any, serverTime?: number) => void) {
        return this.on('gameStateUpdate', callback);
    }

    onTurnStarted(callback: (data: any) => void) {
        return this.on('turnStarted', callback);
    }

    onMoveRejected(callback: (data: any) => void) {
        return this.on('moveRejected', callback);
    }

    onLudoActionUpdate(callback: (data: any) => void) {
        return this.on('ludoActionUpdate', callback);
    }

    onGameEnded(callback: (data: any) => void) {
        return this.on('gameEnded', callback);
    }

    onLogicVersionMismatch(callback: () => void) {
        return this.on('LOGIC_VERSION_MISMATCH', callback);
    }

    // --- Match Ready Handshake ---

    emitMatchReady(gameId: string) {
        this.pendingMatchReadyGameId = gameId; // Store for reconnects
        if (!this.socket) this.connect();

        if (this.socket?.connected) {
            console.log('[SocketService] Emitting MATCH_READY for game:', gameId);
            this.socket.emit('MATCH_READY', { gameId });
        }
        // If not connected, the 'connect' handler will handle it
    }

    onMatchCountdown(callback: (data: any) => void) {
        return this.on('matchCountdown', callback);
    }

    onMatchCancelled(callback: (data: any) => void) {
        return this.on('matchCancelled', callback);
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
                const filtered = callbacks.filter(cb => cb !== callback);
                if (filtered.length === 0) {
                    this.listeners.delete(event);
                } else {
                    this.listeners.set(event, filtered);
                }
            }
        };
    }

    // --- Chat Service Management ---

    joinMatchChat(matchId: string) {
        this.chatMatchId = matchId; // Store for reconnects
        if (!this.socket) this.connect();

        if (this.socket?.connected) {
            console.log('[SocketService] Joining chat room:', matchId);
            this.socket.emit('join_match_chat', matchId);
        }
        // If not connected, the 'connect' handler will handle it
    }

    sendMatchMessage(matchId: string, message: string) {
        if (!this.socket?.connected) {
            console.warn('[SocketService] Cannot send message, socket disconnected');
            return;
        }
        console.log('[SocketService] Sending match message to:', matchId);
        this.socket.emit('send_match_message', { matchId, message });
    }

    leaveMatchChat(matchId: string) {
        if (this.socket?.connected) {
            console.log('[SocketService] Leaving chat room:', matchId);
            this.socket.emit('leave_match_chat', matchId);
        }
        this.chatMatchId = null;
    }

    onChatStatus(callback: (data: any) => void) {
        return this.on('chat_status', callback);
    }

    onChatHistory(callback: (data: any) => void) {
        return this.on('chat_history', callback);
    }

    onReceiveMatchMessage(callback: (data: any) => void) {
        // Create a stable wrapper so it can be un-subscribed correctly by reference
        const wrapper = (payload: any) => {
            console.log('[SocketService] Raw match message payload received:', JSON.stringify(payload, null, 2));
            callback(payload);
        };
        return this.on('receive_match_message', wrapper);
    }

    onChatError(callback: (data: any) => void) {
        return this.on('chat_error', callback);
    }

    private emitLocal(event: string, ...args: any[]) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(...args));
        }
    }
}

export const socketService = new SocketService();
