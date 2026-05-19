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
import {
  clearCarryover,
  getCarryover,
  getLastStudyCount,
  saveCarryover,
} from '../shared/storage';
import { submitReview, updateWordKnowledge } from '../shared/api';
import { bumpDelta, enqueueReview, enqueueWordKnowledge, markCardReviewed } from '../shared/offline';
import { useTheme } from '../shared/theme';

const DEFAULT_CARDS = [];

export const Rating = Object.freeze({
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
});


export default function FlashcardReviewScreen({ route, navigation, onReview, onPlayPronunciation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const rawCards = route?.params?.cards?.length ? route.params.cards : DEFAULT_CARDS;
  const requestedStartIndex = route?.params?.startIndex ?? 0;
  const [sessionCards, setSessionCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetCount, setTargetCount] = useState(0);
  const [dailyCount, setDailyCount] = useState(10);
  const [dailyCountLoaded, setDailyCountLoaded] = useState(false);
  const [carryoverCount, setCarryoverCount] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [cardState, setCardState] = useState('isCollapsed');

  const detailsAnim = useRef(new Animated.Value(0)).current;
  const cards = sessionCards.length ? sessionCards : rawCards;
  const activeCard = cards[currentIndex] || cards[0];
  const detailsOpen = cardState === 'isExpanded';
  const totalPills = 5;
  const completedPills = Math.max(
    0,
    Math.min(totalPills, Math.floor((currentIndex / Math.max(cards.length, 1)) * totalPills))
  );
  const cardsLeft = Math.max(cards.length - currentIndex, 0);
  const cardHorizontalPadding = Math.max(16, Math.min(28, Math.round(width * 0.07)));
  const collectionName = route?.params?.collectionName;
  const todayKey = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let isMounted = true;

    const loadDefaults = async () => {
      const lastCount = await getLastStudyCount();
      const carryover = await getCarryover();

      if (!isMounted) {
        return;
      }

      if (Number.isFinite(lastCount) && lastCount > 0) {
        setDailyCount(lastCount);
      }

      if (carryover?.remaining > 0 && carryover?.date && carryover.date !== todayKey) {
        setCarryoverCount(carryover.remaining);
      }

      setDailyCountLoaded(true);
    };

    loadDefaults();

    return () => {
      isMounted = false;
    };
  }, [todayKey]);

  useEffect(() => {
    if (!rawCards.length || sessionStarted || !dailyCountLoaded) {
      return;
    }

    const totalTarget = Math.min(rawCards.length, dailyCount + carryoverCount);
    const nextCards = rawCards.slice(0, totalTarget);
    const initialIndex = Math.max(0, Math.min(requestedStartIndex, Math.max(totalTarget - 1, 0)));

    setTargetCount(totalTarget);
    setSessionCards(nextCards);
    setCurrentIndex(initialIndex);
    setSessionStarted(true);
  }, [carryoverCount, dailyCount, dailyCountLoaded, rawCards, requestedStartIndex, sessionStarted]);

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

  const routeOnReview = route?.params?.onReview;
  const routeOnPlayPronunciation = route?.params?.onPlayPronunciation;

  const advanceToNextCard = useCallback(() => {
    const isLastCard = currentIndex >= cards.length - 1;
    if (isLastCard) {
      setSessionCompleted(true);
      clearCarryover();
      navigation.navigate('SessionSummaryScreen', {
        reviewedCount: cards.length,
        targetCount: targetCount || cards.length,
      });
      return;
    }

    resetDetails();
    setCurrentIndex((prev) => prev + 1);
  }, [cards.length, currentIndex, navigation, resetDetails, targetCount]);

  const handleAnswer = useCallback(
    (rating) => {
      const reviewHandler = onReview || routeOnReview;
      if (typeof reviewHandler === 'function') {
        reviewHandler(rating);
      }

      const lemma = activeCard?.word || activeCard?.lemma;
      const flashcardId = activeCard?.flashcardId;
      if (flashcardId != null) {
        const review = {
          flashcardId: Number(flashcardId),
          result: rating,
          device: 'MOBILE',
          clientTimestamp: new Date().toISOString(),
        };
        submitReview(review)
          .then((response) => {
            markCardReviewed(review.flashcardId);
            if ((response?.updatedSrsState?.scheduledDays ?? 0) >= 25 && lemma) {
              updateWordKnowledge(lemma, 'KNOWN').catch(() =>
                enqueueWordKnowledge(lemma, 'KNOWN').catch(() => {})
              );
            }
          })
          .catch(async () => {
            await enqueueReview(review, lemma);
            await bumpDelta();
            await markCardReviewed(review.flashcardId);
          });
      }

      advanceToNextCard();
    },
    [activeCard, onReview, routeOnReview, advanceToNextCard]
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

  useEffect(() => {
    return () => {
      if (!sessionStarted || sessionCompleted) {
        return;
      }

      const plannedCount = targetCount || cards.length;
      const remaining = Math.max(plannedCount - currentIndex, 0);

      if (remaining > 0) {
        saveCarryover({ date: todayKey, remaining });
      } else {
        clearCarryover();
      }
    };
  }, [cards.length, currentIndex, sessionCompleted, sessionStarted, targetCount, todayKey]);

  const imageNode = useMemo(() => {
    if (activeCard?.imageUri) {
      return <Image source={{ uri: activeCard.imageUri }} style={styles.contextImage} resizeMode="cover" />;
    }

    return <View style={styles.imageFallback} />;
  }, [activeCard?.imageUri, styles.contextImage, styles.imageFallback]);

  if (!cards.length) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Çalışacak kartınız kalmadı.</Text>
          <Text style={styles.emptySubtitle}>Koleksiyonunuza yeni kelimeler ekleyin.</Text>
          <Pressable style={styles.emptyButton} onPress={() => navigation.goBack()}>
            <Text style={styles.emptyButtonText}>Koleksiyonlara dön</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.topBar}>
        <Image source={require('../../assets/capybara-avatar.jpg')} style={styles.avatar} />
        <Text style={styles.topBarTitle}>
          {collectionName ? `${collectionName} Flashcards` : 'Syntagma Flashcards'}
        </Text>
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
          style={({ pressed }) => [
            styles.cardFrame,
            detailsOpen && styles.cardFrameExpanded,
            pressed && !detailsOpen && styles.cardFramePressed,
          ]}
        >
          <Text style={styles.wordText}>{activeCard.word}</Text>
          <Text style={styles.sentenceText}>{`"${activeCard.sentence}"`}</Text>
          <Text style={styles.phoneticText}>{activeCard.phonetic}</Text>

          {!detailsOpen && <Text style={styles.detailsHintText}>Tap for details</Text>}

          {detailsOpen && (
            <Animated.View
              style={[styles.detailsContent, { opacity: detailsAnim, transform: [{ translateY: detailTranslateY }] }]}
            >
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
                        <Ionicons name="volume-high-outline" size={18} color={colors.accent} />
                        <Text style={styles.pronunciationButtonText}>EN Pronunciation</Text>
                      </Pressable>
                    )}
                    {activeCard.turkishPronunciationUri && (
                      <Pressable
                        style={styles.pronunciationButton}
                        onPress={() => handlePronunciation('tr', activeCard.turkishPronunciationUri)}
                      >
                        <Ionicons name="volume-high-outline" size={18} color={colors.accent} />
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


const createStyles = (colors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
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
      color: colors.accent,
      fontSize: 18,
      fontFamily: 'DMSans_600SemiBold',
    },
    // Empty state
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    emptyTitle: {
      color: colors.accent,
      fontSize: 20,
      fontFamily: 'PlayfairDisplay_700Bold',
      marginBottom: 8,
    },
    emptySubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
      fontFamily: 'DMSans_400Regular',
      marginBottom: 16,
    },
    emptyButton: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 20,
      backgroundColor: colors.accentStrong,
    },
    emptyButtonText: {
      color: colors.surface,
      fontSize: 13,
      fontFamily: 'DMSans_600SemiBold',
    },
    // Progress
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
      backgroundColor: colors.accent,
    },
    progressPillTodo: {
      backgroundColor: colors.border,
    },
    cardsLeftText: {
      color: colors.accentStrong,
      fontSize: 11,
      fontFamily: 'DMSans_600SemiBold',
      letterSpacing: 0.8,
    },
    // Card
    cardSection: {
      flex: 1,
      marginTop: 20,
    },
    cardFrame: {
      backgroundColor: colors.card,
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
      color: colors.accent,
      fontSize: 48,
      textAlign: 'center',
      fontFamily: 'PlayfairDisplay_700Bold_Italic',
    },
    phoneticText: {
      color: colors.textMuted,
      fontSize: 16,
      marginTop: 14,
      fontFamily: 'DMSans_400Regular',
    },
    sentenceText: {
      marginTop: 24,
      color: colors.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      fontFamily: 'DMSans_400Regular',
      fontStyle: 'italic',
    },
    detailsHintText: {
      marginTop: 26,
      color: colors.accent,
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
      backgroundColor: colors.pill,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    translationFlag: {
      fontSize: 18,
    },
    translationText: {
      color: colors.accent,
      fontSize: 18,
      fontFamily: 'DMSans_600SemiBold',
    },
    sentenceTrText: {
      marginTop: 12,
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      fontFamily: 'DMSans_400Regular',
    },
    pronunciationRow: {
      marginTop: 18,
      width: '100%',
      gap: 12,
    },
    pronunciationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 18,
      backgroundColor: colors.mutedSurface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    pronunciationButtonText: {
      color: colors.accent,
      fontSize: 12,
      fontFamily: 'DMSans_600SemiBold',
    },
    imageWrap: {
      marginTop: 16,
      width: '100%',
      borderRadius: 18,
      overflow: 'hidden',
    },
    contextImage: {
      width: '100%',
      height: 160,
    },
    imageFallback: {
      backgroundColor: colors.mutedSurface,
      borderRadius: 18,
      width: '100%',
      height: 160,
    },
    bottomDecisionRowInside: {
      marginTop: 18,
      flexDirection: 'row',
      gap: 12,
    },
    answerButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    againButton: {
      backgroundColor: colors.mutedSurface,
      borderRadius: 18,
    },
    againButtonText: {
      color: colors.accent,
      fontSize: 14,
      fontFamily: 'DMSans_600SemiBold',
    },
    goodButton: {
      backgroundColor: colors.accent,
      borderRadius: 18,
    },
    goodButtonText: {
      color: colors.surface,
      fontSize: 14,
      fontFamily: 'DMSans_600SemiBold',
    },
  });
