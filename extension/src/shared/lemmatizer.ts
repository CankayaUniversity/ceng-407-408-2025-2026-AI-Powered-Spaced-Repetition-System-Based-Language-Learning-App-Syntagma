// Lemmatizer using compromise NLP library
// This module runs in content script context
// Static import — required for IIFE bundle (dynamic import not allowed in IIFE)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import nlpRaw from 'compromise';

// compromise exports differently depending on build system
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nlpFn = (nlpRaw as any).default ?? nlpRaw;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callNlp(text: string): any {
  return nlpFn(text);
}

const cache = new Map<string, string>();

export function lemmatize(surface: string): string {
  const lower = surface.toLowerCase();
  if (cache.has(lower)) return cache.get(lower)!;

  try {
    const doc = callNlp(lower);

    // Try verb lemma first
    const verbs = doc.verbs();
    if (verbs.length > 0) {
      const base = verbs.toInfinitive().text();
      if (base && base.length > 0) {
        cache.set(lower, base);
        return base;
      }
    }

    // Try noun lemma
    const nouns = doc.nouns();
    if (nouns.length > 0) {
      const singular = nouns.toSingular().text();
      if (singular && singular.length > 0) {
        cache.set(lower, singular);
        return singular;
      }
    }
  } catch {
    // fallthrough
  }

  // Fallback: return lowercase
  cache.set(lower, lower);
  return lower;
}

// lemmatize is now synchronous, lemmatizeSync is an alias
export function lemmatizeSync(surface: string): string {
  return lemmatize(surface);
}

export function clearLemmatizerCache(): void {
  cache.clear();
}

// Pre-populate cache with common irregulars
const IRREGULAR_MAP: Record<string, string> = {
  'running': 'run', 'ran': 'run', 'runs': 'run',
  'established': 'establish', 'establishing': 'establish', 'establishes': 'establish',
  'better': 'good', 'best': 'good', 'worse': 'bad', 'worst': 'bad',
  'went': 'go', 'gone': 'go', 'going': 'go', 'goes': 'go',
  'mice': 'mouse', 'children': 'child', 'men': 'man', 'women': 'woman',
  'teeth': 'tooth', 'feet': 'foot', 'geese': 'goose',
  'was': 'be', 'were': 'be', 'been': 'be', 'being': 'be', 'is': 'be', 'are': 'be', 'am': 'be',
  'had': 'have', 'has': 'have', 'having': 'have',
  'did': 'do', 'done': 'do', 'does': 'do', 'doing': 'do',
  'said': 'say', 'says': 'say', 'saying': 'say',
  'got': 'get', 'gotten': 'get', 'getting': 'get', 'gets': 'get',
  'made': 'make', 'making': 'make', 'makes': 'make',
  'took': 'take', 'taken': 'take', 'taking': 'take', 'takes': 'take',
  'came': 'come', 'coming': 'come', 'comes': 'come',
  'knew': 'know', 'known': 'know', 'knowing': 'know', 'knows': 'know',
  'thought': 'think', 'thinking': 'think', 'thinks': 'think',
  'saw': 'see', 'seen': 'see', 'seeing': 'see', 'sees': 'see',
  'looked': 'look', 'looking': 'look', 'looks': 'look',
  'used': 'use', 'using': 'use', 'uses': 'use',
  'found': 'find', 'finding': 'find', 'finds': 'find',
  'called': 'call', 'calling': 'call', 'calls': 'call',
  'tried': 'try', 'trying': 'try', 'tries': 'try',
  'asked': 'ask', 'asking': 'ask', 'asks': 'ask',
  'needed': 'need', 'needing': 'need', 'needs': 'need',
  'felt': 'feel', 'feeling': 'feel', 'feels': 'feel',
  'became': 'become', 'becoming': 'become', 'becomes': 'become',
  'left': 'leave', 'leaving': 'leave', 'leaves': 'leave',
  'put': 'put', 'putting': 'put', 'puts': 'put',
  'meant': 'mean', 'meaning': 'mean', 'means': 'mean',
  'kept': 'keep', 'keeping': 'keep', 'keeps': 'keep',
  'let': 'let', 'letting': 'let', 'lets': 'let',
  'began': 'begin', 'begun': 'begin', 'beginning': 'begin', 'begins': 'begin',
  'showed': 'show', 'shown': 'show', 'showing': 'show', 'shows': 'show',
  'heard': 'hear', 'hearing': 'hear', 'hears': 'hear',
  'played': 'play', 'playing': 'play', 'plays': 'play',
  'moved': 'move', 'moving': 'move', 'moves': 'move',
  'lived': 'live', 'living': 'live', 'lives': 'live',
  'believed': 'believe', 'believing': 'believe', 'believes': 'believe',
  'held': 'hold', 'holding': 'hold', 'holds': 'hold',
  'brought': 'bring', 'bringing': 'bring', 'brings': 'bring',
  'wrote': 'write', 'written': 'write', 'writing': 'write', 'writes': 'write',
  'provided': 'provide', 'providing': 'provide', 'provides': 'provide',
  'stood': 'stand', 'standing': 'stand', 'stands': 'stand',
  'lost': 'lose', 'losing': 'lose', 'loses': 'lose',
  'paid': 'pay', 'paying': 'pay', 'pays': 'pay',
  'met': 'meet', 'meeting': 'meet', 'meets': 'meet',
  'included': 'include', 'including': 'include', 'includes': 'include',
  'continued': 'continue', 'continuing': 'continue', 'continues': 'continue',
  'set': 'set', 'setting': 'set', 'sets': 'set',
  'learned': 'learn', 'learning': 'learn', 'learns': 'learn',
  'changed': 'change', 'changing': 'change', 'changes': 'change',
  'led': 'lead', 'leading': 'lead', 'leads': 'lead',
  'understood': 'understand', 'understanding': 'understand', 'understands': 'understand',
  'watched': 'watch', 'watching': 'watch', 'watches': 'watch',
  'followed': 'follow', 'following': 'follow', 'follows': 'follow',
  'stopped': 'stop', 'stopping': 'stop', 'stops': 'stop',
  'created': 'create', 'creating': 'create', 'creates': 'create',
  'spoken': 'speak', 'spoke': 'speak', 'speaking': 'speak', 'speaks': 'speak',
  'read': 'read', 'reading': 'read', 'reads': 'read',
  'spent': 'spend', 'spending': 'spend', 'spends': 'spend',
  'grew': 'grow', 'grown': 'grow', 'growing': 'grow', 'grows': 'grow',
  'opened': 'open', 'opening': 'open', 'opens': 'open',
  'walked': 'walk', 'walking': 'walk', 'walks': 'walk',
  'offered': 'offer', 'offering': 'offer', 'offers': 'offer',
  'remembered': 'remember', 'remembering': 'remember', 'remembers': 'remember',
  'considered': 'consider', 'considering': 'consider', 'considers': 'consider',
  'appeared': 'appear', 'appearing': 'appear', 'appears': 'appear',
  'bought': 'buy', 'buying': 'buy', 'buys': 'buy',
  'waited': 'wait', 'waiting': 'wait', 'waits': 'wait',
  'served': 'serve', 'serving': 'serve', 'serves': 'serve',
  'died': 'die', 'dying': 'die', 'dies': 'die',
  'sent': 'send', 'sending': 'send', 'sends': 'send',
  'built': 'build', 'building': 'build', 'builds': 'build',
  'fell': 'fall', 'fallen': 'fall', 'falling': 'fall', 'falls': 'fall',
  'chosen': 'choose', 'chose': 'choose', 'choosing': 'choose', 'chooses': 'choose',
  'cut': 'cut', 'cutting': 'cut', 'cuts': 'cut',
  'hit': 'hit', 'hitting': 'hit', 'hits': 'hit',
};

// Pre-populate the cache with irregulars
for (const [surface, lemma] of Object.entries(IRREGULAR_MAP)) {
  cache.set(surface, lemma);
}
