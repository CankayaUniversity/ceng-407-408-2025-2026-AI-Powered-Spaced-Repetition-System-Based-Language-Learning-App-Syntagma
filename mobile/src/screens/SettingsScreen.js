import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import {
  fetchAllFlashcards,
  fetchAllWordKnowledge,
  fetchCurrentUser,
  fetchReviewStats,
} from '../shared/api';
import {
  getAuth,
  getBadgeState,
  getCache,
  getLastStudyCount,
  getNotificationPreference,
  getReminderHour,
  clearAuth,
  saveBadgeState,
  saveLastStudyCount,
  saveNotificationPreference,
  saveReminderHour,
  saveCache,
} from '../shared/storage';
import { computeCefrState, getCefrMedal } from '../shared/badges';
import { computeKnownWordsStats } from '../shared/known-words';
import { useTheme } from '../shared/theme';

const CACHE_ALL_FLASHCARDS = 'syntagma.cache.flashcards.all.v1';
const CACHE_WORD_KNOWLEDGE = 'syntagma.cache.wordknowledge.all.v1';
const DEFAULT_DAILY_COUNT = 10;

// ── Small reusable components ──────────────────────────────────────

function SectionLabel({ children, styles }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function ReadonlyField({ icon, label, value, styles, colors }) {
  return (
    <View style={styles.readonlyField}>
      <View style={styles.readonlyMeta}>
        <Ionicons name={icon} size={16} color={colors.textSecondary} />
        <Text style={styles.readonlyLabel}>{label}</Text>
      </View>
      <Text style={styles.readonlyValue}>{value}</Text>
    </View>
  );
}

function ToggleRow({ icon, label, value, onChange, colors, styles }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.iconBadge}>
        <Ionicons name={icon} size={16} color={colors.accent} />
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accentSoft }}
        thumbColor={value ? colors.accent : colors.surface}
      />
    </View>
  );
}

function ActionRow({ icon, label, subtitle, onPress, colors, styles }) {
  return (
    <Pressable style={styles.toggleRow} onPress={onPress}>
      <View style={styles.iconBadge}>
        <Ionicons name={icon} size={16} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

// ── Notification helpers ───────────────────────────────────────────

const REMINDER_MESSAGES = [
  { title: '🔥 Don\'t break your streak!', body: 'You have cards waiting — keep your streak alive!' },
  { title: '📚 Time to study!', body: 'A few minutes of review will make a big difference.' },
  { title: '🧠 Your brain will thank you', body: 'Quick review session to reinforce your vocabulary?' },
  { title: '💪 Stay consistent!', body: 'Consistency beats intensity. Review your cards now!' },
  { title: '🎯 Daily goal reminder', body: 'Don\'t forget your vocabulary review today!' },
];

function getRandomReminder() {
  return REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
}

async function requestNotificationPermission() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function scheduleSmartReminder(hour) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const reminder = getRandomReminder();

  // Main daily study reminder
  await Notifications.scheduleNotificationAsync({
    content: {
      title: reminder.title,
      body: reminder.body,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hour,
      minute: 0,
    },
  });

  // Streak-break warning: 2 hours after main reminder
  const streakHour = (hour + 2) % 24;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ Streak at risk!',
      body: 'You haven\'t studied today yet. Don\'t let your streak break!',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: streakHour,
      minute: 0,
    },
  });
}

async function cancelAllReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ── Available hours for the picker ─────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h) {
  const hh = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}:00 ${ampm}`;
}

// ── Main component ─────────────────────────────────────────────────

export default function SettingsScreen({ navigation }) {
  const { colors, isDark, setIsDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isDarkMode, setIsDarkMode] = useState(isDark);
  const [isNotificationsOn, setIsNotificationsOn] = useState(false);
  const [reminderHour, setReminderHour] = useState(20); // default 20:00 (8 PM)
  const [dailyCount, setDailyCount] = useState(DEFAULT_DAILY_COUNT);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [dailyPickerVisible, setDailyPickerVisible] = useState(false);
  const [streakCount, setStreakCount] = useState(null);
  const [badgeState, setBadgeState] = useState(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  useEffect(() => {
    setIsDarkMode(isDark);
  }, [isDark]);

  // Load saved preferences
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const savedNotif = await getNotificationPreference();
      const savedHour = await getReminderHour();
      const savedDailyCount = await getLastStudyCount();

      if (!isMounted) return;

      if (typeof savedNotif === 'boolean') {
        setIsNotificationsOn(savedNotif);
      }
      if (Number.isFinite(savedHour)) {
        setReminderHour(savedHour);
      }
      if (Number.isFinite(savedDailyCount) && savedDailyCount > 0) {
        setDailyCount(savedDailyCount);
      }
    };

    load();
    return () => { isMounted = false; };
  }, []);

  // Load profile + streak
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      // Show cached badge immediately while network loads
      const cached = await getBadgeState();
      if (isMounted && cached) {
        setBadgeState(computeCefrState(cached.knownWords));
      }

      const auth = await getAuth();
      if (isMounted && auth?.email) {
        setProfileEmail(auth.email);
      }

      try {
        const user = await fetchCurrentUser();
        if (!isMounted) return;

        if (user?.fullName) {
          setProfileName(user.fullName);
        } else if (user?.email) {
          setProfileEmail(user.email);
          setProfileName(deriveNameFromEmail(user.email));
        } else if (auth?.email) {
          setProfileName(deriveNameFromEmail(auth.email));
        }
      } catch (err) {
        if (isMounted && auth?.email) {
          setProfileName(deriveNameFromEmail(auth.email));
        }
      }

      // Fetch streak + badge
      try {
        const stats = await fetchReviewStats('week');
        if (isMounted && stats?.streakCount != null) {
          setStreakCount(stats.streakCount);
        }
      } catch (err) {
        // Streak and badge are optional, don't fail
      }

      try {
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
      }
    };

    loadProfile();
    return () => { isMounted = false; };
  }, []);

  const handleSignOut = async () => {
    try {
      await clearAuth();
      await cancelAllReminders();
      await saveNotificationPreference(false);
      setIsNotificationsOn(false);
    } catch (err) {
      // Best-effort logout; navigation still proceeds.
    }

    navigation.getParent()?.replace('Login');
  };

  const handleToggleDarkMode = (value) => {
    setIsDarkMode(value);
    setIsDark(value);
  };

  const handleToggleNotifications = useCallback(async (value) => {
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your device settings to receive study reminders.',
          [{ text: 'OK' }]
        );
        return;
      }

      await scheduleSmartReminder(reminderHour);
      setIsNotificationsOn(true);
      await saveNotificationPreference(true);
    } else {
      await cancelAllReminders();
      setIsNotificationsOn(false);
      await saveNotificationPreference(false);
    }
  }, [reminderHour]);

  const handleSelectHour = useCallback(async (hour) => {
    setReminderHour(hour);
    setTimePickerVisible(false);
    await saveReminderHour(hour);

    if (isNotificationsOn) {
      await scheduleSmartReminder(hour);
    }
  }, [isNotificationsOn]);

  const handleSelectDailyCount = useCallback(async (count) => {
    setDailyCount(count);
    setDailyPickerVisible(false);
    await saveLastStudyCount(count);
  }, []);

  const handleTestNotification = useCallback(async () => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert('Permission Required', 'Please enable notifications in your device settings.');
      return;
    }

    // Try to get real due count for the test message
    let dueText = 'You have cards waiting for review!';
    try {
      const { fetchDueCards } = require('../shared/api');
      const due = await fetchDueCards(100);
      if (due?.dueCount > 0) {
        dueText = `You have ${due.dueCount} cards due for review!`;
      }
    } catch (err) {
      // Use default text
    }

    const streakText = streakCount != null && streakCount > 0
      ? ` Your streak: ${streakCount} days 🔥`
      : '';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔥 Don\'t break your streak!',
        body: `${dueText}${streakText}`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
      },
    });

    Alert.alert('Sent!', 'A test notification will arrive in about 2 seconds.');
  }, [streakCount]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => {}} hitSlop={10}>
            <Ionicons name="paw-outline" size={24} color={colors.accent} />
          </Pressable>

          <Text style={styles.headerTitle}>Syntagma</Text>

          <Pressable onPress={() => {}} hitSlop={10}>
            <Ionicons name="settings-outline" size={24} color={colors.accent} />
          </Pressable>
        </View>

        {/* Streak banner */}
        {streakCount != null && streakCount > 0 && (
          <View style={styles.streakBanner}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <View>
              <Text style={styles.streakCount}>{streakCount} day streak</Text>
              <Text style={styles.streakHint}>Keep it going!</Text>
            </View>
          </View>
        )}

        <SectionLabel styles={styles}>ACCOUNT</SectionLabel>
        <View style={styles.card}>
          <ReadonlyField
            icon="person-outline"
            label="FULL NAME"
            value={profileName || 'Loading...'}
            styles={styles}
            colors={colors}
          />
          <ReadonlyField
            icon="at-outline"
            label="EMAIL ADDRESS"
            value={profileEmail || 'Loading...'}
            styles={styles}
            colors={colors}
          />

          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="arrow-forward-outline" size={16} color={colors.accent} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <SectionLabel styles={styles}>GENERAL SETTINGS</SectionLabel>
        <View style={styles.card}>
          <ActionRow
            icon="list-outline"
            label="Daily card count"
            subtitle={`${dailyCount} cards per day`}
            onPress={() => setDailyPickerVisible(true)}
            colors={colors}
            styles={styles}
          />

          <View style={styles.rowDivider} />
          <ToggleRow
            icon="notifications-outline"
            label="Study Reminders"
            value={isNotificationsOn}
            onChange={handleToggleNotifications}
            colors={colors}
            styles={styles}
          />

          {isNotificationsOn && (
            <>
              <View style={styles.rowDivider} />
              <ActionRow
                icon="time-outline"
                label="Reminder Time"
                subtitle={formatHour(reminderHour)}
                onPress={() => setTimePickerVisible(true)}
                colors={colors}
                styles={styles}
              />
              <Text style={styles.reminderHint}>
                {`Daily reminder at ${formatHour(reminderHour)}`}
                {'\n'}
                {`Streak warning at ${formatHour((reminderHour + 2) % 24)}`}
              </Text>

              <View style={styles.rowDivider} />
              <ActionRow
                icon="paper-plane-outline"
                label="Send Test Notification"
                subtitle="Verify notifications work"
                onPress={handleTestNotification}
                colors={colors}
                styles={styles}
              />
            </>
          )}

          <View style={styles.rowDivider} />
          <ActionRow
            icon="trophy-outline"
            label="Achievements"
            subtitle={achievementsOpen ? 'Hide badges' : 'View badges'}
            onPress={() => setAchievementsOpen((prev) => !prev)}
            colors={colors}
            styles={styles}
          />

          {achievementsOpen && badgeState && (
            <View style={styles.achievementPanel}>
              <View style={styles.achievementHeader}>
                {badgeState.currentLevel && getCefrMedal(badgeState.currentLevel.id) ? (
                  <Image
                    source={getCefrMedal(badgeState.currentLevel.id).image}
                    style={styles.achievementMedal}
                  />
                ) : null}
                <View style={styles.achievementInfo}>
                  <Text style={styles.badgeLabelText}>
                    {badgeState.currentLevel ? `Level ${badgeState.currentLevel.label}` : 'Level A0'}
                  </Text>
                  <Text style={styles.badgeProgressText}>
                    {`${badgeState.progressPercent}% • ${badgeState.progressText}`}
                  </Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(badgeState.progress * 100)}%` }]} />
              </View>

              <View style={styles.achievementList}>
                <View style={styles.achievementRow}>
                  <Image source={getCefrMedal('A1')?.image} style={styles.achievementMini} />
                  <Text style={styles.achievementText}>A1-A2: Bronze medal</Text>
                </View>
                <View style={styles.achievementRow}>
                  <Image source={getCefrMedal('B1')?.image} style={styles.achievementMini} />
                  <Text style={styles.achievementText}>B1-B2: Silver medal</Text>
                </View>
                <View style={styles.achievementRow}>
                  <Image source={getCefrMedal('C1')?.image} style={styles.achievementMini} />
                  <Text style={styles.achievementText}>C1-C2: Gold medal</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <SectionLabel styles={styles}>APPEARANCE</SectionLabel>
        <View style={styles.card}>
          <ToggleRow
            icon="moon-outline"
            label="Dark Mode"
            value={isDarkMode}
            onChange={handleToggleDarkMode}
            colors={colors}
            styles={styles}
          />
        </View>
      </ScrollView>

      {/* Time picker modal */}
      <Modal visible={timePickerVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reminder Time</Text>
            <Text style={styles.modalSubtitle}>Choose when you want to be reminded</Text>

            <ScrollView style={styles.hourList} showsVerticalScrollIndicator={false}>
              {HOURS.map((h) => {
                const isSelected = h === reminderHour;
                return (
                  <Pressable
                    key={h}
                    style={[styles.hourItem, isSelected && styles.hourItemSelected]}
                    onPress={() => handleSelectHour(h)}
                  >
                    <Text style={[styles.hourText, isSelected && styles.hourTextSelected]}>
                      {formatHour(h)}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={colors.surface} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              style={styles.modalCancel}
              onPress={() => setTimePickerVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Daily count modal */}
      <Modal visible={dailyPickerVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Daily card count</Text>
            <Text style={styles.modalSubtitle}>How many cards per day?</Text>

            <ScrollView style={styles.hourList} showsVerticalScrollIndicator={false}>
              {[5, 10, 15, 20, 25, 30, 40, 50].map((count) => {
                const isSelected = count === dailyCount;
                return (
                  <Pressable
                    key={count}
                    style={[styles.hourItem, isSelected && styles.hourItemSelected]}
                    onPress={() => handleSelectDailyCount(count)}
                  >
                    <Text style={[styles.hourText, isSelected && styles.hourTextSelected]}>
                      {`${count} cards`}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={colors.surface} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              style={styles.modalCancel}
              onPress={() => setDailyPickerVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function deriveNameFromEmail(email) {
  if (!email) {
    return '';
  }

  const prefix = email.split('@')[0] || '';
  const words = prefix.split(/[._-]+/g).filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
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
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTitle: {
    color: colors.accent,
    fontSize: 30,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  // Streak banner
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 18,
  },
  streakEmoji: {
    fontSize: 32,
  },
  streakCount: {
    color: colors.accent,
    fontSize: 20,
    fontFamily: 'DMSans_600SemiBold',
  },
  streakHint: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
  // Section label
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 8,
  },
  card: {
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 18,
  },
  readonlyField: {
    borderRadius: 999,
    backgroundColor: colors.mutedSurface,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  readonlyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  readonlyLabel: {
    fontFamily: 'DMSans_400Regular',
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
  },
  readonlyValue: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  signOutButton: {
    marginTop: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  signOutText: {
    fontFamily: 'DMSans_600SemiBold',
    color: colors.accent,
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.mutedSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  toggleLabel: {
    flex: 1,
    fontFamily: 'DMSans_600SemiBold',
    color: colors.textPrimary,
    fontSize: 16,
  },
  actionSubtitle: {
    fontFamily: 'DMSans_400Regular',
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
  reminderHint: {
    marginTop: 4,
    marginLeft: 44,
    fontFamily: 'DMSans_400Regular',
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  // Time picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxHeight: '70%',
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
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 16,
  },
  hourList: {
    maxHeight: 300,
  },
  hourItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 4,
  },
  hourItemSelected: {
    backgroundColor: colors.accent,
  },
  hourText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: 'DMSans_600SemiBold',
  },
  hourTextSelected: {
    color: colors.surface,
  },
  modalCancel: {
    marginTop: 14,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
  badgeProgressText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 8,
  },
  achievementPanel: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  achievementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  achievementMedal: {
    width: 50,
    height: 50,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementList: {
    marginTop: 6,
    gap: 8,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  achievementMini: {
    width: 28,
    height: 28,
  },
  achievementText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.mutedSurface,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  cefrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  cefrBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.mutedSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cefrBadgeText: {
    color: colors.accent,
    fontSize: 18,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  cefrMedal: {
    width: 40,
    height: 40,
  },
  cefrInfo: {
    flex: 1,
  },
  badgeLabelText: {
    color: colors.accent,
    fontSize: 15,
    fontFamily: 'DMSans_600SemiBold',
    marginBottom: 4,
  },
});
