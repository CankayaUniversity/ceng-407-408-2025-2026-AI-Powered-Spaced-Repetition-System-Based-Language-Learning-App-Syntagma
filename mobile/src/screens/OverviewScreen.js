import React, { useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TABS = ['WEEK', 'MONTH', 'YEAR'];

const CHART_DATA = {
  WEEK: [50, 70, 65, 85, 60, 40, 90],
  MONTH: [],
  YEAR: [],
};

const WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const TOTAL_BY_TAB = {
  WEEK: '1,248 Words',
  MONTH: '-',
  YEAR: '-',
};

export default function OverviewScreen() {
  const [activeTab, setActiveTab] = useState('WEEK');
  const [selectedDayIndex, setSelectedDayIndex] = useState(null);
  const bars = useMemo(() => CHART_DATA[activeTab], [activeTab]);

  const selectedDayText =
    selectedDayIndex === null
      ? 'Tap a day to see words spoken'
      : `${WEEK_DAYS[selectedDayIndex]}: ${CHART_DATA.WEEK[selectedDayIndex]} words`;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.brandTitle}>Syntagma</Text>
          <Text style={styles.overviewLabel}>OVERVIEW</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.mutedCaps}>SESSION SUMMARY</Text>
          <Text style={styles.bigNumber}>142</Text>
          <Text style={styles.wordsReviewed}>words reviewed</Text>

          <View style={styles.divider} />

          <Text style={styles.mutedCaps}>TIME</Text>
          <Text style={styles.timeValue}>12m 04s</Text>
        </View>

        <View style={styles.weeklyHeader}>
          <Text style={styles.weeklyTitle}>Weekly Progress</Text>
          <Pressable>
            <Text style={styles.insightsLink}>View Insights</Text>
          </Pressable>
        </View>

        <View style={styles.segmentedControl}>
          {TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <Pressable
                key={tab}
                onPress={() => {
                  setActiveTab(tab);
                  if (tab !== 'WEEK') {
                    setSelectedDayIndex(null);
                  }
                }}
                style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>{tab}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartArea}>
            {activeTab === 'WEEK' ? (
              bars.map((value, index) => {
                const isSelected = selectedDayIndex === index;
                return (
                  <Pressable
                    key={WEEK_DAYS[index]}
                    style={styles.barColumn}
                    onPress={() => setSelectedDayIndex(index)}
                  >
                    <LinearGradient
                      colors={isSelected ? ['#DEB48D', '#B07142'] : ['#C8956C', '#A0673A']}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={[styles.bar, { height: `${value}%` }, isSelected && styles.barSelected]}
                    />
                    <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                      {WEEK_DAYS[index]}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyChartWrap}>
                <Text style={styles.emptyChartText}>No data yet</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          <Text style={styles.mutedCaps}>
            {activeTab === 'WEEK' ? selectedDayText : 'Data will be loaded from backend'}
          </Text>
          <Text style={styles.totalWords}>{TOTAL_BY_TAB[activeTab]}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F0EA',
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
    color: '#5C3D1E',
    marginTop: 6,
  },
  brandTitle: {
    position: 'absolute',
    left: 0,
    top: -4,
    fontSize: 18,
    color: '#6F543A',
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  summaryCard: {
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#EDE8E0',
    paddingHorizontal: 22,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: '#5C3D1E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  mutedCaps: {
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 11,
    color: '#8E7A66',
    fontFamily: 'DMSans_400Regular',
  },
  bigNumber: {
    marginTop: 8,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 68,
    lineHeight: 72,
    color: '#5C3D1E',
    textAlign: 'center',
  },
  wordsReviewed: {
    marginTop: 2,
    fontFamily: 'DMSans_400Regular',
    fontSize: 20,
    color: '#5C3D1E',
  },
  divider: {
    alignSelf: 'stretch',
    marginVertical: 12,
    height: 1,
    backgroundColor: '#D7CCC0',
  },
  timeValue: {
    marginTop: 6,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 26,
    color: '#5C3D1E',
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
    color: '#5C3D1E',
  },
  insightsLink: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: '#5C3D1E',
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: '#EAE1D6',
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
    backgroundColor: '#F2A96E',
  },
  segmentText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    letterSpacing: 1,
    color: '#6B5844',
  },
  segmentTextActive: {
    color: '#5C3D1E',
    fontFamily: 'DMSans_600SemiBold',
  },
  chartCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#5C3D1E',
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
    width: 34,
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
    color: '#7F6E5B',
  },
  dayLabelSelected: {
    color: '#5C3D1E',
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
    color: '#9A8772',
  },
  totalWords: {
    marginTop: 6,
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 30,
    lineHeight: 34,
    color: '#5C3D1E',
  },
});
