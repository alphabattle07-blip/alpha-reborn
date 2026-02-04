// src/screens/game/splashscreen.tsx
import React, { useEffect } from "react";
import { View, StyleSheet, Image, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../navigation/types";
import { useAppSelector } from "../../../store/hooks"; // Import the Redux hook

type SplashScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Splash">;

const SplashScreen = () => {
  const navigation = useNavigation<SplashScreenNavigationProp>();
  // Get the authentication status from the Redux store
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    const timer = setTimeout(() => {
      // ✅ Now we have logic to decide where to go
      if (isAuthenticated) {
        navigation.replace("Home"); // User is logged in, go 
      } else {
        navigation.replace("Auth"); // User is not logged in, go to the login/signup screens
      }
    }, 3000); // Reduced time to 3 seconds for better UX

    return () => clearTimeout(timer);
  }, [isAuthenticated, navigation]); // Effect depends on authentication status

  return (
    <View style={styles.container}>
      {/* You can keep your background, logo, and animations here */}
      <Image
        source={require("../../../../assets/images/splash-icon.png")}
        style={styles.logo}
      />
      <Text style={styles.title}>ALPHA BATTLE</Text>
    </View>
  );
};

// Simplified styles for the example
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: '#0b1f3a',
  },
  logo: {
    width: 150,
    height: 150,
    resizeMode: "contain",
  },
  title: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 20,
  },
});

export default SplashScreen;