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
import { fetchCollectionById, fetchCollections, fetchReviewStats } from '../shared/api';
import { getBadgeState, saveBadgeState } from '../shared/storage';
import { BADGE_TIERS, computeBadgeState } from '../shared/badges';
import { useTheme } from '../shared/theme';

export default function HomePage({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [startingId, setStartingId] = useState(null);
  const [badgeState, setBadgeState] = useState(null);

  const loadCollections = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchCollections();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.content)
          ? data.content
          : Array.isArray(data?.collections)
            ? data.collections
            : [];
      setCollections(list);
    } catch (err) {
      setError(err?.message || 'Collections could not be loaded.');
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCollections();

      let isMounted = true;
      const loadBadge = async () => {
        const cached = await getBadgeState();
        if (isMounted && cached) {
          setBadgeState(computeBadgeState(cached.totalReviews));
        }

        try {
          const stats = await fetchReviewStats('all');
          const totalReviews = stats?.totalReviews ?? stats?.total ?? stats?.reviewCount ?? 0;
          if (isMounted && Number.isFinite(totalReviews)) {
            await saveBadgeState({ totalReviews });
            setBadgeState(computeBadgeState(totalReviews));
          }
        } catch (err) {
          // badge is non-critical
        }
      };
      loadBadge();
      return () => { isMounted = false; };
    }, [loadCollections])
  );

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

      try {
        const details = await fetchCollectionById(collectionId);
        const items = Array.isArray(details?.items) ? details.items : [];
        const cards = items.map((item) => ({
          word: item.lemma || item.word || 'Unknown',
          phonetic: '',
          sentence: item.exampleSentence || item.sourceSentence || '',
          translation: item.translation || '',
          sentenceTranslation: '',
        }));

        navigation.navigate('FlashcardReview', {
          cards,
          collectionId,
          collectionName: collection.name || details?.name || 'Collection',
        });
      } catch (err) {
        setError(err?.message || 'Collection could not be loaded.');
      } finally {
        setStartingId(null);
      }
    },
    [navigation]
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
                <Image
                  source={badgeState.currentTier?.image ?? BADGE_TIERS[0].image}
                  style={[styles.badgeImage, !badgeState.currentTier && styles.badgeImageLocked]}
                />
                <View style={styles.badgeInfo}>
                  <Text style={styles.badgeLabel}>
                    {badgeState.currentTier ? badgeState.currentTier.label : 'No badge yet'}
                  </Text>
                  <Text style={styles.badgeProgressText}>{badgeState.progressText}</Text>
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
              <Text style={styles.emptyTitle}>Çalışacak kartınız kalmadı.</Text>
              <Text style={styles.emptySubtitle}>Yeni kelimeler eklediğinizde burada görünecek.</Text>
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
  badgeImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  badgeImageLocked: {
    opacity: 0.35,
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
