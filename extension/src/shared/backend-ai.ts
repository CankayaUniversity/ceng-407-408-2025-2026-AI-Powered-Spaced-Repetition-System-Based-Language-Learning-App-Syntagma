import { getSettings } from './storage';
import type { LearnerLevel } from './types';

const DEFAULT_BACKEND_URL = 'https://syntagma.omerhanyigit.online';

function agentDebugLog(runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  // #region agent log
  fetch('http://127.0.0.1:7270/ingest/086ae315-3e8f-43ff-9b45-c4e15a84ed69',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e8c44a'},body:JSON.stringify({sessionId:'e8c44a',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

export interface AiWordExplainData {
  meaning: string;
  partOfSpeech: string;
  usageNote: string;
  commonMistake: string;
  examples: string[];
}

export interface AiTranslateData {
  naturalTranslation: string;
}

export interface AiSentencePart {
  chunk: string;
  function: string;
}

export interface AiSentenceExplainData {
  parts: AiSentencePart[];
  turkishMeaning: string;
  grammarStructure: string;
  whyThisStructure: string;
  learnerTip: string;
}

export interface AiExampleSentenceData {
  exampleSentence: string;
}

export type AiResultKind = 'explain-word' | 'translate' | 'explain-sentence';

export type AiResultData =
  | { kind: 'explain-word'; data: AiWordExplainData }
  | { kind: 'translate'; data: AiTranslateData }
  | { kind: 'explain-sentence'; data: AiSentenceExplainData };

interface ApiEnvelope<T> {
  status: string;
  data: T;
  message?: string;
  errorCode?: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const settings = await getSettings();
  const base = (settings.apiBaseUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
  if (!settings.authToken) {
    throw new Error('Sign in to use AI features');
  }

  // #region agent log
  agentDebugLog('initial', 'H1-H2', 'extension/src/shared/backend-ai.ts:55', 'AI backend fetch starting', {
    path,
    baseHost: (() => { try { return new URL(base).host; } catch { return 'invalid-url'; } })(),
    hasAuthToken: Boolean(settings.authToken),
    hasAuthUserId: Boolean(settings.authUserId),
    hasCustomApiBaseUrl: Boolean(settings.apiBaseUrl),
  });
  // #endregion

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.authToken}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();

  // #region agent log
  agentDebugLog('initial', 'H1-H2-H3', 'extension/src/shared/backend-ai.ts:70', 'AI backend fetch completed', {
    path,
    status: res.status,
    ok: res.ok,
    statusText: res.statusText,
    responseType: res.type,
    redirected: res.redirected,
    bodyPreview: responseText.slice(0, 240),
  });
  // #endregion

  if (!res.ok) {
    let msg = `AI request failed (${res.status})`;
    try {
      const err = JSON.parse(responseText) as { message?: string };
      if (err?.message) msg = err.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = JSON.parse(responseText) as ApiEnvelope<T>;
  if (json.status !== 'success' || !json.data) {
    throw new Error(json.message ?? 'AI request failed');
  }
  return json.data;
}

export function explainWord(input: {
  word: string;
  sentence: string;
  context?: string;
  level: LearnerLevel;
  exampleCount?: number;
}): Promise<AiWordExplainData> {
  return postJson<AiWordExplainData>('/api/ai/explain-word', input);
}

export function translateSentence(sentence: string): Promise<AiTranslateData> {
  return postJson<AiTranslateData>('/api/ai/translate', { sentence });
}

export function explainSentence(input: {
  sentence: string;
  level: LearnerLevel;
  context?: string;
}): Promise<AiSentenceExplainData> {
  return postJson<AiSentenceExplainData>('/api/ai/explain-sentence', input);
}

export function generateExampleSentence(input: {
  word: string;
  sentence?: string;
  level?: string;
}): Promise<AiExampleSentenceData> {
  return postJson<AiExampleSentenceData>('/api/ai/generate-example', input);
}
