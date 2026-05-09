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
