import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import {
  createOnlineGame,
  joinOnlineGame,
  fetchAvailableGames,
  updateOnlineGameState,
  fetchGameState
} from '../../../../store/thunks/onlineGameThunks';
import { clearCurrentGame, setCurrentGame } from '../../../../store/slices/onlineGameSlice';
import { usePlayerProfile } from '../../../../hooks/usePlayerProfile';
import { calculateMoveResult, Capture } from "../core/AyoCoreLogic";
import { AyoSkiaImageBoard } from "../core/AyoSkiaBoard"; // Directly use the board component
import GamePlayerProfile from "../core/GamePlayerProfile"; // Directly use the profile component
import AyoGameOver from "../computer/AyoGameOver";
import { Ionicons } from '@expo/vector-icons';
import { matchmakingService } from '../../../../services/api/matchmakingService';

// --- Board Rotation Helper ---
// Rotates the board so that the player's side is always at the bottom (indices 6-11).
// If we are Player 1 (logically 0-5), we rotate by 6.
// If we are Player 2 (logically 6-11), we keep it as is.
const rotateBoard = (board: number[]) => {
  return [...board.slice(6, 12), ...board.slice(0, 6)];
};

const unrotateBoard = (board: number[]) => {
  return [...board.slice(6, 12), ...board.slice(0, 6)]; // Rotation is symmetric (shift 6 in mod 12)
};

const mapPitToVisual = (pit: number) => (pit + 6) % 12;
const mapPitToLogical = (pit: number) => (pit + 6) % 12;

const AyoOnlineUI = () => {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const { currentGame, availableGames, isLoading, error } = useAppSelector(state => state.onlineGame);
  const { profile: userProfile } = useAppSelector(state => state.user);
  const { isAuthenticated, token } = useAppSelector(state => state.auth);
  const playerProfile = usePlayerProfile('ayo');

  // Local State for Animation & Interaction
  const [visualBoard, setVisualBoard] = useState<number[]>(Array(12).fill(4));
  const [boardBeforeMove, setBoardBeforeMove] = useState<number[]>(Array(12).fill(4));
  const [animationPaths, setAnimationPaths] = useState<number[][]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pendingServerUpdate, setPendingServerUpdate] = useState<{ board: number[], turn: string } | null>(null);
  const previousBoardSnapshot = useRef<number[] | null>(null);

  // Matchmaking State
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [matchmakingMessage, setMatchmakingMessage] = useState('Finding match...');
  const matchmakingIntervalRef = useRef<any>(null);
  const hasStartedMatchmaking = useRef(false);

  // Identify Player Role
  const isPlayer1 = currentGame?.player1?.id === userProfile?.id;
  const isPlayer2 = currentGame?.player2?.id === userProfile?.id;
  const amISpectator = !isPlayer1 && !isPlayer2;

  // Derived Properties based on Role
  // We want to simulate that WE are always Player 2 (Bottom) visually.
  // If we are P1, we rotate everything.
  const needsRotation = isPlayer1;

  // --- Automatic Matchmaking ---
  useEffect(() => {
    // Check if user is authenticated before starting matchmaking
    if (!isAuthenticated || !token || !userProfile?.id) {
      console.log('User not authenticated, redirecting back', { isAuthenticated, hasToken: !!token, hasProfile: !!userProfile?.id });
      Alert.alert(
        'Authentication Required',
        'Please log in to play online.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
      return;
    }

    // Prevent duplicate matchmaking calls
    if (hasStartedMatchmaking.current) {
      console.log('Matchmaking already started, skipping');
      return;
    }

    // Start matchmaking automatically when component mounts (if no current game)
    if (!currentGame) {
      hasStartedMatchmaking.current = true;
      startAutomaticMatchmaking();
    }

    return () => {
      // Cleanup: cancel matchmaking when component unmounts
      if (matchmakingIntervalRef.current) {
        clearInterval(matchmakingIntervalRef.current);
      }
      if (isMatchmaking) {
        matchmakingService.cancelMatchmaking().catch(console.error);
      }
      hasStartedMatchmaking.current = false;
    };
  }, []);

  // Handle Game Polling
  useEffect(() => {
    if (currentGame?.id) {
      if (!isAnimating) {
        // Initial sync or polling updates
        syncGameStateFromProps();
      }

      const interval = setInterval(() => {
        // Only fetch. Syncing happens in useEffect dependency on currentGame
        dispatch(fetchGameState(currentGame.id));
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [currentGame?.id, dispatch]);

  // --- Sync State ---
  // When currentGame updates from server, update local visual board if not animating
  useEffect(() => {
    if (currentGame && !isAnimating) {
      syncGameStateFromProps();
    }
  }, [currentGame, isAnimating, needsRotation]);

  const syncGameStateFromProps = () => {
    if (!currentGame || isAnimating) return;

    const serverBoard = currentGame.board || Array(12).fill(4);
    const displayBoard = needsRotation ? rotateBoard(serverBoard) : serverBoard;

    // Detect if opponent made a move
    if (previousBoardSnapshot.current &&
      JSON.stringify(previousBoardSnapshot.current) !== JSON.stringify(serverBoard) &&
      currentGame.currentTurn === userProfile?.id // It just became our turn, so opponent must have moved
    ) {
      // Find starting pit of opponent's move
      // Opponent pits are 6-11 if we are P1 (needsRotation=true), 0-5 if we are P2.
      const opponentPits = needsRotation ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5];
      const startPit = opponentPits.find(idx => previousBoardSnapshot.current![idx] > 0 && serverBoard[idx] === 0);

      if (startPit !== undefined) {
        // Run logic locally to get animation paths
        const opponentLogicalState = {
          board: previousBoardSnapshot.current,
          scores: { 1: 0, 2: 0 },
          currentPlayer: needsRotation ? 2 : (1 as 1 | 2),
          isGameOver: false
        };
        const moveResult = calculateMoveResult(opponentLogicalState, startPit);

        if (moveResult.animationPaths.length > 0) {
          const visualStartBoard = needsRotation ? rotateBoard(previousBoardSnapshot.current) : previousBoardSnapshot.current;
          const visualOpponentPit = needsRotation ? mapPitToVisual(startPit) : startPit;

          setBoardBeforeMove(visualStartBoard);
          setIsAnimating(true);
          setAnimationPaths(moveResult.animationPaths.map(path => path.map(p => needsRotation ? mapPitToVisual(p) : p)));
          setCaptures(moveResult.captures.map(c => ({ ...c, pitIndex: needsRotation ? mapPitToVisual(c.pitIndex) : c.pitIndex })));

          previousBoardSnapshot.current = serverBoard;
          return; // Animation will trigger onAnimationDone which will set final board
        }
      }
    }

    setVisualBoard(displayBoard);
    setBoardBeforeMove(displayBoard);
    previousBoardSnapshot.current = serverBoard;
  };

  // --- Matchmaking Handlers ---

  const startAutomaticMatchmaking = async () => {
    try {
      setIsMatchmaking(true);
      setMatchmakingMessage('Finding match...');

      const response = await matchmakingService.startMatchmaking('ayo');

      if (response.matched && response.game) {
        // Match found immediately!
        setIsMatchmaking(false);
        // Update Redux store with the matched game
        dispatch(setCurrentGame(response.game));
        console.log('Match found!', response.game);
      } else {
        // No immediate match, start polling
        setMatchmakingMessage(response.message);
        startMatchmakingPolling();
      }
    } catch (error: any) {
      console.error('Failed to start matchmaking:', error);
      setIsMatchmaking(false);

      // Handle authentication errors
      const errorMessage = error.message || 'Failed to start matchmaking. Please try again.';

      if (errorMessage.includes('Session expired') || errorMessage.includes('Not authenticated')) {
        Alert.alert(
          'Authentication Required',
          'Your session has expired. Please log in again.',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack()
            }
          ]
        );
      } else {
        Alert.alert('Error', errorMessage);
        navigation.goBack();
      }
    }
  };

  const startMatchmakingPolling = () => {
    // Poll every 2 seconds for match status
    matchmakingIntervalRef.current = setInterval(async () => {
      try {
        const response = await matchmakingService.checkMatchmakingStatus('ayo');

        if (response.matched && response.game) {
          // Match found!
          if (matchmakingIntervalRef.current) {
            clearInterval(matchmakingIntervalRef.current);
          }
          setIsMatchmaking(false);

          // Set the game in Redux store
          dispatch(setCurrentGame(response.game));
          console.log('Match found during polling!', response.game);
        } else if (response.inQueue) {
          setMatchmakingMessage(response.message || 'Searching for opponent...');
        } else {
          // Not in queue anymore (cancelled or error)
          if (matchmakingIntervalRef.current) {
            clearInterval(matchmakingIntervalRef.current);
          }
          setIsMatchmaking(false);
        }
      } catch (error) {
        console.error('Matchmaking polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  };

  const handleCancelMatchmaking = async () => {
    try {
      if (matchmakingIntervalRef.current) {
        clearInterval(matchmakingIntervalRef.current);
      }
      await matchmakingService.cancelMatchmaking();
      setIsMatchmaking(false);
      navigation.goBack();
    } catch (error) {
      console.error('Failed to cancel matchmaking:', error);
      setIsMatchmaking(false);
      navigation.goBack();
    }
  };

  // --- Handlers ---

  const handleCreateGame = async () => {
    try {
      await dispatch(createOnlineGame('ayo')).unwrap();
    } catch (error) {
      Alert.alert('Error', 'Failed to create game');
    }
  };

  const handleJoinGame = async (gameId: string) => {
    try {
      await dispatch(joinOnlineGame(gameId)).unwrap();
    } catch (error) {
      Alert.alert('Error', 'Failed to join game');
    }
  };

  const handleMove = async (visualPitIndex: number) => {
    if (!currentGame || isAnimating) return;

    // Validate turn
    const isMyTurn = currentGame.currentTurn === userProfile?.id;
    if (!isMyTurn) {
      // Optional: Show "Not your turn" feedback
      return;
    }

    // Determine actual logical pit index
    const logicalPitIndex = needsRotation ? mapPitToLogical(visualPitIndex) : visualPitIndex;

    // Run Logic Locally for Immediate Feedback
    // We run logic on the VISUAL board treating ourselves as Player 2 (Bottom)
    // because standard logic/component expects Player 2 at bottom.
    // If needsRotation is true, we ARE Player 1, but we rotated the board so we LOOK like Player 2.
    // However, calculateMoveResult needs to know the "currentPlayer" ID (1 or 2).
    // If we passed rotated board, we are effectively Player 2 in this rotated universe.

    const virtualState = {
      board: visualBoard,
      scores: { 1: 0, 2: 0 }, // Scores are visual only here
      currentPlayer: 2 as 1 | 2, // We always play as Bottom (Player 2) in visual space
      isGameOver: false,
      timerState: { player1Time: 0, player2Time: 0, isRunning: false, lastActivePlayer: 2 }
    };

    const moveResult = calculateMoveResult(virtualState, visualPitIndex);

    if (moveResult.animationPaths.length > 0) {
      setBoardBeforeMove(visualBoard); // Snapshot for animation
      setIsAnimating(true);
      setAnimationPaths(moveResult.animationPaths);
      setCaptures(moveResult.captures);

      // Update local visual state to the final state immediately (for after animation)
      // Actually, we wait for animation to end to set visualBoard to final, 
      // but we need to compute the logical final board for the server.

      const finalVisualBoard = moveResult.nextState.board;
      const finalLogicalBoard = needsRotation ? unrotateBoard(finalVisualBoard) : finalVisualBoard;

      // Prepare Server Update
      // logical currentPlayer is 1 or 2.
      // needsRotation=true means WE are P1 (Logical 1).
      // If nextState.currentPlayer is 1, it remains P1's turn.
      const nextLogicalPlayer = moveResult.nextState.currentPlayer;
      let nextTurnId = currentGame.currentTurn;

      if (needsRotation) {
        // We are P1 (Logical 1)
        nextTurnId = nextLogicalPlayer === 1 ? (currentGame.player1?.id || currentGame.currentTurn) : (currentGame.player2?.id || currentGame.currentTurn);
      } else {
        // We are P2 (Logical 2)
        nextTurnId = nextLogicalPlayer === 2 ? (currentGame.player2?.id || currentGame.currentTurn) : (currentGame.player1?.id || currentGame.currentTurn);
      }

      setPendingServerUpdate({
        board: finalLogicalBoard,
        turn: nextTurnId || currentGame.currentTurn
      });

    } else {
      // Only update if move actually did something (Ayo requires sowing)
    }
  };

  const onAnimationDone = async () => {
    setIsAnimating(false);
    setAnimationPaths([]);
    setCaptures([]);

    if (pendingServerUpdate && currentGame) {
      try {
        // Optimistically update
        if (needsRotation) {
          setVisualBoard(rotateBoard(pendingServerUpdate.board));
        } else {
          setVisualBoard(pendingServerUpdate.board);
        }

        await dispatch(updateOnlineGameState({
          gameId: currentGame.id,
          updates: {
            board: pendingServerUpdate.board,
            currentTurn: pendingServerUpdate.turn
          }
        })).unwrap();
      } catch (error) {
        console.log("Failed to update server", error);
        // Revert/Sync happens automatically on next poll/effect
      }
      setPendingServerUpdate(null);
    }
  };

  const handleRematch = () => {
    dispatch(clearCurrentGame());
    if (isPlayer1) handleCreateGame();
    // If P2, wait for P1? Simplify: just go back to lobby
    else handleCreateGame();
  };

  const handleExit = () => {
    dispatch(clearCurrentGame());
    navigation.goBack();
  };


  // --- Render Helpers ---

  const renderLobby = () => (
    <View style={styles.lobbyContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.title}>Online Lobby</Text>
      </View>

      <TouchableOpacity style={styles.createButton} onPress={handleCreateGame}>
        <Text style={styles.createButtonText}>Create New Game Hall</Text>
        <Text style={styles.createButtonSub}>Wait for challengers</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Available Games</Text>
      {availableGames.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.noGamesText}>No games currently open.</Text>
          <Text style={styles.noGamesSub}>Create one to start playing!</Text>
        </View>
      ) : (
        availableGames.map((game) => (
          <TouchableOpacity
            key={game.id}
            style={styles.gameItem}
            onPress={() => handleJoinGame(game.id)}
          >
            <View style={styles.gameInfo}>
              <Text style={styles.helperText}>Challenger</Text>
              <Text style={styles.gameText}>{game.player1.name}</Text>
              <Text style={styles.ratingText}>Rating: {game.player1.rating}</Text>
            </View>
            <View style={styles.joinBadge}>
              <Text style={styles.joinText}>JOIN</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  const renderGame = () => {
    if (!currentGame) return null;

    const isGameOver = currentGame.status === 'COMPLETED';
    // Opponent Info
    const opponent = isPlayer1 ? currentGame.player2 : currentGame.player1;

    // If waiting for opponent
    if (!opponent) {
      return (
        <View style={styles.waitingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.waitingTitle}>Waiting for Opponent...</Text>
          <Text style={styles.waitingSub}>Your game is visible in the lobby.</Text>
          <Text style={styles.waitingGameId}>Game ID: {currentGame.id.slice(0, 6).toUpperCase()}</Text>
          <TouchableOpacity style={styles.cancelButton} onPress={handleExit}>
            <Text style={styles.cancelText}>Cancel Game</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Visual Props for Profiles
    // P1 is us so we are bottom. Opponent is top.
    // GamePlayerProfile Props: name, country, rating, isActive, score

    // We don't have scores in the basic backend model yet?
    // Assuming naive scoring or derived from board.
    // Calculate scores on fly:
    const currentBoard = currentGame.board || Array(12).fill(4); // Default to standard board if null
    const p1Score = currentBoard.slice(0, 6).reduce((a: number, b: number) => a + b, 0); // Logic P1
    const p2Score = currentBoard.slice(6, 12).reduce((a: number, b: number) => a + b, 0); // Logic P2

    // Map to Visual Top/Bottom
    // If needsRotation (We are P1): Bottom=P1, Top=P2.
    // Top Profile = Opponent (P2)
    // Bottom Profile = Us (P1)

    const topProfile = {
      name: opponent.name,
      rating: opponent.rating,
      country: "NG", // Placeholder
      score: needsRotation ? p2Score : p1Score, // Logic Opponent Score
      isActive: currentGame.currentTurn === opponent.id,
    };

    const bottomProfile = {
      name: playerProfile?.name || "You",
      rating: userProfile?.rating || 1200,
      country: "NG",
      score: needsRotation ? p1Score : p2Score, // Logic My Score
      isActive: currentGame.currentTurn === userProfile?.id,
    };

    return (
      <View style={styles.gameContainer}>
        {/* Opponent (Top) */}
        <View style={styles.profileContainer}>
          <GamePlayerProfile
            name={topProfile.name}
            country={topProfile.country}
            rating={topProfile.rating}
            score={topProfile.score}
            isActive={topProfile.isActive && !isAnimating}
            timeLeft="--:--"
          />
        </View>

        {/* Turn Indicator */}
        <View style={styles.turnIndicator}>
          <Text style={[styles.turnText, { color: bottomProfile.isActive ? '#4CAF50' : '#888' }]}>
            {bottomProfile.isActive ? "YOUR TURN" : `${topProfile.name.toUpperCase()}'S TURN`}
          </Text>
        </View>

        {/* Board */}
        <View style={styles.boardContainer}>
          <AyoSkiaImageBoard
            board={visualBoard}
            boardBeforeMove={boardBeforeMove}
            animatingPaths={animationPaths}
            captures={captures.map(c => c.pitIndex)} // Only need correct pit index? 
            // Note: captures need to be in visual indices?
            // calculateMoveResult returned captures with indices consistent with the 'virtualState' (which is visual)
            // So yes, these indices are correct.
            onPitPress={handleMove}
            onAnimationEnd={onAnimationDone}
          />
        </View>

        {/* Player (Bottom) */}
        <View style={styles.profileContainer}>
          <GamePlayerProfile
            name={bottomProfile.name}
            country={bottomProfile.country}
            rating={bottomProfile.rating}
            score={bottomProfile.score}
            isActive={bottomProfile.isActive && !isAnimating}
            timeLeft="--:--"
          />
        </View>

        {/* Game Over Overlay */}
        {isGameOver && (
          <AyoGameOver
            result={currentGame.winnerId === userProfile?.id ? "win" : "loss"}
            level={1}
            onRematch={handleRematch}
            onNewBattle={handleExit}
            playerName={bottomProfile.name}
            opponentName={topProfile.name}
            playerRating={bottomProfile.rating}
          />
        )}
      </View>
    );
  };

  // Show matchmaking screen while searching
  if (isMatchmaking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.matchmakingContainer}>
          <View style={styles.matchmakingContent}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.matchmakingTitle}>{matchmakingMessage}</Text>
            <Text style={styles.matchmakingSub}>
              Pairing you with the closest available rating...
            </Text>
            <View style={styles.ratingInfo}>
              <Text style={styles.ratingLabel}>Your Rating</Text>
              <Text style={styles.ratingValue}>{userProfile?.rating || 1200}</Text>
            </View>
            <TouchableOpacity
              style={styles.cancelMatchmakingButton}
              onPress={handleCancelMatchmaking}
            >
              <Text style={styles.cancelMatchmakingText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading && !currentGame) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Connecting to Arena...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {currentGame ? renderGame() : renderLobby()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  lobbyContainer: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  backButton: {
    padding: 5,
    marginRight: 10,
  },
  title: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
  },
  sectionTitle: {
    color: '#888',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 20,
  },
  createButton: {
    backgroundColor: '#2E7D32',
    padding: 20,
    borderRadius: 16,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  createButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  createButtonSub: {
    color: '#A5D6A7',
    marginTop: 4,
  },
  gameItem: {
    backgroundColor: '#333',
    padding: 16,
    borderRadius: 12,
    marginVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  gameInfo: {
    flex: 1,
  },
  helperText: {
    color: '#888',
    fontSize: 10,
    marginBottom: 2,
  },
  gameText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  ratingText: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: 2,
  },
  joinBadge: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  joinText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    opacity: 0.5
  },
  noGamesText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  noGamesSub: {
    color: 'white',
    marginTop: 5,
  },
  loadingText: {
    color: '#888',
    marginTop: 15,
  },

  // Game Styles
  gameContainer: {
    flex: 1,
    justifyContent: "space-between",
    padding: 10,
    paddingVertical: 20,
  },
  profileContainer: {
    alignItems: "center",
    marginBottom: 10,
  },
  boardContainer: {
    flex: 1,
    justifyContent: "center",
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
  },
  waitingSub: {
    color: '#ccc',
    marginTop: 10,
    fontSize: 16,
  },
  waitingGameId: {
    color: '#444',
    marginTop: 30,
    fontFamily: 'monospace',
  },
  cancelButton: {
    marginTop: 50,
    padding: 15,
    borderWidth: 1,
    borderColor: '#d32f2f',
    borderRadius: 8,
  },
  cancelText: {
    color: '#ef5350',
  },

  // Matchmaking Styles
  matchmakingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  matchmakingContent: {
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    padding: 40,
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
  },
  matchmakingTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
  },
  matchmakingSub: {
    color: '#aaa',
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
  },
  ratingInfo: {
    marginTop: 30,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 12,
    width: '100%',
  },
  ratingLabel: {
    color: '#888',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ratingValue: {
    color: '#FFD700',
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: 5,
  },
  cancelMatchmakingButton: {
    marginTop: 30,
    padding: 15,
    borderWidth: 1,
    borderColor: '#d32f2f',
    borderRadius: 8,
    width: '100%',
  },
  cancelMatchmakingText: {
    color: '#ef5350',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  turnIndicator: {
    alignItems: 'center',
    marginVertical: 10,
  },
  turnText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
});

export default AyoOnlineUI;
