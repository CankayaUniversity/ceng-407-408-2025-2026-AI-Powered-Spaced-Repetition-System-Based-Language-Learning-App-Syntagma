import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useNetInfo } from '@react-native-community/netinfo';
import {
  fetchAllFlashcards,
  fetchCollectionById,
  fetchCollections,
  fetchDailyCards,
  fetchAllWordKnowledge,
} from '../shared/api';
import { getBadgeState, getCache, saveCache, saveBadgeState } from '../shared/storage';
import { flushQueues, getReviewedIdsToday } from '../shared/offline';
import { computeCefrState, getCefrMedal } from '../shared/badges';
import { computeKnownWordsStats } from '../shared/known-words';
import { useTheme } from '../shared/theme';

const CACHE_COLLECTIONS = 'syntagma.cache.collections';
const cacheCollectionKey = (id) => `syntagma.cache.collection.${id}`;
const CACHE_DAILY = 'syntagma.cache.daily';
const CACHE_ALL_FLASHCARDS = 'syntagma.cache.flashcards.all.v1';
const CACHE_WORD_KNOWLEDGE = 'syntagma.cache.wordknowledge.all.v1';
const OFFLINE_EMPTY_TITLE = 'Offline moddasin';
const OFFLINE_EMPTY_SUBTITLE = 'Internet gelince koleksiyonlar senkronize olacak.';

export default function HomePage({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [startingId, setStartingId] = useState(null);
  const [badgeState, setBadgeState] = useState(null);
  const [offlineEmpty, setOfflineEmpty] = useState(false);
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const loadCollections = useCallback(async () => {
    if (!isOffline) {
      flushQueues().catch(() => {});
    }
    try {
      setLoading(true);
      setError('');
      setOfflineEmpty(false);

      if (isOffline) {
        const cached = await getCache(CACHE_COLLECTIONS).catch(() => null);
        if (cached) {
          setCollections(cached);
        } else {
          setCollections([]);
          setOfflineEmpty(true);
        }
        return;
      }
      const data = await fetchCollections();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.content)
          ? data.content
          : Array.isArray(data?.collections)
            ? data.collections
            : [];
      setCollections(list);
      saveCache(CACHE_COLLECTIONS, list).catch(() => {});
    } catch (err) {
      const cached = await getCache(CACHE_COLLECTIONS).catch(() => null);
      if (cached) {
        setCollections(cached);
        setError('');
      } else {
        setError(err?.message || 'Collections could not be loaded.');
        setCollections([]);
      }
    } finally {
      setLoading(false);
    }
  }, [isOffline]);

  useFocusEffect(
    useCallback(() => {
      loadCollections();

      let isMounted = true;
      const loadBadge = async () => {
        const cached = await getBadgeState();
        if (isMounted && cached) {
          setBadgeState(computeCefrState(cached.knownWords));
        }

        try {
          if (isOffline) {
            const cachedFlashcards = await getCache(CACHE_ALL_FLASHCARDS).catch(() => []);
            const cachedKnowledge = await getCache(CACHE_WORD_KNOWLEDGE).catch(() => []);
            if ((cachedFlashcards?.length ?? 0) > 0 || (cachedKnowledge?.length ?? 0) > 0) {
              const { knownCount } = computeKnownWordsStats(
                Array.isArray(cachedFlashcards) ? cachedFlashcards : [],
                Array.isArray(cachedKnowledge) ? cachedKnowledge : []
              );
              if (isMounted) {
                setBadgeState(computeCefrState(knownCount));
              }
            }
            return;
          }

          const [flashcardsResult, knowledgeResult] = await Promise.allSettled([
            fetchAllFlashcards(),
            fetchAllWordKnowledge(),
          ]);

          const flashcards = flashcardsResult.status === 'fulfilled' ? flashcardsResult.value : [];
          const knowledge = knowledgeResult.status === 'fulfilled' ? knowledgeResult.value : [];

          if (flashcardsResult.status === 'fulfilled') {
            saveCache(CACHE_ALL_FLASHCARDS, flashcards).catch(() => {});
          }
          if (knowledgeResult.status === 'fulfilled') {
            saveCache(CACHE_WORD_KNOWLEDGE, knowledge).catch(() => {});
          }

          if (flashcardsResult.status === 'rejected' && knowledgeResult.status === 'rejected') {
            throw flashcardsResult.reason || knowledgeResult.reason || new Error('Failed to load vocabulary.');
          }

          const { knownCount } = computeKnownWordsStats(flashcards, knowledge);
          if (isMounted) {
            await saveBadgeState({ knownWords: knownCount });
            setBadgeState(computeCefrState(knownCount));
          }
        } catch (err) {
          // badge is non-critical
        }
      };
      loadBadge();
      return () => { isMounted = false; };
    }, [loadCollections])
  );

  const filterCardsForToday = useCallback(async (cards) => {
    if (!cards.length) {
      return cards;
    }

    let dailyCards = null;

    try {
      const daily = await fetchDailyCards();
      if (Array.isArray(daily?.cards)) {
        dailyCards = daily.cards;
        saveCache(CACHE_DAILY, daily).catch(() => {});
      }
    } catch {
      const cached = await getCache(CACHE_DAILY).catch(() => null);
      if (Array.isArray(cached?.cards)) {
        dailyCards = cached.cards;
      }
    }

    let filtered = cards;

    if (dailyCards !== null) {
      const idSet = new Set(
        dailyCards
          .map((entry) => entry?.flashcardId)
          .filter((id) => id != null)
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      );
      filtered = idSet.size ? cards.filter((card) => idSet.has(Number(card.flashcardId))) : [];
    }

    const reviewedIds = await getReviewedIdsToday().catch(() => []);
    if (reviewedIds.length > 0) {
      const reviewedSet = new Set(reviewedIds.map(String));
      filtered = filtered.filter(
        (c) => !reviewedSet.has(String(c.flashcardId ?? c.id))
      );
    }

    return filtered;
  }, []);

  const filterFlashcardsByCollection = useCallback((flashcards, collectionId) => {
    return flashcards.filter((card) => {
      const ids = Array.isArray(card?.collectionIds) ? card.collectionIds : [];
      const allIds = ids.slice();
      if (card?.collectionId != null) {
        allIds.push(card.collectionId);
      }
      return allIds.some((id) => Number(id) === Number(collectionId));
    });
  }, []);

  const mapFlashcardsToCards = useCallback((items) => {
    return items.map((item) => ({
      flashcardId: item.flashcardId ?? item.id,
      word: item.lemma || item.word || 'Unknown',
      phonetic: '',
      sentence: item.exampleSentence || item.sourceSentence || '',
      translation: item.translation || '',
      sentenceTranslation: '',
    }));
  }, []);

  const loadCachedCollectionCards = useCallback(async (collectionId) => {
    const cachedCards = await getCache(cacheCollectionKey(collectionId)).catch(() => null);
    if (Array.isArray(cachedCards) && cachedCards.length > 0) {
      return cachedCards;
    }

    const cachedFlashcards = await getCache(CACHE_ALL_FLASHCARDS).catch(() => null);
    if (Array.isArray(cachedFlashcards) && cachedFlashcards.length > 0) {
      const filtered = filterFlashcardsByCollection(cachedFlashcards, collectionId);
      if (filtered.length > 0) {
        return mapFlashcardsToCards(filtered);
      }
    }

    return null;
  }, [filterFlashcardsByCollection, mapFlashcardsToCards]);

  const handleStart = useCallback(
    async (collection) => {
      if (!collection) {
        return;
      }

      const collectionId = collection.collectionId ?? collection.id;
      if (!collectionId) {
        return;
      }

      setStartingId(collectionId);
      setError('');

      if (isOffline) {
        const cachedCards = await loadCachedCollectionCards(collectionId);
        if (Array.isArray(cachedCards) && cachedCards.length > 0) {
          const filteredCards = await filterCardsForToday(cachedCards);
          navigation.navigate('FlashcardReview', {
            cards: filteredCards,
            collectionId,
            collectionName: collection.name || 'Collection',
          });
        } else {
          setError(OFFLINE_EMPTY_SUBTITLE);
        }
        setStartingId(null);
        return;
      }

      try {
        const details = await fetchCollectionById(collectionId);
        const items = Array.isArray(details?.items) ? details.items : [];
        const mappedItems = items.map((item) => ({
          flashcardId: item.flashcardId ?? item.id,
          word: item.lemma || item.word || 'Unknown',
          phonetic: '',
          sentence: '',
          translation: item.translation || '',
          sentenceTranslation: '',
        }));

        let cards = mappedItems;

        if (!cards.length) {
          const allFlashcards = await fetchAllFlashcards();
          saveCache(CACHE_ALL_FLASHCARDS, allFlashcards).catch(() => {});
          const filtered = filterFlashcardsByCollection(allFlashcards, collectionId);

          cards = mapFlashcardsToCards(filtered);
        }

        saveCache(cacheCollectionKey(collectionId), cards).catch(() => {});

        const filteredCards = await filterCardsForToday(cards);

        navigation.navigate('FlashcardReview', {
          cards: filteredCards,
          collectionId,
          collectionName: collection.name || details?.name || 'Collection',
        });
      } catch (err) {
        const cachedCards = await loadCachedCollectionCards(collectionId);
        if (Array.isArray(cachedCards) && cachedCards.length > 0) {
          const filteredCards = await filterCardsForToday(cachedCards);
          navigation.navigate('FlashcardReview', {
            cards: filteredCards,
            collectionId,
            collectionName: collection.name || 'Collection',
          });
        } else {
          setError(err?.message || 'Collection could not be loaded.');
        }
      } finally {
        setStartingId(null);
      }
    },
    [filterCardsForToday, isOffline, loadCachedCollectionCards, mapFlashcardsToCards, navigation, filterFlashcardsByCollection]
  );

  const renderCollectionCard = ({ item }) => {
    const itemCount = Array.isArray(item.items) ? item.items.length : item.itemsCount || 0;
    const initial = (item.name || 'C').trim().slice(0, 1).toUpperCase();
    const isStarting = startingId === (item.collectionId ?? item.id);

    return (
      <View style={styles.languageCard}>
        <View style={styles.languageIconCircle}>
          <Text style={styles.languageInitial}>{initial}</Text>
        </View>

        <Text style={styles.languageName}>{item.name || 'Untitled Collection'}</Text>
        <Text style={styles.collectionCount}>{`${itemCount} cards`}</Text>

        <Pressable
          style={styles.startButton}
          onPress={() => handleStart(item)}
          disabled={isStarting}
        >
          {isStarting ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.startButtonText}>Start</Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <FlatList
        data={collections}
        keyExtractor={(item) => String(item.collectionId ?? item.id ?? item.name)}
        renderItem={renderCollectionCard}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.topNav}>
              <Image source={require('../../assets/maskot.jpg')} style={styles.avatar} />
              <Text style={styles.brandName}>Syntagma</Text>
            </View>

            <View style={styles.welcomeCard}>
              <Text style={styles.welcomeTitle}>Welcome Back</Text>
              <Text style={styles.welcomeSubtitle}>Ready for your daily linguistic dip?</Text>
            </View>

            {badgeState && (
              <View style={styles.badgeCard}>
                <View style={styles.levelBadgeRow}>
                  <View style={styles.levelBadge}>
                    {badgeState.currentLevel && getCefrMedal(badgeState.currentLevel.id) ? (
                      <Image
                        source={getCefrMedal(badgeState.currentLevel.id).image}
                        style={styles.levelBadgeImage}
                      />
                    ) : (
                      <Text style={styles.levelBadgeText}>
                        {badgeState.currentLevel?.label ?? 'A0'}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.badgeInfo}>
                  <Text style={styles.badgeLabel}>
                    {badgeState.currentLevel ? `Level ${badgeState.currentLevel.label}` : 'Level A0'}
                  </Text>
                  <Text style={styles.badgeProgressText}>
                    {`${badgeState.progressPercent}% • ${badgeState.progressText}`}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(badgeState.progress * 100)}%` }]} />
                  </View>
                </View>
              </View>
            )}

            <View style={styles.startLearningRow}>
              <Text style={styles.startLearningLabel}>Collections</Text>
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.loadingText}>Loading collections...</Text>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {offlineEmpty ? OFFLINE_EMPTY_TITLE : 'Çalışacak kartınız kalmadı.'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {offlineEmpty ? OFFLINE_EMPTY_SUBTITLE : 'Yeni kelimeler eklediğinizde burada görünecek.'}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
  },
  brandName: {
    color: colors.accent,
    fontSize: 22,
    fontFamily: 'DMSans_600SemiBold',
  },
  welcomeCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 24,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
    position: 'relative',
  },
  welcomeTitle: {
    marginTop: 8,
    color: colors.accent,
    fontSize: 28,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  welcomeSubtitle: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
  startLearningRow: {
    marginBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  startLearningLabel: {
    color: colors.textPrimary,
    fontSize: 24,
    fontFamily: 'DMSans_600SemiBold',
  },
  errorText: {
    marginTop: 4,
    marginBottom: 10,
    paddingHorizontal: 16,
    color: colors.warning,
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  loadingText: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
  },
  gridContent: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  gridRow: {
    gap: 12,
  },
  languageCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
  },
  languageIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.mutedSurface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
  },
  languageInitial: {
    color: colors.accent,
    fontSize: 28,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  languageImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  languageName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontFamily: 'DMSans_600SemiBold',
    marginBottom: 12,
  },
  collectionCount: {
    marginTop: -6,
    marginBottom: 12,
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
  startButton: {
    width: '100%',
    borderRadius: 50,
    backgroundColor: colors.accentSoft,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
  },
  emptyState: {
    marginTop: 10,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 18,
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.accent,
    fontSize: 16,
    fontFamily: 'DMSans_600SemiBold',
    marginBottom: 4,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
  },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 16,
  },
  levelBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.mutedSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeRow: {
    width: 74,
    alignItems: 'center',
    gap: 8,
  },
  levelBadgeText: {
    color: colors.accent,
    fontSize: 20,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
    levelBadgeImage: {
      width: 44,
      height: 44,
    },
  badgeInfo: {
    flex: 1,
  },
  badgeLabel: {
    color: colors.accent,
    fontSize: 16,
    fontFamily: 'DMSans_600SemiBold',
    marginBottom: 2,
  },
  badgeProgressText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.mutedSurface,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
