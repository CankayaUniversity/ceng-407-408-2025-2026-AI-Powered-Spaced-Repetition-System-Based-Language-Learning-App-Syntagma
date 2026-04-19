import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_CARDS = [
  {
    word: 'match',
    phonetic: '/mætʃ/',
    sentence: 'The colors should match the style of the page.',
    translation: 'eşleşmek',
    sentenceTranslation: 'Renkler sayfanın stiliyle eşleşmeli.',
    englishPronunciationUri: 'https://ssl.gstatic.com/dictionary/static/sounds/20200429/match--_gb_1.mp3',
    turkishPronunciationUri: 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=tr&q=e%C5%9Fle%C5%9Fmek',
  },
  {
    word: 'focus',
    phonetic: '/ˈfoʊ.kəs/',
    sentence: 'Try to focus on one sentence at a time.',
    translation: 'odaklanmak',
    sentenceTranslation: 'Bir seferde tek bir cümleye odaklanmaya çalış.',
    englishPronunciationUri: 'https://ssl.gstatic.com/dictionary/static/sounds/20200429/focus--_gb_1.mp3',
    turkishPronunciationUri: 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=tr&q=odaklanmak',
  },
  {
    word: 'script',
    phonetic: '/ˈskrɪpt/',
    sentence: 'He is writing a script for a new movie.',
    translation: 'senaryo',
    sentenceTranslation: 'Yeni bir film için senaryo yazıyor.',
    englishPronunciationUri: 'https://ssl.gstatic.com/dictionary/static/sounds/20200429/script--_gb_1.mp3',
    turkishPronunciationUri: 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=tr&q=senaryo',
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
];

export const Rating = Object.freeze({
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
});

export default function FlashcardReviewScreen({ route, navigation, onReview, onPlayPronunciation }) {
  const { width } = useWindowDimensions();
  const cards = route.params?.cards?.length ? route.params.cards : DEFAULT_CARDS;
  const requestedStartIndex = route.params?.startIndex ?? 0;
  const [currentIndex, setCurrentIndex] = useState(Math.max(0, Math.min(requestedStartIndex, cards.length - 1)));
  const [cardState, setCardState] = useState('isCollapsed');
  const detailsAnim = useRef(new Animated.Value(0)).current;

  const activeCard = cards[currentIndex] || cards[0];
  const detailsOpen = cardState === 'isExpanded';
  const totalPills = 5;
  const completedPills = Math.max(
    0,
    Math.min(totalPills, Math.floor((currentIndex / Math.max(cards.length, 1)) * totalPills))
  );
  const cardsLeft = Math.max(cards.length - currentIndex, 0);
  const cardHorizontalPadding = Math.max(16, Math.min(28, Math.round(width * 0.07)));

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const detailTranslateY = detailsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  const openDetails = useCallback(() => {
    if (detailsOpen) {
      return;
    }

    LayoutAnimation.configureNext(
      LayoutAnimation.create(300, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    setCardState('isExpanded');
    Animated.timing(detailsAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [detailsAnim, detailsOpen]);

  const resetDetails = useCallback(() => {
    detailsAnim.setValue(0);
    LayoutAnimation.configureNext(
      LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    setCardState('isCollapsed');
  }, [detailsAnim]);

  const routeOnReview = route.params?.onReview;
  const routeOnPlayPronunciation = route.params?.onPlayPronunciation;

  const handleAnswer = useCallback(
    (rating) => {
      const reviewHandler = onReview || routeOnReview;
      if (typeof reviewHandler === 'function') {
        reviewHandler(rating);
      }

      const isLastCard = currentIndex >= cards.length - 1;
      if (isLastCard) {
        navigation.navigate('SessionSummaryScreen', {
          reviewedCount: cards.length,
        });
        return;
      }

      resetDetails();
      setCurrentIndex((prev) => prev + 1);
    },
    [cards.length, currentIndex, navigation, onReview, resetDetails, routeOnReview]
  );

  const handlePronunciation = useCallback(
    async (lang, uri) => {
      if (!uri) {
        return;
      }

      const playHandler = onPlayPronunciation || routeOnPlayPronunciation;
      if (typeof playHandler === 'function') {
        playHandler({ lang, uri, card: activeCard });
        return;
      }

      try {
        await Linking.openURL(uri);
      } catch (err) {
        // If a deep link cannot open, we silently ignore to avoid interrupting the review flow.
      }
    },
    [activeCard, onPlayPronunciation, routeOnPlayPronunciation]
  );

  const imageNode = useMemo(() => {
    if (activeCard?.imageUri) {
      return <Image source={{ uri: activeCard.imageUri }} style={styles.contextImage} resizeMode="cover" />;
    }

    return <View style={styles.imageFallback} />;
  }, [activeCard?.imageUri]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2EDE4" />

      <View style={styles.topBar}>
        <Image source={require('../../assets/capybara-avatar.jpg')} style={styles.avatar} />
        <Text style={styles.topBarTitle}>Syntagma Flashcards</Text>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressPills}>
          {Array.from({ length: totalPills }).map((_, index) => (
            <View
              key={String(index)}
              style={[styles.progressPill, index < completedPills ? styles.progressPillDone : styles.progressPillTodo]}
            />
          ))}
        </View>
        <Text style={styles.cardsLeftText}>{`${cardsLeft} CARDS LEFT`}</Text>
      </View>

      <View
        style={[
          styles.cardSection,
          {
            paddingHorizontal: cardHorizontalPadding,
            justifyContent: detailsOpen ? 'flex-start' : 'center',
          },
        ]}
      >
        <Pressable
          onPress={openDetails}
          disabled={detailsOpen}
          style={({ pressed }) => [styles.cardFrame, detailsOpen && styles.cardFrameExpanded, pressed && !detailsOpen && styles.cardFramePressed]}
        >
          <Text style={styles.wordText}>{activeCard.word}</Text>
          <Text style={styles.sentenceText}>{`"${activeCard.sentence}"`}</Text>
          <Text style={styles.phoneticText}>{activeCard.phonetic}</Text>

          {!detailsOpen && (
            <Text style={styles.detailsHintText}>Tap for details</Text>
          )}

          {detailsOpen && (
            <Animated.View style={[styles.detailsContent, { opacity: detailsAnim, transform: [{ translateY: detailTranslateY }] }]}>
              <ScrollView
                style={styles.detailsScroll}
                contentContainerStyle={styles.detailsScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.translationPill}>
                  <Text style={styles.translationFlag}>🇹🇷</Text>
                  <Text style={styles.translationText}>{activeCard.translation}</Text>
                </View>

                <Text style={styles.sentenceTrText}>{activeCard.sentenceTranslation || '-'}</Text>

                {(activeCard.englishPronunciationUri || activeCard.turkishPronunciationUri) && (
                  <View style={styles.pronunciationRow}>
                    {activeCard.englishPronunciationUri && (
                      <Pressable
                        style={styles.pronunciationButton}
                        onPress={() => handlePronunciation('en', activeCard.englishPronunciationUri)}
                      >
                        <Ionicons name="volume-high-outline" size={18} color="#6B4226" />
                        <Text style={styles.pronunciationButtonText}>EN Pronunciation</Text>
                      </Pressable>
                    )}
                    {activeCard.turkishPronunciationUri && (
                      <Pressable
                        style={styles.pronunciationButton}
                        onPress={() => handlePronunciation('tr', activeCard.turkishPronunciationUri)}
                      >
                        <Ionicons name="volume-high-outline" size={18} color="#6B4226" />
                        <Text style={styles.pronunciationButtonText}>TR Pronunciation</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                <View style={styles.imageWrap}>{imageNode}</View>

                <View style={styles.bottomDecisionRowInside}>
                  <Pressable style={[styles.answerButton, styles.againButton]} onPress={() => handleAnswer(Rating.Again)}>
                    <Text style={styles.againButtonText}>I don't know</Text>
                  </Pressable>

                  <Pressable style={[styles.answerButton, styles.goodButton]} onPress={() => handleAnswer(Rating.Good)}>
                    <Text style={styles.goodButtonText}>I know</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Animated.View>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2EDE4',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  topBarTitle: {
    color: '#6B4226',
    fontSize: 18,
    fontFamily: 'DMSans_600SemiBold',
  },
  progressRow: {
    marginHorizontal: 24,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressPills: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    marginRight: 10,
  },
  progressPill: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  progressPillDone: {
    backgroundColor: '#6B4226',
  },
  progressPillTodo: {
    backgroundColor: '#D9C9B4',
  },
  cardsLeftText: {
    color: '#C49A6C',
    fontSize: 11,
    fontFamily: 'DMSans_600SemiBold',
    letterSpacing: 0.8,
  },
  cardSection: {
    flex: 1,
    marginTop: 20,
  },
  cardFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    boxSizing: 'border-box',
    width: '100%',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    overflow: 'hidden',
  },
  cardFrameExpanded: {
    flex: 1,
  },
  cardFramePressed: {
    opacity: 0.96,
  },
  wordText: {
    color: '#6B4226',
    fontSize: 48,
    textAlign: 'center',
    fontFamily: 'PlayfairDisplay_700Bold_Italic',
  },
  phoneticText: {
    color: '#A08C7C',
    fontSize: 16,
    marginTop: 14,
    fontFamily: 'DMSans_400Regular',
  },
  sentenceText: {
    marginTop: 24,
    color: '#5A4A3A',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontStyle: 'italic',
  },
  detailsHintText: {
    marginTop: 26,
    color: '#6B4226',
    fontSize: 16,
    fontFamily: 'DMSans_600SemiBold',
  },
  detailsContent: {
    marginTop: 18,
    width: '100%',
    alignItems: 'center',
    flex: 1,
  },
  detailsScroll: {
    width: '100%',
    flex: 1,
  },
  detailsScrollContent: {
    paddingBottom: 2,
  },
  translationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 50,
    backgroundColor: '#EDEBE6',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  translationFlag: {
    fontSize: 20,
  },
  translationText: {
    color: '#3D2B1F',
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
  },
  sentenceTrText: {
    marginTop: 14,
    color: '#3D2B1F',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
  },
  pronunciationRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
  },
  pronunciationButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#F2EDE4',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pronunciationButtonText: {
    color: '#6B4226',
    fontSize: 13,
    fontFamily: 'DMSans_600SemiBold',
  },
  imageWrap: {
    marginTop: 14,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  contextImage: {
    width: '100%',
    height: 150,
    borderRadius: 16,
  },
  imageFallback: {
    width: '100%',
    height: 150,
    borderRadius: 16,
    backgroundColor: '#F5C849',
  },
  bottomDecisionRowInside: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 0,
    width: '100%',
  },
  answerButton: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
  },
  againButton: {
    backgroundColor: '#FAD9D9',
  },
  goodButton: {
    backgroundColor: '#C49A6C',
  },
  againButtonText: {
    color: '#C0504A',
    fontSize: 16,
    fontFamily: 'DMSans_600SemiBold',
  },
  goodButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'DMSans_600SemiBold',
  },
});
