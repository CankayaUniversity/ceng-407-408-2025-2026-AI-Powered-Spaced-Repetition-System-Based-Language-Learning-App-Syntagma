import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { DMSans_400Regular, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import {
  PlayfairDisplay_700Bold,
  PlayfairDisplay_700Bold_Italic,
} from '@expo-google-fonts/playfair-display';

import LoginScreen from './src/screens/LoginScreen';
import MainTabs from './src/navigation/MainTabs';
import SessionSummaryScreen from './src/screens/SessionSummaryScreen';
import { ThemeProvider } from './src/shared/theme';
import { getAuth } from './src/shared/storage';

const AppStack = createNativeStackNavigator();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
  });
  const [initialRoute, setInitialRoute] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAuth = async () => {
      try {
        const auth = await getAuth();
        if (isMounted) {
          setInitialRoute(auth?.token ? 'MainTabs' : 'Login');
        }
      } catch (err) {
        if (isMounted) {
          setInitialRoute('Login');
        }
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    };

    loadAuth();
    return () => { isMounted = false; };
  }, []);

  if (!fontsLoaded || !authChecked) {
    return null;
  }

  return (
    <ThemeProvider>
      <NavigationContainer>
        <AppStack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName={initialRoute || 'Login'}
        >
          <AppStack.Screen name="Login" component={LoginScreen} />
          <AppStack.Screen name="MainTabs" component={MainTabs} />
          <AppStack.Screen name="SessionSummaryScreen" component={SessionSummaryScreen} />
        </AppStack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}
