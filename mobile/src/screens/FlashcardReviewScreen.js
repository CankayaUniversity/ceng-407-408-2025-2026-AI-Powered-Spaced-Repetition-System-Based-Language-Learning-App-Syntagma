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
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  clearCarryover,
  getCarryover,
  getLastStudyCount,
  saveCarryover,
} from '../shared/storage';
import { fetchFlashcardMedia, fetchMediaDownloadUrl, getDeviceTimeZone, submitReview, updateWordKnowledge } from '../shared/api';
import { bumpDelta, enqueueReview, enqueueWordKnowledge, markCardReviewed } from '../shared/offline';
import { useTheme } from '../shared/theme';

const DEFAULT_CARDS = [];

function fetchDictAudio(word, cancelled, setUri) {
  fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (cancelled || !Array.isArray(data)) return;
      const audio = data[0]?.phonetics?.find((p) => p.audio)?.audio || '';
      if (audio) setUri(audio);
    })
    .catch(() => {});
}

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
  const [audioStatus, setAudioStatus] = useState({ isPlaying: false, isLoading: false });
  const [fetchedAudioUri, setFetchedAudioUri] = useState('');
  const [fetchedImageUri, setFetchedImageUri] = useState('');
  const [dictAudioUri, setDictAudioUri] = useState('');
  const soundRef = useRef(null);
  const audioRequestRef = useRef(0);
  const autoplayedCardRef = useRef(null);

  const detailsAnim = useRef(new Animated.Value(0)).current;
  const cards = sessionCards.length ? sessionCards : rawCards;
  const activeCard = cards[currentIndex] || cards[0];
  const cardAudioUri =
    activeCard?.sentenceAudioDataUrl || activeCard?.audioUrl || activeCard?.audioUri || '';
  const cardImageUri =
    activeCard?.imageUri || activeCard?.imageUrl || activeCard?.screenshotDataUrl || '';
  const sentenceAudioUri = cardAudioUri || fetchedAudioUri;
  const effectiveAudioUri = sentenceAudioUri || dictAudioUri;
  const effectiveImageUri = cardImageUri || fetchedImageUri;
  const sourceSentence = activeCard?.sourceSentence || activeCard?.sentence || '';
  const exampleSentence = activeCard?.exampleSentence || '';
  const usageNote = activeCard?.usageNote || '';
  const usageTitle = activeCard?.sourceTitle || '';
  const usageUrl = activeCard?.sourceUrl || '';
  const usageTimestamp =
    Number.isFinite(activeCard?.videoTimestamp) ? Number(activeCard.videoTimestamp) : null;
  const detailsOpen = cardState === 'isExpanded';
  const plannedCardsCount = targetCount || cards.length;
  const originalCardsLeft = Math.max(plannedCardsCount - currentIndex, 0);
  const retryCardsLeft =
    currentIndex < plannedCardsCount
      ? Math.max(cards.length - plannedCardsCount, 0)
      : Math.max(cards.length - currentIndex, 0);
  const cardsLeftText = retryCardsLeft > 0
    ? `${originalCardsLeft} CARDS LEFT + ${retryCardsLeft} ${retryCardsLeft === 1 ? 'RETRY' : 'RETRIES'}`
    : `${originalCardsLeft} CARDS LEFT`;
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

  const closeDetails = useCallback(() => {
    if (!detailsOpen) {
      return;
    }

    LayoutAnimation.configureNext(
      LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    Animated.timing(detailsAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setCardState('isCollapsed'));
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

  const formatTimestamp = useCallback((seconds) => {
    if (!Number.isFinite(seconds)) {
      return '';
    }

    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }, []);

  const usageMeta = useMemo(() => {
    const pieces = [];
    if (usageTitle) {
      pieces.push(usageTitle);
    }
    if (usageUrl) {
      pieces.push(usageUrl);
    }
    if (Number.isFinite(usageTimestamp)) {
      pieces.push(formatTimestamp(usageTimestamp));
    }
    return pieces.join(' • ');
  }, [formatTimestamp, usageTimestamp, usageTitle, usageUrl]);

  const stopCardAudio = useCallback(async () => {
    audioRequestRef.current += 1;
    const sound = soundRef.current;
    soundRef.current = null;

    if (sound) {
      try {
        await sound.stopAsync();
      } catch (err) {
        // Ignore stop errors to keep UI responsive.
      }

      try {
        await sound.unloadAsync();
      } catch (err) {
        // Ignore unload errors to keep UI responsive.
      }
    }

    setAudioStatus((prev) =>
      prev.isPlaying || prev.isLoading
        ? { ...prev, isPlaying: false, isLoading: false }
        : prev
    );
  }, []);

  const playAudioUri = useCallback(async (uri) => {
    if (!uri) {
      return false;
    }

    await stopCardAudio();
    const audioRequestId = audioRequestRef.current + 1;
    audioRequestRef.current = audioRequestId;
    setAudioStatus({ isPlaying: false, isLoading: true });

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      if (audioRequestRef.current !== audioRequestId) {
        try {
          await sound.stopAsync();
        } catch (err) {
          // Ignore stop errors from stale audio loads.
        }

        try {
          await sound.unloadAsync();
        } catch (err) {
          // Ignore unload errors from stale audio loads.
        }

        return false;
      }

      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (audioRequestRef.current !== audioRequestId) return;
        if (!status.isLoaded) return;
        if (status.didJustFinish) { stopCardAudio(); return; }
        setAudioStatus((prev) => ({ ...prev, isPlaying: status.isPlaying, isLoading: false }));
      });
      return true;
    } catch {
      if (audioRequestRef.current === audioRequestId) {
        setAudioStatus({ isPlaying: false, isLoading: false });
      }
      return false;
    }
  }, [stopCardAudio]);

  const handleCardAudio = useCallback(async () => {
    if (!effectiveAudioUri) {
      return;
    }

    if (audioStatus.isPlaying || audioStatus.isLoading) {
      await stopCardAudio();
      return;
    }

    try {
      const played = await playAudioUri(effectiveAudioUri);
      if (played) {
        return;
      }
    } catch {
      // Fall through to the dictionary fallback below.
    }

    if (dictAudioUri && dictAudioUri !== effectiveAudioUri) {
      await playAudioUri(dictAudioUri);
    }
  }, [audioStatus.isLoading, audioStatus.isPlaying, dictAudioUri, effectiveAudioUri, playAudioUri, stopCardAudio]);

  const handleCardPress = useCallback(() => {
    if (detailsOpen) {
      stopCardAudio();
      closeDetails();
      return;
    }

    openDetails();
  }, [closeDetails, detailsOpen, openDetails, stopCardAudio]);

  const advanceToNextCard = useCallback((cardToRequeue = null) => {
    const nextCardCount = cards.length + (cardToRequeue ? 1 : 0);
    const isLastCard = currentIndex >= nextCardCount - 1;

    if (cardToRequeue) {
      setSessionCards((prev) => {
        const baseCards = prev.length ? prev : rawCards;
        return [...baseCards, cardToRequeue];
      });
    }

    if (isLastCard) {
      const finalTargetCount = targetCount || nextCardCount;
      setSessionCompleted(true);
      clearCarryover();
      navigation.navigate('SessionSummaryScreen', {
        reviewedCount: finalTargetCount,
        targetCount: finalTargetCount,
        retryCount: Math.max(nextCardCount - finalTargetCount, 0),
      });
      return;
    }

    resetDetails();
    setCurrentIndex((prev) => prev + 1);
  }, [cards.length, currentIndex, navigation, rawCards, resetDetails, targetCount]);

  const handleAnswer = useCallback(
    (rating) => {
      const reviewHandler = onReview || routeOnReview;
      if (typeof reviewHandler === 'function') {
        reviewHandler(rating);
      }

      const lemma = activeCard?.word || activeCard?.lemma;
      const flashcardId = activeCard?.flashcardId;
      if (flashcardId != null) {
        const clientTimestamp = new Date().toISOString();
        const review = {
          flashcardId: Number(flashcardId),
          result: rating,
          device: 'MOBILE',
          clientTimestamp,
          clientTimeZone: getDeviceTimeZone(),
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

      const cardToRequeue = rating === Rating.Again ? activeCard : null;
      advanceToNextCard(cardToRequeue);
    },
    [activeCard, onReview, routeOnReview, advanceToNextCard, todayKey]
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
    autoplayedCardRef.current = null;
    stopCardAudio();
  }, [currentIndex, stopCardAudio]);

  useEffect(() => {
    if (!detailsOpen || !sentenceAudioUri) {
      return;
    }

    const autoplayKey = String(activeCard?.flashcardId ?? `${currentIndex}:${activeCard?.word ?? ''}`);
    if (autoplayedCardRef.current === autoplayKey) {
      return;
    }

    autoplayedCardRef.current = autoplayKey;
    playAudioUri(sentenceAudioUri);
  }, [activeCard?.flashcardId, activeCard?.word, currentIndex, detailsOpen, playAudioUri, sentenceAudioUri]);

  useEffect(() => () => {
    stopCardAudio();
  }, [stopCardAudio]);

  useEffect(() => {
    return () => {
      if (!sessionStarted || sessionCompleted) {
        return;
      }

      const plannedCount = targetCount || cards.length;
      const originalRemaining = Math.max(plannedCount - currentIndex, 0);
      const retryRemaining =
        currentIndex < plannedCount
          ? Math.max(cards.length - plannedCount, 0)
          : Math.max(cards.length - currentIndex, 0);
      const remaining = originalRemaining + retryRemaining;

      if (remaining > 0) {
        saveCarryover({ date: todayKey, remaining });
      } else {
        clearCarryover();
      }
    };
  }, [cards.length, currentIndex, sessionCompleted, sessionStarted, targetCount, todayKey]);

  useEffect(() => {
    setFetchedAudioUri('');
    setFetchedImageUri('');
    setDictAudioUri('');

    const flashcardId = activeCard?.flashcardId;
    const word = activeCard?.word;

    let cancelled = false;

    // Always pre-fetch dict audio for this word as a background fallback
    if (word) fetchDictAudio(word, cancelled, setDictAudioUri);

    if (!flashcardId) return () => { cancelled = true; };

    fetchFlashcardMedia(flashcardId)
      .then((mediaList) => {
        if (cancelled) return;

        if (!Array.isArray(mediaList)) {
          if (!cardAudioUri && word) fetchDictAudio(word, cancelled, setDictAudioUri);
          return;
        }

        const audioAsset = mediaList.find((m) => m.type === 'AUDIO');
        const imageAsset = mediaList.find((m) => m.type === 'SCREENSHOT');

        if (!cardAudioUri) {
          if (audioAsset?.mediaId) {
            fetchMediaDownloadUrl(audioAsset.mediaId)
              .then((res) => {
                if (!cancelled && res?.downloadUrl) setFetchedAudioUri(res.downloadUrl);
                else if (!cancelled && word) fetchDictAudio(word, cancelled, setDictAudioUri);
              })
              .catch(() => { if (!cancelled && word) fetchDictAudio(word, cancelled, setDictAudioUri); });
          } else if (word) {
            fetchDictAudio(word, cancelled, setDictAudioUri);
          }
        }

        if (!cardImageUri && imageAsset?.mediaId) {
          fetchMediaDownloadUrl(imageAsset.mediaId)
            .then((res) => { if (!cancelled && res?.downloadUrl) setFetchedImageUri(res.downloadUrl); })
            .catch(() => {});
        }
    })
      .catch(() => {
        if (!cancelled && !cardAudioUri && word) fetchDictAudio(word, cancelled, setDictAudioUri);
      });

    return () => { cancelled = true; };
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps


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
        <Text style={styles.topBarTitle}>
          {collectionName ? `${collectionName} Flashcards` : 'Syntagma Flashcards'}
        </Text>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${(currentIndex / Math.max(cards.length, 1)) * 100}%` }]} />
        </View>
        <Text style={styles.cardsLeftText}>{cardsLeftText}</Text>
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
        <Pressable style={styles.cardSectionFlipArea} onPress={handleCardPress} />
        {detailsOpen ? (
          <View style={[styles.cardFrame, styles.cardFrameExpanded]}>
            <ScrollView
              style={styles.expandedCardScroll}
              contentContainerStyle={styles.expandedCardScrollContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Text style={styles.wordText}>{activeCard.word}</Text>
              {sourceSentence ? <Text style={styles.sentenceText}>{`"${sourceSentence}"`}</Text> : null}
              <Text style={styles.phoneticText}>{activeCard.phonetic}</Text>

              <Animated.View
                style={[styles.detailsContent, { opacity: detailsAnim, transform: [{ translateY: detailTranslateY }] }]}
              >
                <Text style={[styles.detailLabel, styles.detailLabelTop]}>Meaning</Text>
                <View style={styles.translationPill}>
                  <Text style={styles.translationFlag}>🇹🇷</Text>
                  <Text style={styles.translationText}>{activeCard.translation}</Text>
                </View>

                {activeCard.sentenceTranslation ? (
                  <Text style={styles.sentenceTrText}>{activeCard.sentenceTranslation}</Text>
                ) : null}

                {exampleSentence ? (
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>Example sentence</Text>
                    <Text style={styles.detailText}>{exampleSentence}</Text>
                  </View>
                ) : null}

                {usageNote ? (
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>AI Usage Note</Text>
                    <Text style={styles.detailText}>{usageNote}</Text>
                  </View>
                ) : null}

                {usageMeta ? (
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>Source</Text>
                    <Text style={styles.detailMeta}>{usageMeta}</Text>
                  </View>
                ) : null}

                {effectiveAudioUri ? (
                  <Pressable
                    style={styles.audioButton}
                    onPress={(event) => {
                      event?.stopPropagation?.();
                      handleCardAudio();
                    }}
                    disabled={audioStatus.isLoading}
                  >
                    <Ionicons
                      name={audioStatus.isPlaying ? 'pause-circle-outline' : 'play-circle-outline'}
                      size={18}
                      color={colors.accent}
                    />
                    <Text style={styles.audioButtonText}>
                      {audioStatus.isLoading
                        ? 'Loading audio'
                        : audioStatus.isPlaying
                          ? 'Pause audio'
                          : 'Play audio'}
                    </Text>
                  </Pressable>
                ) : null}

                {(activeCard.englishPronunciationUri || activeCard.turkishPronunciationUri) && (
                  <View style={styles.pronunciationRow}>
                    {activeCard.englishPronunciationUri && (
                      <Pressable
                        style={styles.pronunciationButton}
                        onPress={(event) => {
                          event?.stopPropagation?.();
                          handlePronunciation('en', activeCard.englishPronunciationUri);
                        }}
                      >
                        <Ionicons name="volume-high-outline" size={18} color={colors.accent} />
                        <Text style={styles.pronunciationButtonText}>EN Pronunciation</Text>
                      </Pressable>
                    )}
                    {activeCard.turkishPronunciationUri && (
                      <Pressable
                        style={styles.pronunciationButton}
                        onPress={(event) => {
                          event?.stopPropagation?.();
                          handlePronunciation('tr', activeCard.turkishPronunciationUri);
                        }}
                      >
                        <Ionicons name="volume-high-outline" size={18} color={colors.accent} />
                        <Text style={styles.pronunciationButtonText}>TR Pronunciation</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {effectiveImageUri ? (
                  <View style={styles.imageWrap}>
                    <Image source={{ uri: effectiveImageUri }} style={styles.contextImage} resizeMode="cover" />
                  </View>
                ) : null}
              </Animated.View>
            </ScrollView>
          </View>
        ) : (
          <Pressable
            onPress={handleCardPress}
            style={({ pressed }) => [
              styles.cardFrame,
              pressed && styles.cardFramePressed,
            ]}
          >
            <>
              <Text style={styles.wordText}>{activeCard.word}</Text>
              {sourceSentence ? <Text style={styles.sentenceText}>{`"${sourceSentence}"`}</Text> : null}
              <Text style={styles.phoneticText}>{activeCard.phonetic}</Text>
              <Text style={styles.detailsHintText}>Tap for details</Text>
            </>
          </Pressable>
        )}
      </View>

      <View style={styles.bottomRow}>
        <Pressable style={[styles.answerButton, styles.againButton]} onPress={() => handleAnswer(Rating.Again)}>
          <Text style={styles.againButtonText}>I don't know</Text>
        </Pressable>
        <Pressable style={[styles.answerButton, styles.goodButton]} onPress={() => handleAnswer(Rating.Good)}>
          <Text style={styles.goodButtonText}>I know</Text>
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
    progressBarTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      marginRight: 10,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
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
      position: 'relative',
    },
    cardSectionFlipArea: {
      ...StyleSheet.absoluteFillObject,
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
    expandedCardScroll: {
      flex: 1,
      width: '100%',
    },
    expandedCardScrollContent: {
      alignItems: 'center',
      paddingBottom: 6,
    },
    detailsContent: {
      marginTop: 18,
      width: '100%',
      alignItems: 'center',
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
    detailLabel: {
      alignSelf: 'flex-start',
      marginBottom: 6,
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: 'DMSans_600SemiBold',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    detailLabelTop: {
      marginTop: 14,
    },
    detailBlock: {
      marginTop: 14,
      width: '100%',
    },
    detailText: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: 'DMSans_400Regular',
    },
    detailMeta: {
      marginTop: 6,
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: 'DMSans_400Regular',
    },
    sentenceTrText: {
      marginTop: 12,
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      fontFamily: 'DMSans_400Regular',
    },
    audioButton: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 18,
      backgroundColor: colors.mutedSurface,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    audioButtonText: {
      color: colors.accent,
      fontSize: 12,
      fontFamily: 'DMSans_600SemiBold',
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
    bottomRow: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 8,
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
