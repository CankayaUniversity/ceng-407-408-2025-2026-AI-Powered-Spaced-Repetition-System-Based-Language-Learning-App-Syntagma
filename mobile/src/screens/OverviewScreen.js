import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { fetchReviewStats } from '../shared/api';
import { getCache, saveCache } from '../shared/storage';
import { flushQueues, getReviewDeltaToday } from '../shared/offline';
import { useTheme } from '../shared/theme';

const TABS = ['WEEK', 'MONTH'];
const cacheStatsKey = (period) => `syntagma.cache.reviewstats.${period}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

const WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function getDayLabel(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    // JS getDay: 0=Sun,1=Mon…6=Sat → map to WEEK_DAYS
    return WEEK_DAYS[day === 0 ? 6 : day - 1];
  } catch {
    return dateStr;
  }
}

export default function OverviewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState('WEEK');
  const [selectedBarIndex, setSelectedBarIndex] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadStats = useCallback(async (period) => {
    flushQueues().catch(() => {});
    try {
      setLoading(true);
      setError('');
      const rawStats = await fetchReviewStats(period.toLowerCase());
      saveCache(cacheStatsKey(period), rawStats).catch(() => {});
      setStats(rawStats);
    } catch (err) {
      let rawStats = await getCache(cacheStatsKey(period)).catch(() => null);
      if (rawStats) {
        const delta = await getReviewDeltaToday().catch(() => 0);
        if (delta > 0) {
          const today = todayStr();
          rawStats = {
            ...rawStats,
            totalReviews: (rawStats.totalReviews ?? 0) + delta,
            reviewsByDay: Array.isArray(rawStats.reviewsByDay)
              ? rawStats.reviewsByDay.map((d) =>
                  d.date === today ? { ...d, count: (d.count ?? 0) + delta } : d
                )
              : rawStats.reviewsByDay,
          };
        }
        setStats(rawStats);
        setError('');
      } else {
        setError(err?.message || 'Stats could not be loaded.');
        setStats(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats(activeTab);
    }, [activeTab, loadStats])
  );

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedBarIndex(null);
  };

  const dailyCounts = useMemo(() => {
    if (activeTab !== 'WEEK') {
      return (stats?.reviewsByDay ?? []).map((entry) => ({
        date: entry.date,
        label: getDayLabel(entry.date),
        count: entry.count || 0,
      }));
    }

    // Always show Mon–Sun of the current week, filling 0 for missing days
    const today = new Date();
    const dow = today.getDay(); // 0=Sun, 1=Mon, …
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);

    const countMap = {};
    (stats?.reviewsByDay ?? []).forEach((entry) => {
      countMap[entry.date] = entry.count || 0;
    });

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      return {
        date: dateStr,
        label: WEEK_DAYS[i],
        count: countMap[dateStr] || 0,
      };
    });
  }, [stats, activeTab]);

  const maxCount = useMemo(() => {
    if (!dailyCounts.length) {
      return 1;
    }
    const m = Math.max(...dailyCounts.map((d) => d.count));
    return m > 0 ? m : 1;
  }, [dailyCounts]);

  const totalWords = useMemo(() => {
    if (!stats) {
      return '-';
    }
    if (activeTab === 'WEEK') {
      return formatNumber(stats.weeklyCount ?? 0);
    }
    return formatNumber(stats.monthlyCount ?? 0);
  }, [activeTab, stats]);

  const selectedBarText = useMemo(() => {
    if (selectedBarIndex === null || !dailyCounts[selectedBarIndex]) {
      return 'Tap a bar to see details';
    }
    const item = dailyCounts[selectedBarIndex];
    return `${item.label}: ${item.count} reviews`;
  }, [dailyCounts, selectedBarIndex]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.overviewLabel}>OVERVIEW</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.mutedCaps}>TOTAL REVIEWS</Text>
          {loading && !stats ? (
            <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 12, marginBottom: 12 }} />
          ) : (
            <>
              <Text style={styles.bigNumber}>{stats ? formatNumber(stats.totalReviews ?? 0) : '-'}</Text>
              <Text style={styles.wordsReviewed}>words reviewed</Text>
            </>
          )}

          <View style={styles.divider} />

          <Text style={styles.mutedCaps}>STREAK</Text>
          <Text style={styles.streakValue}>
            {stats?.streakCount != null ? `🔥 ${stats.streakCount} days` : '-'}
          </Text>
        </View>

        <View style={styles.weeklyHeader}>
          <Text style={styles.weeklyTitle}>
            {activeTab === 'WEEK' ? 'Weekly Progress' : 'Monthly Progress'}
          </Text>
        </View>

        <View style={styles.segmentedControl}>
          {TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <Pressable
                key={tab}
                onPress={() => handleTabChange(tab)}
                style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>{tab}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.chartCard}>
          {error ? (
            <View style={styles.emptyChartWrap}>
              <Text style={styles.emptyChartText}>{error}</Text>
            </View>
          ) : loading ? (
            <View style={styles.emptyChartWrap}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : dailyCounts.length > 0 ? (
            <View style={styles.chartArea}>
              {dailyCounts.map((item, index) => {
                const isSelected = selectedBarIndex === index;
                const heightPct = Math.max(5, (item.count / maxCount) * 100);
                return (
                  <Pressable
                    key={item.date}
                    style={styles.barColumn}
                    onPress={() => setSelectedBarIndex(index)}
                  >
                    <LinearGradient
                      colors={
                        isSelected
                          ? [colors.accentStrong, colors.accent]
                          : [colors.accentSoft, colors.accent]
                      }
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={[styles.bar, { height: `${heightPct}%` }, isSelected && styles.barSelected]}
                    />
                    <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyChartWrap}>
              <Text style={styles.emptyChartText}>No review data yet</Text>
            </View>
          )}

          <View style={styles.divider} />

          <Text style={styles.mutedCaps}>{selectedBarText}</Text>
          <Text style={styles.totalWords}>{`${totalWords} Reviews`}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function formatNumber(n) {
  if (n == null) {
    return '-';
  }
  if (n >= 1000) {
    return n.toLocaleString('en-US');
  }
  return String(n);
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerRow: {
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  overviewLabel: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 30,
    letterSpacing: 1.4,
    color: colors.accent,
    marginTop: 6,
  },
  summaryCard: {
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: colors.card,
    paddingHorizontal: 22,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  mutedCaps: {
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'DMSans_400Regular',
  },
  bigNumber: {
    marginTop: 8,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 68,
    lineHeight: 72,
    color: colors.accent,
    textAlign: 'center',
  },
  wordsReviewed: {
    marginTop: 2,
    fontFamily: 'DMSans_400Regular',
    fontSize: 20,
    color: colors.textPrimary,
  },
  divider: {
    alignSelf: 'stretch',
    marginVertical: 12,
    height: 1,
    backgroundColor: colors.border,
  },
  streakValue: {
    marginTop: 6,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 26,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  weeklyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  weeklyTitle: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 22,
    color: colors.textPrimary,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: colors.mutedSurface,
    padding: 4,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.accentStrong,
  },
  segmentText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontFamily: 'DMSans_600SemiBold',
  },
  chartCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 20,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  chartArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 150,
    paddingHorizontal: 2,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 42,
  },
  bar: {
    width: 22,
    minHeight: 24,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
  },
  barSelected: {
    width: 24,
    minHeight: 28,
  },
  dayLabel: {
    marginTop: 8,
    fontFamily: 'DMSans_400Regular',
    fontSize: 10,
    letterSpacing: 0.7,
    color: colors.textSecondary,
  },
  dayLabelSelected: {
    color: colors.textPrimary,
    fontFamily: 'DMSans_600SemiBold',
  },
  emptyChartWrap: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChartText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalWords: {
    marginTop: 6,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 30,
    lineHeight: 34,
    color: colors.textPrimary,
  },
});
