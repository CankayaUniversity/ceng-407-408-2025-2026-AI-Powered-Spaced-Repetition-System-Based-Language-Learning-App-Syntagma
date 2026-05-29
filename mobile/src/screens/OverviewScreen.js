import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useNetInfo } from '@react-native-community/netinfo';
import { fetchReviewStats } from '../shared/api';
import { getCache, saveCache } from '../shared/storage';
import { flushQueues, getReviewDeltaToday } from '../shared/offline';
import { useTheme } from '../shared/theme';

const TABS = ['WEEK', 'MONTH', 'YEARLY'];
const cacheStatsKey = (period) => `syntagma.cache.reviewstats.${period}`;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const todayStr = () => {
  return formatLocalDateKey(new Date());
};

function formatLocalDateKey(date) {
  const today = new Date();
  const source = date || today;
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, '0');
  const day = String(source.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateStrToDayNumber(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY);
}

function todayDayNumber() {
  const today = new Date();
  return Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / MS_PER_DAY);
}

function computeStreaksFromReviews(reviewsByDay) {
  const studyDays = new Set();
  (reviewsByDay ?? []).forEach((entry) => {
    if ((entry?.count ?? 0) <= 0) {
      return;
    }
    const dayNumber = dateStrToDayNumber(entry.date);
    if (dayNumber != null) {
      studyDays.add(dayNumber);
    }
  });

  if (!studyDays.size) {
    return { current: 0, longest: 0 };
  }

  const today = todayDayNumber();
  let current = 0;
  let cursor = studyDays.has(today) ? today : studyDays.has(today - 1) ? today - 1 : null;
  while (cursor != null && studyDays.has(cursor)) {
    current += 1;
    cursor -= 1;
  }

  let longest = 0;
  let run = 0;
  let previous = null;
  Array.from(studyDays).sort((a, b) => a - b).forEach((day) => {
    run = previous == null || day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  });

  return { current, longest };
}

function normalizeStats(rawStats) {
  if (!rawStats) {
    return rawStats;
  }

  const derivedStreaks = computeStreaksFromReviews(rawStats.reviewsByDay);
  return {
    ...rawStats,
    streakCount: rawStats.streakCount ?? derivedStreaks.current,
    longestStreakCount: rawStats.longestStreakCount ?? derivedStreaks.longest,
  };
}

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

function getApiPeriod(tab) {
  return tab === 'YEARLY' ? 'year' : tab.toLowerCase();
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getReviewIntensityColor(count, maxCount, isDark) {
  if (count <= 0) {
    return isDark ? '#3A3631' : '#D7D0C6';
  }

  const ratio = Math.max(0.18, Math.min(1, count / Math.max(maxCount, 1)));
  const start = isDark ? [94, 65, 43] : [232, 207, 181];
  const end = isDark ? [225, 164, 108] : [107, 66, 38];
  const channel = (index) => Math.round(start[index] + (end[index] - start[index]) * ratio);

  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function buildEmptyStats() {
  return {
    totalReviews: 0,
    streakCount: 0,
    longestStreakCount: 0,
    weeklyCount: 0,
    monthlyCount: 0,
    yearlyCount: 0,
    reviewsByDay: [],
  };
}

function applyDeltaToStats(rawStats, delta) {
  if (!rawStats || delta <= 0) {
    return rawStats;
  }

  const today = todayStr();
  const reviewsByDay = Array.isArray(rawStats.reviewsByDay) ? rawStats.reviewsByDay.slice() : [];
  const index = reviewsByDay.findIndex((d) => d?.date === today);
  if (index >= 0) {
    reviewsByDay[index] = { ...reviewsByDay[index], count: (reviewsByDay[index].count ?? 0) + delta };
  } else {
    reviewsByDay.push({ date: today, count: delta });
  }

  return {
    ...rawStats,
    totalReviews: (rawStats.totalReviews ?? 0) + delta,
    weeklyCount: (rawStats.weeklyCount ?? 0) + delta,
    monthlyCount: (rawStats.monthlyCount ?? 0) + delta,
    yearlyCount: (rawStats.yearlyCount ?? 0) + delta,
    reviewsByDay,
  };
}

export default function OverviewScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState('WEEK');
  const [selectedBarIndex, setSelectedBarIndex] = useState(null);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null);
  const [selectedDayDate, setSelectedDayDate] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartHeight, setChartHeight] = useState(150);
  const [yearlyChartHeight, setYearlyChartHeight] = useState(150);
  const currentYear = new Date().getFullYear();
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const loadStats = useCallback(async (period) => {
    try {
      setLoading(true);
      setError('');
      if (!isOffline) {
        flushQueues().catch(() => {});
      }

      if (isOffline) {
        let rawStats = await getCache(cacheStatsKey(period)).catch(() => null);
        if (!rawStats) {
          rawStats = buildEmptyStats();
        }
        const delta = await getReviewDeltaToday().catch(() => 0);
        const mergedStats = applyDeltaToStats(rawStats, delta);
        setStats(normalizeStats(mergedStats));
        return;
      }
      const rawStats = await fetchReviewStats(getApiPeriod(period));
      saveCache(cacheStatsKey(period), rawStats).catch(() => {});
      setStats(normalizeStats(rawStats));
    } catch (err) {
      let rawStats = await getCache(cacheStatsKey(period)).catch(() => null);
      if (rawStats) {
        const delta = await getReviewDeltaToday().catch(() => 0);
        const mergedStats = applyDeltaToStats(rawStats, delta);
        setStats(normalizeStats(mergedStats));
        setError('');
      } else {
        setError(err?.message || 'Stats could not be loaded.');
        setStats(null);
      }
    } finally {
      setLoading(false);
    }
  }, [isOffline]);

  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      loadStats(activeTab);
    }
  }, [isFocused, activeTab, loadStats]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedBarIndex(null);
    setSelectedMonthIndex(null);
    setSelectedDayDate(null);
  };

  const reviewCountsByDate = useMemo(() => {
    const countMap = {};
    (stats?.reviewsByDay ?? []).forEach((entry) => {
      if (entry?.date) {
        countMap[entry.date] = entry.count || 0;
      }
    });
    return countMap;
  }, [stats]);

  const dailyCounts = useMemo(() => {
    if (activeTab === 'MONTH') {
      return (stats?.reviewsByDay ?? [])
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .map((entry) => {
          const d = entry.date ? new Date(entry.date + 'T00:00:00') : null;
          return {
            date: entry.date,
            label: d ? `${d.getDate()}/${d.getMonth() + 1}` : '',
            count: entry.count || 0,
          };
        });
    }

    if (activeTab === 'YEARLY') {
      return [];
    }

    // Show the last 7 days with today at the right edge, filling 0 for missing days.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const dateStr = formatLocalDateKey(d);
      return {
        date: dateStr,
        label: getDayLabel(dateStr),
        count: reviewCountsByDate[dateStr] || 0,
      };
    });
  }, [stats, activeTab, reviewCountsByDate]);

  const yearlyMonths = useMemo(() => {
    if (activeTab !== 'YEARLY') {
      return [];
    }

    return MONTH_NAMES.map((label, index) => {
      const monthPrefix = `${currentYear}-${String(index + 1).padStart(2, '0')}-`;
      const total = Object.entries(reviewCountsByDate).reduce((sum, [date, count]) => {
        return date.startsWith(monthPrefix) ? sum + count : sum;
      }, 0);

      return { index, label, shortLabel: label.slice(0, 3).toUpperCase(), total };
    });
  }, [activeTab, currentYear, reviewCountsByDate]);

  const selectedYearlyMonth = selectedMonthIndex == null ? null : yearlyMonths[selectedMonthIndex];

  const selectedMonthDays = useMemo(() => {
    if (activeTab !== 'YEARLY' || selectedMonthIndex == null) {
      return [];
    }

    const daysInMonth = getDaysInMonth(currentYear, selectedMonthIndex);
    const month = String(selectedMonthIndex + 1).padStart(2, '0');

    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = `${currentYear}-${month}-${String(day).padStart(2, '0')}`;
      return {
        date,
        day,
        count: reviewCountsByDate[date] || 0,
      };
    });
  }, [activeTab, currentYear, reviewCountsByDate, selectedMonthIndex]);

  const selectedMonthMaxCount = useMemo(() => {
    if (!selectedMonthDays.length) {
      return 1;
    }
    const m = Math.max(...selectedMonthDays.map((d) => d.count));
    return m > 0 ? m : 1;
  }, [selectedMonthDays]);

  const selectedMonthDay = useMemo(() => {
    if (!selectedDayDate) {
      return null;
    }
    return selectedMonthDays.find((day) => day.date === selectedDayDate) || null;
  }, [selectedDayDate, selectedMonthDays]);

  const yearlyMaxCount = useMemo(() => {
    if (!yearlyMonths.length) {
      return 1;
    }
    const m = Math.max(...yearlyMonths.map((month) => month.total));
    return m > 0 ? m : 1;
  }, [yearlyMonths]);

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
    if (activeTab === 'YEARLY') {
      const yearlyTotal = yearlyMonths.reduce((sum, month) => sum + month.total, 0);
      return formatNumber(stats.yearlyCount ?? yearlyTotal);
    }
    return formatNumber(stats.monthlyCount ?? 0);
  }, [activeTab, stats, yearlyMonths]);

  const selectedBarText = useMemo(() => {
    if (activeTab === 'YEARLY') {
      if (!selectedYearlyMonth) {
        return 'Tap a month to see daily details';
      }
      if (selectedMonthDay) {
        return `${selectedYearlyMonth.label} ${selectedMonthDay.day}: ${selectedMonthDay.count} reviews`;
      }
      return `${selectedYearlyMonth.label}: ${selectedYearlyMonth.total} reviews`;
    }

    if (selectedBarIndex === null || !dailyCounts[selectedBarIndex]) {
      return 'Tap a bar to see details';
    }
    const item = dailyCounts[selectedBarIndex];
    return `${item.label}: ${item.count} reviews`;
  }, [activeTab, dailyCounts, selectedBarIndex, selectedMonthDay, selectedYearlyMonth]);

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
          <View style={styles.streakRow}>
            <View style={styles.streakMetric}>
              <Text style={styles.streakValue}>
                {stats?.streakCount != null ? `${stats.streakCount} days` : '-'}
              </Text>
              <Text style={styles.streakLabel}>Current</Text>
            </View>
            <View style={styles.streakMetric}>
              <Text style={styles.streakValue}>
                {stats?.longestStreakCount != null ? `${stats.longestStreakCount} days` : '-'}
              </Text>
              <Text style={styles.streakLabel}>Longest</Text>
            </View>
          </View>
        </View>

        <View style={styles.weeklyHeader}>
          <Text style={styles.weeklyTitle}>
            {activeTab === 'WEEK'
              ? 'Weekly Progress'
              : activeTab === 'MONTH'
                ? 'Monthly Progress'
                : 'Yearly Progress'}
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
          ) : activeTab === 'YEARLY' ? (
            <ScrollView
              style={styles.yearlyScroll}
              contentContainerStyle={styles.yearlyContent}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={styles.yearlyChartArea}
                onLayout={(e) => setYearlyChartHeight(e.nativeEvent.layout.height)}
              >
                {yearlyMonths.map((month) => {
                  const isSelected = selectedMonthIndex === month.index;
                  const barAreaHeight = Math.max(0, yearlyChartHeight - 30);
                  const heightPx = Math.max(4, Math.round((month.total / yearlyMaxCount) * barAreaHeight));
                  return (
                    <Pressable
                      key={month.label}
                      style={styles.yearlyBarColumn}
                      onPress={() => {
                        setSelectedMonthIndex(month.index);
                        setSelectedDayDate(null);
                      }}
                    >
                      <LinearGradient
                        colors={
                          isSelected
                            ? [colors.accentStrong, colors.accent]
                            : [colors.accentSoft, colors.accent]
                        }
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={[styles.yearlyBar, { height: heightPx }, isSelected && styles.yearlyBarSelected]}
                      />
                      <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                        {month.shortLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {selectedYearlyMonth ? (
                <View style={styles.dayGridWrap}>
                  <Text style={styles.monthDetailTitle}>
                    {`${selectedYearlyMonth.label} ${currentYear}`}
                  </Text>
                  <View style={styles.dayGrid}>
                    {selectedMonthDays.map((day) => {
                      const isSelected = selectedDayDate === day.date;
                      const hasReviews = day.count > 0;
                      const intensity = getReviewIntensityColor(day.count, selectedMonthMaxCount, isDark);
                      const textColor = isSelected && hasReviews && day.count / selectedMonthMaxCount > 0.55
                        ? '#FFFDF9'
                        : colors.textPrimary;
                      return (
                        <Pressable
                          key={day.date}
                          onPress={() => setSelectedDayDate(day.date)}
                          style={[
                            styles.dayCell,
                            { backgroundColor: intensity },
                            isSelected && styles.dayCellSelected,
                          ]}
                        >
                          {isSelected ? (
                            <>
                              <Text
                                style={[
                                  styles.dayNumber,
                                  { color: hasReviews ? textColor : colors.textSecondary },
                                ]}
                              >
                                {day.day}
                              </Text>
                              <Text
                                style={[
                                  styles.dayCount,
                                  { color: hasReviews ? textColor : colors.textSecondary },
                                ]}
                              >
                                {day.count}
                              </Text>
                            </>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          ) : dailyCounts.length > 0 ? (
            <View
              style={styles.chartArea}
              onLayout={(e) => setChartHeight(e.nativeEvent.layout.height)}
            >
              {dailyCounts.map((item, index) => {
                const isSelected = selectedBarIndex === index;
                const barAreaHeight = Math.max(0, chartHeight - 30);
                const heightPx = Math.max(4, Math.round((item.count / maxCount) * barAreaHeight));
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
                      style={[styles.bar, { height: heightPx }, isSelected && styles.barSelected]}
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

          <View style={styles.chartBottom}>
            <View style={styles.divider} />
            <Text style={styles.mutedCaps}>{selectedBarText}</Text>
            <Text style={styles.totalWords}>{`${totalWords} Reviews`}</Text>
          </View>
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
  streakRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 16,
  },
  streakMetric: {
    flex: 1,
    alignItems: 'center',
  },
  streakLabel: {
    marginTop: 2,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
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
  chartBottom: {},
  chartArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    overflow: 'hidden',
    paddingHorizontal: 2,
  },
  yearlyScroll: {
    flex: 1,
  },
  yearlyContent: {
    paddingBottom: 4,
  },
  yearlyChartArea: {
    height: 170,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    overflow: 'hidden',
    paddingHorizontal: 2,
  },
  yearlyBarColumn: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 28,
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
  },
  yearlyBar: {
    width: 14,
    minHeight: 18,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  yearlyBarSelected: {
    width: 16,
    minHeight: 22,
  },
  dayGridWrap: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: colors.mutedSurface,
    padding: 12,
  },
  monthDetailTitle: {
    marginBottom: 10,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayCell: {
    width: '12.5%',
    minHeight: 42,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    borderWidth: 2,
    borderColor: colors.accentStrong,
  },
  dayNumber: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 12,
  },
  dayCount: {
    marginTop: 2,
    fontFamily: 'DMSans_400Regular',
    fontSize: 8,
    textAlign: 'center',
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 42,
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
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
