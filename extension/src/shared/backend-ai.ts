import { getSettings } from './storage';
import type { LearnerLevel } from './types';

const DEFAULT_BACKEND_URL = 'https://syntagma.omerhanyigit.online';

export interface AiWordExplainData {
  meaning: string;
  partOfSpeech: string;
  usageNote: string;
  commonMistake: string;
  examples: string[];
}

export interface AiTranslateData {
  naturalTranslation: string;
  literalTranslation: string;
  alternativeTranslation: string;
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
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.authToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `AI request failed (${res.status})`;
    try {
      const err = await res.json() as { message?: string };
      if (err?.message) msg = err.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = await res.json() as ApiEnvelope<T>;
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
