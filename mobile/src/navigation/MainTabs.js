import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import HomePage from '../screens/HomePage';
import AddLanguageScreen from '../screens/AddLanguageScreen';
import FlashcardReviewScreen from '../screens/FlashcardReviewScreen';
import OverviewScreen from '../screens/OverviewScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const HomeStackNav = createNativeStackNavigator();

function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeMain" component={HomePage} />
      <HomeStackNav.Screen name="AddLanguage" component={AddLanguageScreen} />
      <HomeStackNav.Screen name="FlashcardReview" component={FlashcardReviewScreen} />
    </HomeStackNav.Navigator>
  );
}

function TabIcon({ focused, icon }) {
  const tintColor = focused ? '#6B4226' : '#8A7A6A';

  if (focused) {
    return (
      <View style={styles.activeTabWrap}>
        <View style={styles.activeTabIconWrap}>
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
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ focused }) => {
          if (route.name === 'Sanctuary') {
            return <TabIcon focused={focused} icon="home-outline" />;
          }
          if (route.name === 'Library') {
            return <TabIcon focused={focused} icon="book-outline" />;
          }
          if (route.name === 'Progress') {
            return <TabIcon focused={focused} icon="bar-chart-outline" />;
          }
          return <TabIcon focused={focused} icon="person-outline" />;
        },
      })}
    >
      <Tab.Screen name="Sanctuary" component={HomeStack} />
      <Tab.Screen
        name="Library"
        component={FlashcardReviewScreen}
        initialParams={{
          cards: [
            {
              word: 'match',
              phonetic: '/mætʃ/',
              sentence: 'The colors should match the style of the page.',
              translation: 'eşleşmek',
              sentenceTranslation: 'Renkler sayfanın stiliyle eşleşmeli.',
              englishPronunciationUri:
                'https://ssl.gstatic.com/dictionary/static/sounds/20200429/match--_gb_1.mp3',
              turkishPronunciationUri:
                'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=tr&q=e%C5%9Fle%C5%9Fmek',
            },
            {
              word: 'focus',
              phonetic: '/ˈfoʊ.kəs/',
              sentence: 'Try to focus on one sentence at a time.',
              translation: 'odaklanmak',
              sentenceTranslation: 'Bir seferde tek bir cümleye odaklanmaya çalış.',
              englishPronunciationUri:
                'https://ssl.gstatic.com/dictionary/static/sounds/20200429/focus--_gb_1.mp3',
              turkishPronunciationUri:
                'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=tr&q=odaklanmak',
            },
            {
              word: 'script',
              phonetic: '/ˈskrɪpt/',
              sentence: 'He is writing a script for a new movie.',
              translation: 'senaryo',
              sentenceTranslation: 'Yeni bir film için senaryo yazıyor.',
              englishPronunciationUri:
                'https://ssl.gstatic.com/dictionary/static/sounds/20200429/script--_gb_1.mp3',
              turkishPronunciationUri:
                'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=tr&q=senaryo',
              imageUri:
                'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1200&q=80',
            },
            {
              word: 'adapt',
              phonetic: '/əˈdæpt/',
              sentence: 'You can adapt your tone to your audience.',
              translation: 'uyarlamak',
              sentenceTranslation: 'Tonunu dinleyicine göre uyarlayabilirsin.',
            },
            {
              word: 'clarify',
              phonetic: '/ˈkler.ə.faɪ/',
              sentence: 'Please clarify the meaning with one example.',
              translation: 'açıklığa kavuşturmak',
              sentenceTranslation: 'Lütfen anlamı bir örnekle açıklığa kavuştur.',
            },
          ],
          startIndex: 0,
        }}
      />
      <Tab.Screen name="Progress" component={OverviewScreen} />
      <Tab.Screen name="Profile" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#F2EDE4',
    borderTopWidth: 0.5,
    borderTopColor: '#DDD3C4',
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
    backgroundColor: '#F5C49A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveTabWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
