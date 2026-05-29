import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useTheme } from '../shared/theme';
import { fetchVocabularyPage, updateWordKnowledge } from '../shared/api';
import { getCache, saveCache } from '../shared/storage';
import { enqueueWordKnowledge } from '../shared/offline';

const PAGE_SIZE = 50;
const OFFLINE_EMPTY_TITLE = 'Offline moddasin';
const OFFLINE_EMPTY_SUBTITLE = 'Internet gelince kelimeler senkronize olacak.';

const STATUSES = ['ALL', 'KNOWN', 'LEARNING', 'IGNORED'];

const STATUS_CONFIG = {
  KNOWN: { label: 'Known', icon: 'checkmark-circle', color: '#2D6A4F', textColor: '#FFFFFF' },
  LEARNING: { label: 'Learning', icon: 'school', color: '#E9A820', textColor: '#FFFFFF' },
  IGNORED: { label: 'Ignored', icon: 'eye-off', color: '#6C757D', textColor: '#FFFFFF' },
};

const normalizeLemma = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeSearch = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const vocabularyCacheKey = (filter, search, page) =>
  `syntagma.cache.vocabulary.${filter}.${normalizeSearch(search) || 'all'}.${page}.v1`;

const readVocabularyPage = (data) => {
  const content = Array.isArray(data?.content)
    ? data.content
    : Array.isArray(data)
      ? data
      : [];
  return {
    content,
    last: data?.last === true || content.length < PAGE_SIZE,
    totalElements: Number.isFinite(data?.totalElements) ? data.totalElements : null,
  };
};

export default function FlashcardLibraryScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [allWords, setAllWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalElements, setTotalElements] = useState(null);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [updatingLemmaKey, setUpdatingLemmaKey] = useState(null);
  const [offlineEmpty, setOfflineEmpty] = useState(false);
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const applyPage = useCallback((pageNumber, pageData) => {
    setAllWords((prev) => {
      if (pageNumber === 0) {
        return pageData.content;
      }

      const merged = new Map(prev.map((word) => [word.lemmaKey, word]));
      for (const word of pageData.content) {
        merged.set(word.lemmaKey, word);
      }
      return Array.from(merged.values());
    });
    setHasMore(!pageData.last);
    setTotalElements(pageData.totalElements);
  }, []);

  const loadWordsPage = useCallback(async (pageNumber = 0, { refresh = false, append = false } = {}) => {
    const cacheKey = vocabularyCacheKey(activeFilter, debouncedSearch, pageNumber);

    try {
      if (append) {
        setLoadingMore(true);
      } else if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      setOfflineEmpty(false);

      const cached = await getCache(cacheKey).catch(() => null);
      if (pageNumber === 0 && cached && !refresh) {
        applyPage(0, readVocabularyPage(cached));
      }

      if (isOffline) {
        if (cached) {
          applyPage(pageNumber, readVocabularyPage(cached));
        } else if (pageNumber === 0) {
          setAllWords([]);
          setHasMore(false);
          setTotalElements(null);
          setOfflineEmpty(true);
        }
        return;
      }

      const data = await fetchVocabularyPage(pageNumber, PAGE_SIZE, activeFilter, debouncedSearch);
      const pageData = readVocabularyPage(data);
      applyPage(pageNumber, pageData);
      saveCache(cacheKey, data).catch(() => {});
    } catch (err) {
      const cached = await getCache(cacheKey).catch(() => null);
      if (cached) {
        applyPage(pageNumber, readVocabularyPage(cached));
        setError('');
      } else {
        setError(err?.message || 'Could not load vocabulary.');
        if (pageNumber === 0) {
          setAllWords([]);
          setHasMore(false);
          setTotalElements(null);
        }
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [activeFilter, applyPage, debouncedSearch, isOffline]);

  useFocusEffect(
    useCallback(() => {
      loadWordsPage(0);
    }, [loadWordsPage])
  );

  const handleFilterChange = (filter) => {
    if (filter === activeFilter) {
      return;
    }
    setActiveFilter(filter);
    setAllWords([]);
    setHasMore(false);
    setTotalElements(null);
  };

  const handleRefresh = useCallback(() => {
    loadWordsPage(0, { refresh: true });
  }, [loadWordsPage]);

  const handleLoadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) {
      return;
    }
    const nextPage = Math.floor(allWords.length / PAGE_SIZE);
    loadWordsPage(nextPage, { append: true });
  }, [allWords.length, hasMore, loadWordsPage, loading, loadingMore]);

  useEffect(() => {
    setAllWords([]);
    setHasMore(false);
    setTotalElements(null);
  }, [debouncedSearch]);

  const handleOpenStatusPicker = (word) => {
    setSelectedWord(word);
    setStatusModalVisible(true);
  };

  const handleChangeStatus = useCallback(async (newStatus) => {
    if (!selectedWord) return;
    const lemmaKey = selectedWord.lemmaKey || normalizeLemma(selectedWord.lemma);
    if (!lemmaKey) {
      setStatusModalVisible(false);
      setSelectedWord(null);
      return;
    }

    setStatusModalVisible(false);
    setUpdatingLemmaKey(lemmaKey);

    try {
      await updateWordKnowledge(lemmaKey, newStatus);
    } catch {
      enqueueWordKnowledge(lemmaKey, newStatus).catch(() => {});
    }

    setAllWords((prev) => {
      const nextWord = { ...selectedWord, status: newStatus, updatedAt: new Date().toISOString() };
      const updated = prev
        .map((w) => (w.lemmaKey === lemmaKey ? nextWord : w))
        .filter((w) => activeFilter === 'ALL' || w.status === activeFilter);

      const pageIndex = Math.max(0, Math.floor(prev.findIndex((w) => w.lemmaKey === lemmaKey) / PAGE_SIZE));
      const cacheKey = vocabularyCacheKey(activeFilter, debouncedSearch, pageIndex);
      getCache(cacheKey)
        .then((cached) => {
          if (!cached?.content) return;
          const content = cached.content
            .map((w) => (w.lemmaKey === lemmaKey ? nextWord : w))
            .filter((w) => activeFilter === 'ALL' || w.status === activeFilter);
          saveCache(cacheKey, { ...cached, content }).catch(() => {});
        })
        .catch(() => {});
      return updated;
    });

    setUpdatingLemmaKey(null);
    setSelectedWord(null);
  }, [activeFilter, debouncedSearch, selectedWord]);

  const filteredWords = useMemo(() => {
    return allWords;
  }, [allWords]);

  const renderFilterChip = (filter) => {
    const isActive = filter === activeFilter;
    const config = filter === 'ALL' ? null : STATUS_CONFIG[filter];

    return (
      <Pressable
        key={filter}
        style={[
          styles.filterChip,
          isActive && styles.filterChipActive,
          isActive && config && { backgroundColor: config.color },
        ]}
        onPress={() => handleFilterChange(filter)}
      >
        {config && <Ionicons name={config.icon} size={14} color={isActive ? '#FFF' : colors.textSecondary} />}
        <Text
          style={[
            styles.filterChipText,
            isActive && styles.filterChipTextActive,
            isActive && config && { color: '#FFF' },
          ]}
        >
          {filter === 'ALL' ? 'All' : config?.label}
        </Text>
      </Pressable>
    );
  };

  const renderWordItem = ({ item }) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.LEARNING;
    const isUpdating = updatingLemmaKey === item.lemmaKey;

    return (
      <Pressable
        style={styles.wordCard}
        onPress={() => handleOpenStatusPicker(item)}
        disabled={isUpdating}
      >
        <View style={styles.wordCardLeft}>
          <Text style={styles.wordLemma}>{item.lemma}</Text>
          {item.updatedAt && (
            <Text style={styles.wordDate}>
              {new Date(item.updatedAt).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
          )}
        </View>

        <View style={styles.wordCardRight}>
          {isUpdating ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: config.color }]}>
              <Ionicons name={config.icon} size={14} color={config.textColor} />
              <Text style={styles.statusBadgeText}>{config.label}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Status change modal */}
      <Modal visible={statusModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Status</Text>
            <Text style={styles.modalSubtitle}>
              {selectedWord?.lemma ? `"${selectedWord.lemma}"` : ''}
            </Text>

            <View style={styles.statusGrid}>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <Pressable
                  key={key}
                  style={[styles.statusOption, { backgroundColor: config.color }]}
                  onPress={() => handleChangeStatus(key)}
                >
                  <Ionicons name={config.icon} size={22} color={config.textColor} />
                  <Text style={styles.statusOptionText}>{config.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.modalCancel}
              onPress={() => { setStatusModalVisible(false); setSelectedWord(null); }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Vocabulary</Text>
        <Text style={styles.headerSubtitle}>
          {totalElements != null
            ? `${totalElements} words tracked`
            : `${filteredWords.length}${hasMore ? '+' : ''} words tracked`}
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search vocabulary"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {STATUSES.map(renderFilterChip)}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading && !filteredWords.length ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading vocabulary...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredWords}
          keyExtractor={(item) => item.lemmaKey}
          renderItem={renderWordItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="book-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {offlineEmpty ? OFFLINE_EMPTY_TITLE : 'No words yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {offlineEmpty
                  ? OFFLINE_EMPTY_SUBTITLE
                  : 'Start reviewing flashcards to build your vocabulary list.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 14,
    marginBottom: 12,
  },
  headerTitle: {
    color: colors.accent,
    fontSize: 30,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  headerSubtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 22,
    gap: 8,
    marginBottom: 14,
  },
  searchWrap: {
    marginHorizontal: 22,
    marginBottom: 12,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    paddingVertical: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.mutedSurface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: 'DMSans_600SemiBold',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.surface,
  },
  errorText: {
    marginHorizontal: 22,
    marginBottom: 10,
    color: colors.warning,
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
  },
  listContent: {
    paddingHorizontal: 22,
    paddingBottom: 20,
  },
  footerLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  wordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  wordCardLeft: {
    flex: 1,
  },
  wordLemma: {
    color: colors.textPrimary,
    fontSize: 17,
    fontFamily: 'DMSans_600SemiBold',
  },
  wordDate: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
  },
  wordCardRight: {
    marginLeft: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'DMSans_600SemiBold',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 12,
    color: colors.accent,
    fontSize: 18,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  emptySubtitle: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
  },
  // Status picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 22,
    backgroundColor: colors.card,
    padding: 22,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  modalTitle: {
    color: colors.accent,
    fontSize: 20,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    fontFamily: 'DMSans_600SemiBold',
    marginBottom: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusOption: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  statusOptionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
  },
  modalCancel: {
    marginTop: 16,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
});
