import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import {
  PlayfairDisplay_700Bold,
  PlayfairDisplay_700Bold_Italic,
} from '@expo-google-fonts/playfair-display';

import LoginScreen from './src/screens/LoginScreen';
import MainTabs from './src/navigation/MainTabs';
import SessionSummaryScreen from './src/screens/SessionSummaryScreen';

const AppStack = createNativeStackNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <NavigationContainer>
      <AppStack.Navigator screenOptions={{ headerShown: false }}>
        <AppStack.Screen name="Login" component={LoginScreen} />
        <AppStack.Screen name="MainTabs" component={MainTabs} />
        <AppStack.Screen name="SessionSummaryScreen" component={SessionSummaryScreen} />
      </AppStack.Navigator>
    </NavigationContainer>
  );
}
