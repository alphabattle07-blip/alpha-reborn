import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function ChallengeBar({
  matchId,
  playerId,
  opponentId,
  sendChatMessage, // function to send chat messages
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [showStakeModal, setShowStakeModal] = useState(false);

  const blinkAnim = useRef(new Animated.Value(1)).current;
  const bubbleTimer = useRef(null);

  // Simulated listener for challenge events (replace with Firebase/Supabase)
  useEffect(() => {
    // Example listener function
    // onChallengeReceived((challenge) => {
    //   if (challenge.targetId === playerId) {
    //     receiveChallenge(challenge);
    //   }
    // });
  }, []);

  // Blink animation setup
  useEffect(() => {
    if (isBlinking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 0.2,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
        ])
      ).start();
    } else {
      blinkAnim.setValue(1);
    }
  }, [isBlinking]);

  // Send challenge request
  const sendChallenge = () => {
    // Confirmation first
    setShowConfirmModal(true);
  };

  const confirmSendChallenge = () => {
    setShowConfirmModal(false);
    // Send challenge to opponent (Firebase/Supabase here)
    sendChatMessage(
      `You have challenged ${opponentId}. Waiting for response...`
    );

    // Simulate opponent receiving challenge
    setTimeout(() => {
      receiveChallenge({ challengerId: playerId, targetId: opponentId });
    }, 500);
  };

  // Opponent receives challenge
  const receiveChallenge = (challenge) => {
    setIncomingChallenge(challenge);
    setShowBubble(true);
    sendChatMessage(`${challenge.challengerId} sent you a challenge!`);
    // Bubble disappears after 1 minute → start blinking
    bubbleTimer.current = setTimeout(() => {
      setShowBubble(false);
      setIsBlinking(true);
    }, 60000);
  };

  // Accept / Decline
  const acceptChallenge = () => {
    clearTimeout(bubbleTimer.current);
    setShowBubble(false);
    setIsBlinking(false);
    setShowStakeModal(true);
  };

  const declineChallenge = () => {
    clearTimeout(bubbleTimer.current);
    setShowBubble(false);
    setIsBlinking(false);
    sendChatMessage("You declined the challenge.");
  };

  // Open bubble manually from blinking sword
  const reopenBubble = () => {
    if (incomingChallenge) {
      setShowBubble(true);
      setIsBlinking(false);
    }
  };

  const startBattle = (amount) => {
    setShowStakeModal(false);
    sendChatMessage(`Battle starting for ${amount} M-coins!`);
  };

  return (
    <View style={styles.bar}>
      {/* Chat Icon */}
      <TouchableOpacity style={styles.iconBtn}>
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={28}
          color="#555"
        />
      </TouchableOpacity>

      {/* Challenge Icon */}
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={isBlinking ? reopenBubble : sendChallenge}
      >
        <Animated.View style={{ opacity: blinkAnim }}>
          <Ionicons name="ios-sword" size={28} color="#d9534f" />
        </Animated.View>
      </TouchableOpacity>

      {/* Floating Bubble */}
      {showBubble && (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>
            {incomingChallenge?.challengerId || "Player"} challenges you!
          </Text>
          <View style={styles.bubbleBtns}>
            <Pressable style={styles.btnAccept} onPress={acceptChallenge}>
              <Text style={styles.btnText}>Accept</Text>
            </Pressable>
            <Pressable style={styles.btnDecline} onPress={declineChallenge}>
              <Text style={styles.btnText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Confirm Send Modal */}
      <Modal transparent visible={showConfirmModal} animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalBox}>
            <Text style={styles.modalText}>
              Do you want to challenge {opponentId}?
            </Text>
            <View style={styles.row}>
              <Pressable
                style={styles.btnAccept}
                onPress={confirmSendChallenge}
              >
                <Text style={styles.btnText}>Yes</Text>
              </Pressable>
              <Pressable
                style={styles.btnDecline}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Stake Selection Modal */}
      <Modal transparent visible={showStakeModal} animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalBox}>
            <Text style={styles.modalText}>Select M-Coin Stake</Text>
            <View style={styles.row}>
              {[50, 100, 200].map((amount) => (
                <Pressable
                  key={amount}
                  style={styles.btnAccept}
                  onPress={() => startBattle(amount)}
                >
                  <Text style={styles.btnText}>{amount} M</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: "#ddd",
  },
  iconBtn: {
    marginHorizontal: 16,
  },
  bubble: {
    position: "absolute",
    bottom: 50,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    flexDirection: "column",
    alignItems: "center",
  },
  bubbleText: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  bubbleBtns: {
    flexDirection: "row",
    gap: 5,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    width: 280,
  },
  modalText: {
    fontSize: 18,
    marginBottom: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    marginTop: 10,
    gap: 8,
  },
  btnAccept: {
    backgroundColor: "#28a745",
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  btnDecline: {
    backgroundColor: "#dc3545",
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  btnText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
