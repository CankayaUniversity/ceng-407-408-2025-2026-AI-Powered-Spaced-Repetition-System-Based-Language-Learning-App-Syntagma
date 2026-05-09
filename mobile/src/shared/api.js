import { getAuth, saveAuth } from './storage';

const API_BASE_URL = 'https://syntagma.omerhanyigit.online';

async function parseJsonSafely(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

async function apiRequest(path, options = {}) {
  const auth = await getAuth();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (auth?.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  if (auth?.userId) {
    headers['X-User-Id'] = String(auth.userId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    const message = payload?.message || payload?.error || response.statusText || 'Request failed';
    throw new Error(message);
  }

  return payload?.data ?? payload;
}

export async function loginUser(email, password) {
  const response = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  if (response?.token) {
    await saveAuth({
      token: response.token,
      userId: response.userId,
      email: response.email,
    });
  }

  return response;
}

export async function registerUser(email, password) {
  return apiRequest('/api/auth/register', {
    method: 'POST',
    body: { email, password },
  });
}

export async function fetchCollections() {
  return apiRequest('/api/collections');
}

export async function fetchCollectionById(collectionId) {
  return apiRequest(`/api/collections/${collectionId}`);
}

export async function fetchCurrentUser() {
  return apiRequest('/api/users/me');
}

export async function fetchReviewStats(period = 'week') {
  return apiRequest(`/api/reviews/stats?period=${encodeURIComponent(period)}`);
}

export async function submitReview(review) {
  return apiRequest('/api/reviews', {
    method: 'POST',
    body: review,
  });
}

export async function updateWordKnowledge(lemma, status) {
  return apiRequest(`/api/word-knowledge/${encodeURIComponent(lemma)}`, {
    method: 'PUT',
    body: { status },
  });
}

export async function fetchDueCards(limit = 20) {
  return apiRequest(`/api/srs/due?limit=${limit}`);
}
