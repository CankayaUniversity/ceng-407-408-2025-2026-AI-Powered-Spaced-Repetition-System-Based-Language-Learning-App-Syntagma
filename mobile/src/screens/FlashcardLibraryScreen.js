import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../shared/theme';
import { fetchAllFlashcards, fetchAllWordKnowledge, updateWordKnowledge } from '../shared/api';
import { getCache, saveCache } from '../shared/storage';
import { enqueueWordKnowledge } from '../shared/offline';

const CACHE_LIBRARY = 'syntagma.cache.wordlibrary.v1';

const STATUSES = ['ALL', 'KNOWN', 'LEARNING', 'UNKNOWN', 'IGNORED'];

const STATUS_CONFIG = {
  KNOWN: { label: 'Known', icon: 'checkmark-circle', color: '#2D6A4F', textColor: '#FFFFFF' },
  LEARNING: { label: 'Learning', icon: 'school', color: '#E9A820', textColor: '#FFFFFF' },
  UNKNOWN: { label: 'Unknown', icon: 'help-circle', color: '#C44536', textColor: '#FFFFFF' },
  IGNORED: { label: 'Ignored', icon: 'eye-off', color: '#6C757D', textColor: '#FFFFFF' },
};

const VALID_STATUSES = new Set(['KNOWN', 'LEARNING', 'UNKNOWN', 'IGNORED']);

const normalizeLemma = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeStatus = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const upper = value.trim().toUpperCase();
  return VALID_STATUSES.has(upper) ? upper : null;
};

const mergeWordSources = (flashcards, knowledge) => {
  const wkMap = new Map();
  for (const item of knowledge) {
    const lemmaValue = item?.lemma ?? item?.word;
    const lemmaKey = normalizeLemma(lemmaValue);
    if (!lemmaKey) {
      continue;
    }

    const status = normalizeStatus(item?.status) || 'LEARNING';
    wkMap.set(lemmaKey, {
      lemma: String(lemmaValue || lemmaKey).trim() || lemmaKey,
      lemmaKey,
      status,
      updatedAt: item?.updatedAt ?? null,
    });
  }

  const merged = new Map();
  for (const card of flashcards) {
    const lemmaValue = card?.lemma ?? card?.word;
    const lemmaKey = normalizeLemma(lemmaValue);
    if (!lemmaKey) {
      continue;
    }

    const wkEntry = wkMap.get(lemmaKey);
    const status = wkEntry?.status || normalizeStatus(card?.knowledgeStatus) || 'LEARNING';
    merged.set(lemmaKey, {
      lemma: wkEntry?.lemma || String(lemmaValue || lemmaKey).trim() || lemmaKey,
      lemmaKey,
      status,
      updatedAt: wkEntry?.updatedAt ?? card?.updatedAt ?? card?.createdAt ?? null,
    });
  }

  for (const [lemmaKey, wkEntry] of wkMap.entries()) {
    if (!merged.has(lemmaKey)) {
      merged.set(lemmaKey, wkEntry);
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.lemma.localeCompare(b.lemma, 'tr-TR', { sensitivity: 'base' })
  );
};

export default function FlashcardLibraryScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [allWords, setAllWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [updatingLemmaKey, setUpdatingLemmaKey] = useState(null);

  const loadWords = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [flashcardsResult, knowledgeResult] = await Promise.allSettled([
        fetchAllFlashcards(),
        fetchAllWordKnowledge(),
      ]);

      const flashcards = flashcardsResult.status === 'fulfilled' ? flashcardsResult.value : [];
      const knowledge = knowledgeResult.status === 'fulfilled' ? knowledgeResult.value : [];

      if (flashcardsResult.status === 'rejected' && knowledgeResult.status === 'rejected') {
        throw flashcardsResult.reason || knowledgeResult.reason || new Error('Failed to load vocabulary.');
      }

      const merged = mergeWordSources(flashcards, knowledge);
      setAllWords(merged);
      saveCache(CACHE_LIBRARY, merged).catch(() => {});
    } catch (err) {
      const cached = await getCache(CACHE_LIBRARY).catch(() => null);
      if (cached) {
        setAllWords(Array.isArray(cached) ? cached : []);
        setError('');
      } else {
        setError(err?.message || 'Could not load vocabulary.');
        setAllWords([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWords();
    }, [loadWords])
  );

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
  };

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
      const updated = prev.map((w) =>
        w.lemmaKey === lemmaKey
          ? { ...w, status: newStatus, updatedAt: new Date().toISOString() }
          : w
      );
      saveCache(CACHE_LIBRARY, updated).catch(() => {});
      return updated;
    });

    setUpdatingLemmaKey(null);
    setSelectedWord(null);
  }, [selectedWord]);

  const filteredWords = useMemo(() => {
    if (activeFilter === 'ALL') {
      return allWords;
    }
    return allWords.filter((word) => word.status === activeFilter);
  }, [allWords, activeFilter]);

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
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.UNKNOWN;
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
          {activeFilter === 'ALL'
            ? `${allWords.length} words tracked`
            : `${filteredWords.length} of ${allWords.length} words`}
        </Text>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {STATUSES.map(renderFilterChip)}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
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
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="book-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No words yet</Text>
              <Text style={styles.emptySubtitle}>
                Start reviewing flashcards to build your vocabulary list.
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
