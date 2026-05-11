import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEY = 'syntagma.auth';
const STUDY_PREF_KEY = 'syntagma.study.pref';
const CARRYOVER_KEY = 'syntagma.study.carryover';
const THEME_KEY = 'syntagma.theme';

export async function saveAuth(auth) {
  if (!auth) {
    return;
  }

  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export async function getAuth() {
  const stored = await AsyncStorage.getItem(AUTH_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch (err) {
    return null;
  }
}

export async function clearAuth() {
  await AsyncStorage.removeItem(AUTH_KEY);
}

export async function saveLastStudyCount(count) {
  if (!Number.isFinite(count)) {
    return;
  }

  await AsyncStorage.setItem(STUDY_PREF_KEY, JSON.stringify({ count }));
}

export async function getLastStudyCount() {
  const stored = await AsyncStorage.getItem(STUDY_PREF_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return Number.isFinite(parsed?.count) ? parsed.count : null;
  } catch (err) {
    return null;
  }
}

export async function saveCarryover(carryover) {
  if (!carryover) {
    return;
  }

  await AsyncStorage.setItem(CARRYOVER_KEY, JSON.stringify(carryover));
}

export async function getCarryover() {
  const stored = await AsyncStorage.getItem(CARRYOVER_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch (err) {
    return null;
  }
}

export async function clearCarryover() {
  await AsyncStorage.removeItem(CARRYOVER_KEY);
}

export async function saveThemePreference(isDark) {
  await AsyncStorage.setItem(THEME_KEY, JSON.stringify({ isDark: !!isDark }));
}

export async function getThemePreference() {
  const stored = await AsyncStorage.getItem(THEME_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return typeof parsed?.isDark === 'boolean' ? parsed.isDark : null;
  } catch (err) {
    return null;
  }
}

const NOTIFICATIONS_KEY = 'syntagma.notifications';
const REMINDER_HOUR_KEY = 'syntagma.reminder.hour';

export async function saveNotificationPreference(enabled) {
  await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify({ enabled: !!enabled }));
}

export async function getNotificationPreference() {
  const stored = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return typeof parsed?.enabled === 'boolean' ? parsed.enabled : null;
  } catch (err) {
    return null;
  }
}

export async function saveReminderHour(hour) {
  await AsyncStorage.setItem(REMINDER_HOUR_KEY, JSON.stringify({ hour }));
}

export async function getReminderHour() {
  const stored = await AsyncStorage.getItem(REMINDER_HOUR_KEY);
  if (!stored) {
    return 9; // default 09:00
  }

  try {
    const parsed = JSON.parse(stored);
    return Number.isFinite(parsed?.hour) ? parsed.hour : 9;
  } catch (err) {
    return 9;
  }
}

const BADGE_KEY = 'syntagma.badge';

export async function saveBadgeState({ totalReviews }) {
  if (!Number.isFinite(totalReviews)) {
    return;
  }

  await AsyncStorage.setItem(BADGE_KEY, JSON.stringify({ totalReviews }));
}

export async function getBadgeState() {
  const stored = await AsyncStorage.getItem(BADGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return Number.isFinite(parsed?.totalReviews) ? parsed : null;
  } catch (err) {
    return null;
  }
}
