import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "../../src/navigation/types";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import { signUpUser, upgradeAccountThunk } from "../../src/store/slices/authSlice";

type SignUpNavProp = NativeStackNavigationProp<RootStackParamList, "SignUp">;

const SignUpScreen = () => {
  const dispatch = useAppDispatch();
  const { isGuest, token } = useAppSelector((state) => state.auth);
  const { profile } = useAppSelector((state) => state.user);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(isGuest && profile?.name ? profile.name : "");
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation<SignUpNavProp>();

  const handleSignUp = async () => {
    if (!email || !password || !username) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setIsLoading(true);
    try {
      if (isGuest) {
        await dispatch(upgradeAccountThunk({ email, password, name: username })).unwrap();
        Alert.alert("Success", "Account upgraded! Your rank and rewards are preserved.");
      } else {
        await dispatch(signUpUser({ email, password, name: username })).unwrap();
        Alert.alert("Success", "Account created successfully!");
      }
      navigation.replace("Home"); // Redirect after signup
    } catch (error: any) {
      Alert.alert("Error", error || "An error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={["#4c669f", "#3b5998", "#192f6a"]} style={styles.gradient}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            <Text style={styles.title}>{isGuest ? "Secure Account" : "Create Account"}</Text>
            <Text style={styles.subtitle}>
              {isGuest ? "Register to save your rank & rewards" : "Sign up to get started"}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#ccc"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#ccc"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#ccc"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={isLoading}
            >
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate("SignIn")}>
                <Text style={styles.link}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1, justifyContent: "center", alignItems: "center" },
  keyboardView: { width: "100%", alignItems: "center" },
  content: { width: "80%", alignItems: "center" },
  title: { fontSize: 32, fontWeight: "bold", color: "#fff", marginBottom: 10 },
  subtitle: { fontSize: 16, color: "#eee", marginBottom: 30 },
  input: {
    width: "100%",
    height: 50,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 10,
    paddingHorizontal: 15,
    color: "#fff",
    marginBottom: 15,
  },
  button: {
    width: "100%",
    height: 50,
    backgroundColor: "#6a11cb",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: { backgroundColor: "#ccc" },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  footer: { flexDirection: "row", marginTop: 20 },
  footerText: { color: "#ccc" },
  link: { color: "#6a11cb", fontWeight: "bold" },
});

export default SignUpScreen;
