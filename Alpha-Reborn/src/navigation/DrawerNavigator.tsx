import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import MainTabNavigator from './MainTabNavigator';
import { Ionicons } from '@expo/vector-icons';

// Import Drawer Screens
import LeaderboardScreen from '../assets/screens/drawer/LeaderboardScreen';
import TournamentsScreen from '../assets/screens/drawer/TournamentsScreen';
import SettingsScreen from '../assets/screens/drawer/SettingsScreen';
import HelpScreen from '../assets/screens/drawer/HelpScreen';
import SupportScreen from '../assets/screens/drawer/SupportScreen';
import AboutScreen from '../assets/screens/drawer/AboutScreen';

const Drawer = createDrawerNavigator();

export default function DrawerNavigator() {
    return (
        <Drawer.Navigator
            screenOptions={{
                headerShown: false,
                drawerStyle: {
                    backgroundColor: '#0b1f3a',
                    width: 280,
                },
                drawerActiveTintColor: '#2E86DE',
                drawerInactiveTintColor: '#ffffff',
                drawerLabelStyle: {
                    fontSize: 16,
                    fontWeight: '500',
                },
            }}
        >
            {/* The main bottom tabs are the default screen in the drawer */}
            <Drawer.Screen
                name="HomeTabs"
                component={MainTabNavigator}
                options={{
                    title: 'Home',
                    drawerIcon: ({ color, size }) => (
                        <Ionicons name="home-outline" size={size} color={color} />
                    ),
                }}
            />

            <Drawer.Screen
                name="Leaderboard"
                component={LeaderboardScreen}
                options={{
                    drawerIcon: ({ color, size }) => (
                        <Ionicons name="trophy-outline" size={size} color={color} />
                    ),
                }}
            />
            <Drawer.Screen
                name="Tournaments"
                component={TournamentsScreen}
                options={{
                    drawerIcon: ({ color, size }) => (
                        <Ionicons name="flag-outline" size={size} color={color} />
                    ),
                }}
            />
            <Drawer.Screen
                name="Settings"
                component={SettingsScreen}
                options={{
                    drawerIcon: ({ color, size }) => (
                        <Ionicons name="settings-outline" size={size} color={color} />
                    ),
                }}
            />
            <Drawer.Screen
                name="Help / How to Play"
                component={HelpScreen}
                options={{
                    drawerIcon: ({ color, size }) => (
                        <Ionicons name="help-circle-outline" size={size} color={color} />
                    ),
                }}
            />
            <Drawer.Screen
                name="Support"
                component={SupportScreen}
                options={{
                    title: 'Support / Report Issue',
                    drawerIcon: ({ color, size }) => (
                        <Ionicons name="build-outline" size={size} color={color} />
                    ),
                }}
            />
            <Drawer.Screen
                name="About"
                component={AboutScreen}
                options={{
                    drawerIcon: ({ color, size }) => (
                        <Ionicons name="information-circle-outline" size={size} color={color} />
                    ),
                }}
            />
        </Drawer.Navigator>
    );
}
