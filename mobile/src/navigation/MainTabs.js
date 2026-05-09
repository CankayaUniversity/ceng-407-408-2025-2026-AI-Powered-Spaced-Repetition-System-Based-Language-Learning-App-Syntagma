import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import HomePage from '../screens/HomePage';
import FlashcardReviewScreen from '../screens/FlashcardReviewScreen';
import OverviewScreen from '../screens/OverviewScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../shared/theme';

const Tab = createBottomTabNavigator();
const HomeStackNav = createNativeStackNavigator();

function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeMain" component={HomePage} />
      <HomeStackNav.Screen name="FlashcardReview" component={FlashcardReviewScreen} />
    </HomeStackNav.Navigator>
  );
}

function TabIcon({ focused, icon, colors, styles }) {
  const tintColor = colors.textPrimary;

  if (focused) {
    return (
      <View style={styles.activeTabWrap}>
        <View style={[styles.activeTabIconWrap, { backgroundColor: colors.accentStrong }]}>
          <Ionicons name={icon} size={22} color={tintColor} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.inactiveTabWrap}>
      <Ionicons name={icon} size={22} color={tintColor} />
    </View>
  );
}

export default function MainTabs() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ focused }) => {
          if (route.name === 'Sanctuary') {
            return <TabIcon focused={focused} icon="home-outline" colors={colors} styles={styles} />;
          }
          if (route.name === 'Library') {
            return <TabIcon focused={focused} icon="book-outline" colors={colors} styles={styles} />;
          }
          if (route.name === 'Progress') {
            return <TabIcon focused={focused} icon="bar-chart-outline" colors={colors} styles={styles} />;
          }
          return <TabIcon focused={focused} icon="person-outline" colors={colors} styles={styles} />;
        },
      })}
    >
      <Tab.Screen
        name="Sanctuary"
        component={HomeStack}
        listeners={{ tabPress: () => {} }}
      />
      <Tab.Screen
        name="Library"
        component={FlashcardReviewScreen}
        listeners={{ tabPress: () => {} }}
      />
      <Tab.Screen
        name="Progress"
        component={OverviewScreen}
        listeners={{ tabPress: () => {} }}
      />
      <Tab.Screen
        name="Profile"
        component={SettingsScreen}
        listeners={{ tabPress: () => {} }}
      />
    </Tab.Navigator>
  );
}

const createStyles = (colors) => StyleSheet.create({
  tabBar: {
    backgroundColor: colors.background,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    elevation: 0,
    shadowOpacity: 0,
    height: 92,
    paddingBottom: 10,
    paddingTop: 8,
  },
  activeTabWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTabIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveTabWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
