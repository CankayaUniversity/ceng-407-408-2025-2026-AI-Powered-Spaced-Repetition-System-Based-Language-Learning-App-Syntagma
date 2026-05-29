import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEY = 'syntagma.auth';
const USER_SCOPE_PREFIX = 'syntagma.user';
const USER_SCOPE_INDEX_PREFIX = 'syntagma.userScopedKeys';

const STUDY_PREF_KEY = 'syntagma.study.pref';
const CARRYOVER_KEY = 'syntagma.study.carryover';
const THEME_KEY = 'syntagma.theme';
const NOTIFICATIONS_KEY = 'syntagma.notifications';
const REMINDER_HOUR_KEY = 'syntagma.reminder.hour';
const BADGE_KEY = 'syntagma.cefr.badge';
const REVIEW_DELTA_INDEX_KEY = 'syntagma.review.delta.index';

const LEGACY_SESSION_EXACT_KEYS = [
  STUDY_PREF_KEY,
  CARRYOVER_KEY,
  BADGE_KEY,
  REVIEW_DELTA_INDEX_KEY,
  'syntagma.study.days',
  'syntagma.study.longestStreak',
];

const LEGACY_SESSION_PREFIXES = [
  'syntagma.cache.',
  'syntagma.queue.',
  'syntagma.review.delta.',
  'syntagma.reviewed.today.',
];

function safeScopeId(userId) {
  if (userId == null || userId === '') {
    return 'guest';
  }
  return String(userId).replace(/[^A-Za-z0-9_-]/g, '_');
}

function scopedKey(scopeId, key) {
  return `${USER_SCOPE_PREFIX}.${scopeId}.${key}`;
}

function scopeIndexKey(scopeId) {
  return `${USER_SCOPE_INDEX_PREFIX}.${scopeId}`;
}

async function readJson(key, fallback = null) {
  const stored = await AsyncStorage.getItem(key);
  if (!stored) {
    return fallback;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return fallback;
  }
}

async function getScopeId() {
  const auth = await getAuth();
  return safeScopeId(auth?.userId);
}

async function rememberScopedKey(scopeId, key) {
  const indexKey = scopeIndexKey(scopeId);
  const storedKeys = await readJson(indexKey, []);
  const keys = Array.isArray(storedKeys) ? storedKeys : [];
  if (keys.includes(key)) {
    return;
  }
  await AsyncStorage.setItem(indexKey, JSON.stringify([...keys, key]));
}

async function getScopedStorageKey(key) {
  const scopeId = await getScopeId();
  return {
    scopeId,
    key: scopedKey(scopeId, key),
  };
}

async function setScopedItem(key, value) {
  const resolved = await getScopedStorageKey(key);
  await AsyncStorage.setItem(resolved.key, value);
  await rememberScopedKey(resolved.scopeId, resolved.key);
}

async function getScopedItem(key) {
  const resolved = await getScopedStorageKey(key);
  return AsyncStorage.getItem(resolved.key);
}

async function removeScopedItem(key) {
  const resolved = await getScopedStorageKey(key);
  await AsyncStorage.removeItem(resolved.key);
}

async function clearScopedStorageForScope(scopeId) {
  const indexKey = scopeIndexKey(scopeId);
  const indexedKeys = await readJson(indexKey, []);
  const allKeys = await AsyncStorage.getAllKeys();
  const prefix = `${USER_SCOPE_PREFIX}.${scopeId}.`;
  const scopedKeys = allKeys.filter((key) => key.startsWith(prefix));
  const keysToRemove = Array.from(new Set([
    ...(Array.isArray(indexedKeys) ? indexedKeys : []),
    ...scopedKeys,
    indexKey,
  ]));

  if (keysToRemove.length) {
    await AsyncStorage.multiRemove(keysToRemove);
  }
}

async function clearLegacySessionData() {
  const allKeys = await AsyncStorage.getAllKeys();
  const keysToRemove = allKeys.filter(
    (key) =>
      LEGACY_SESSION_EXACT_KEYS.includes(key) ||
      LEGACY_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))
  );

  if (keysToRemove.length) {
    await AsyncStorage.multiRemove(keysToRemove);
  }
}

export async function saveAuth(auth) {
  if (!auth) {
    return;
  }

  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export async function updateAuthToken(token) {
  if (!token) {
    return;
  }

  const auth = await getAuth();
  if (!auth?.token || auth.token === token) {
    return;
  }

  await saveAuth({ ...auth, token });
}

export async function getAuth() {
  const stored = await AsyncStorage.getItem(AUTH_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export async function clearAuth() {
  await AsyncStorage.removeItem(AUTH_KEY);
}

export async function clearSession() {
  const auth = await getAuth();
  if (auth?.userId != null) {
    await clearScopedStorageForScope(safeScopeId(auth.userId));
  }
  await clearScopedStorageForScope('guest');
  await clearLegacySessionData();
  await clearAuth();
}

export async function saveLastStudyCount(count) {
  if (!Number.isFinite(count)) {
    return;
  }

  await setScopedItem(STUDY_PREF_KEY, JSON.stringify({ count }));
}

export async function getLastStudyCount() {
  const stored = await getScopedItem(STUDY_PREF_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return Number.isFinite(parsed?.count) ? parsed.count : null;
  } catch {
    return null;
  }
}

export async function saveCarryover(carryover) {
  if (!carryover) {
    return;
  }

  await setScopedItem(CARRYOVER_KEY, JSON.stringify(carryover));
}

export async function getCarryover() {
  const stored = await getScopedItem(CARRYOVER_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export async function clearCarryover() {
  await removeScopedItem(CARRYOVER_KEY);
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
  } catch {
    return null;
  }
}

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
  } catch {
    return null;
  }
}

export async function saveReminderHour(hour) {
  await AsyncStorage.setItem(REMINDER_HOUR_KEY, JSON.stringify({ hour }));
}

export async function getReminderHour() {
  const stored = await AsyncStorage.getItem(REMINDER_HOUR_KEY);
  if (!stored) {
    return 9;
  }

  try {
    const parsed = JSON.parse(stored);
    return Number.isFinite(parsed?.hour) ? parsed.hour : 9;
  } catch {
    return 9;
  }
}

export async function saveBadgeState({ knownWords }) {
  if (!Number.isFinite(knownWords)) {
    return;
  }

  await setScopedItem(BADGE_KEY, JSON.stringify({ knownWords }));
}

export async function getBadgeState() {
  const stored = await getScopedItem(BADGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return Number.isFinite(parsed?.knownWords) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveCache(key, data) {
  await setScopedItem(key, JSON.stringify({ data, savedAt: Date.now() }));
}

export async function getCache(key, maxAgeMs = Infinity) {
  const stored = await getScopedItem(key);
  if (!stored) {
    return null;
  }
  try {
    const parsed = JSON.parse(stored);
    if (maxAgeMs !== Infinity && Date.now() - parsed.savedAt > maxAgeMs) {
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export async function getQueue(key) {
  const stored = await getScopedItem(key);
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendToQueue(key, item) {
  const queue = await getQueue(key);
  queue.push(item);
  await setScopedItem(key, JSON.stringify(queue));
}

export async function shiftQueue(key) {
  const queue = await getQueue(key);
  if (!queue.length) {
    return null;
  }
  const item = queue.shift();
  await setScopedItem(key, JSON.stringify(queue));
  return item;
}

export async function clearQueue(key) {
  await removeScopedItem(key);
}

async function getReviewDeltaIndex() {
  const stored = await getScopedItem(REVIEW_DELTA_INDEX_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveReviewDeltaIndex(dates) {
  await setScopedItem(REVIEW_DELTA_INDEX_KEY, JSON.stringify(dates));
}

export async function getReviewDeltaDates() {
  return getReviewDeltaIndex();
}

export async function clearReviewDelta(dateStr) {
  await removeScopedItem(`syntagma.review.delta.${dateStr}`);
  const dates = await getReviewDeltaIndex();
  const next = dates.filter((d) => d !== dateStr);
  if (next.length) {
    await saveReviewDeltaIndex(next);
  } else {
    await removeScopedItem(REVIEW_DELTA_INDEX_KEY);
  }
}

export async function clearAllReviewDeltas() {
  const dates = await getReviewDeltaIndex();
  await Promise.all(dates.map((dateStr) => removeScopedItem(`syntagma.review.delta.${dateStr}`)));
  await removeScopedItem(REVIEW_DELTA_INDEX_KEY);
}

export async function getReviewDelta(dateStr) {
  const stored = await getScopedItem(`syntagma.review.delta.${dateStr}`);
  if (!stored) {
    return 0;
  }
  try {
    const parsed = JSON.parse(stored);
    return Number.isFinite(parsed?.count) ? parsed.count : 0;
  } catch {
    return 0;
  }
}

export async function incrementReviewDelta(dateStr) {
  const current = await getReviewDelta(dateStr);
  await setScopedItem(
    `syntagma.review.delta.${dateStr}`,
    JSON.stringify({ count: current + 1 })
  );
  const dates = await getReviewDeltaIndex();
  if (!dates.includes(dateStr)) {
    dates.push(dateStr);
    await saveReviewDeltaIndex(dates);
  }
}

export async function getReviewedIds(dateStr) {
  const stored = await getScopedItem(`syntagma.reviewed.today.${dateStr}`);
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addReviewedId(dateStr, id) {
  const ids = await getReviewedIds(dateStr);
  const strId = String(id);
  if (!ids.includes(strId)) {
    ids.push(strId);
    await setScopedItem(`syntagma.reviewed.today.${dateStr}`, JSON.stringify(ids));
  }
}
