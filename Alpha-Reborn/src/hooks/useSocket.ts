import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
  joinGame: (gameId: string) => void;
  leaveGame: (gameId: string) => void;
  sendMove: (gameId: string, move: any) => void;
  onOpponentMove: (callback: (move: any) => void) => void;
  offOpponentMove: () => void;
}

export const useSocket = (): UseSocketReturn => {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    // Initialize socket connection
    const socket = io('http://localhost:3000', {
      auth: {
        token: user.token // Assuming user has token
      },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      setConnectionError(null);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const joinGame = (gameId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('join-game', gameId);
    }
  };

  const leaveGame = (gameId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('leave-game', gameId);
    }
  };

  const sendMove = (gameId: string, move: any) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('game-move', { gameId, move });
    }
  };

  const onOpponentMove = (callback: (move: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on('opponent-move', callback);
    }
  };

  const offOpponentMove = () => {
    if (socketRef.current) {
      socketRef.current.off('opponent-move');
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    connectionError,
    joinGame,
    leaveGame,
    sendMove,
    onOpponentMove,
    offOpponentMove
  };
};
