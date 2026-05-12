import { useState, useEffect, useCallback, useRef } from 'react';
import ePub, { Book, Rendition } from 'epubjs';
import type { UserSettings, LexemeEntry, WordStatus, FlashcardPayload, Token } from '../shared/types';
import type { AiResultData } from '../shared/backend-ai';
import { DEFAULT_SETTINGS, userScopedKey } from '../shared/storage';
import { sendMessage } from '../shared/messages';
import { lookupFrequency, initFrequencyTable } from '../shared/frequency';
import { lemmatize } from '../shared/lemmatizer';
import { usePageAnalysis } from '../content/hooks/usePageAnalysis';
import { MiniDonut, StatsPopup, StatsUIColors } from '../content/components/StatsUI';

// ─── Colors (matching extension theme) ──────────────────────────────────────

interface Theme {
  bg: string;
  text: string;
  surface: string;
  border: string;
  accent: string;
  outerBg: string;
}

const THEMES: Record<string, Theme> = {
  light: { bg: '#FFFFFF', text: '#333333', surface: '#F5F1E9', border: '#E2DACE', accent: '#98C1D9', outerBg: '#FBF9F4' },
  sepia: { bg: '#F4EADB', text: '#5B4636', surface: '#EDE0CE', border: '#D4C4AD', accent: '#E9C46A', outerBg: '#F3E8DA' },
  dark:  { bg: '#1E1E2E', text: '#CDD6F4', surface: '#313244', border: '#45475A', accent: '#89B4FA', outerBg: '#3C3D52' },
};

const C = {
  blue: '#98C1D9',
  red: '#D97762',
  amber: '#E9C46A',
  green: '#A8B693',
  mauve: '#A07855',
  subtext: '#877666',
  base: '#F5F1E9',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface EbookMeta {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  addedAt: number;
  lastReadAt: number;
  progress: number;
  currentCfi?: string;
  totalLocations?: number;
}

interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

const STORAGE_KEY = 'syntagma_ebooks';

// ─── Persistence helpers ────────────────────────────────────────────────────

async function getStoredUserId(): Promise<string | null> {
  const result = await chrome.storage.local.get('userSettings');
  return (result.userSettings as any)?.authUserId ?? null;
}

async function loadLibrary(): Promise<EbookMeta[]> {
  const userId = await getStoredUserId();
  const key = userScopedKey(STORAGE_KEY, userId);
  const result = await chrome.storage.local.get(key);
  return (result[key] ?? []) as EbookMeta[];
}

async function saveLibrary(lib: EbookMeta[]): Promise<void> {
  const userId = await getStoredUserId();
  const key = userScopedKey(STORAGE_KEY, userId);
  await chrome.storage.local.set({ [key]: lib });
}

async function storeEpubBlob(id: string, blob: ArrayBuffer): Promise<void> {
  const userId = await getStoredUserId();
  const blobKey = userScopedKey(`epub_${id}`, userId);
  await chrome.storage.local.set({ [blobKey]: Array.from(new Uint8Array(blob)) });
}

async function loadEpubBlob(id: string): Promise<ArrayBuffer | null> {
  const userId = await getStoredUserId();
  const blobKey = userScopedKey(`epub_${id}`, userId);
  const result = await chrome.storage.local.get(blobKey);
  const arr = result[blobKey];
  if (!arr) return null;
  return new Uint8Array(arr as number[]).buffer;
}

async function removeEpubBlob(id: string): Promise<void> {
  const userId = await getStoredUserId();
  const blobKey = userScopedKey(`epub_${id}`, userId);
  await chrome.storage.local.remove(blobKey);
}

// ─── Word interaction helpers ───────────────────────────────────────────────

function getStatusColor(status: WordStatus): string | undefined {
  if (status === 'unknown') return C.red;
  if (status === 'learning') return C.amber;
  return undefined;
}

function getUnderlineStyle(status: WordStatus): string {
  const color = getStatusColor(status);
  return color ? `2px solid ${color}` : '2px solid transparent';
}

function wrapWordsInElement(container: Document, lexemes: Record<string, LexemeEntry>, settings: UserSettings): Token[] {
  const walker = container.createTreeWalker(container.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  const tokens: Token[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent && node.textContent.trim().length > 0) {
      textNodes.push(node);
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    // Regex matches words (letters, apostrophes, hyphens) and everything else as segments
    const segments = text.split(/([a-zA-Z]{2,}(?:[''][a-zA-Z]+)?)/);
    if (segments.length <= 1) continue;

    const frag = container.createDocumentFragment();
    for (const segment of segments) {
      // Check if segment is a word (matches our regex)
      if (/^[a-zA-Z]{2,}(?:[''][a-zA-Z]+)?$/.test(segment)) {
        const lemma = lemmatize(segment);
        const entry = lexemes[lemma];
        const status = entry?.status ?? 'unknown';
        
        tokens.push({ surface: segment, lemma, status });
        
        const span = container.createElement('span');
        span.textContent = segment;
        span.dataset.syntagmaWord = lemma;
        span.dataset.surface = segment;
        span.style.cursor = 'pointer';
        span.style.transition = 'background-color 0.1s, border-color 0.1s';
        
        if (settings.readerShowLearningStatusColors) {
          const status = entry?.status ?? 'unknown';
          span.style.borderBottom = getUnderlineStyle(status);
        } else {
          span.style.borderBottom = '2px solid transparent';
        }

        frag.appendChild(span);
      } else {
        frag.appendChild(container.createTextNode(segment));
      }
    }

    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return tokens;
}

function updateWordUnderlines(rendition: Rendition | null, lemma: string, status: WordStatus, settings: UserSettings): void {
  if (!rendition) return;
  try {
    const contents = (rendition as any).getContents?.() ?? [];
    for (const content of contents) {
      const doc = content?.document as Document | undefined;
      if (!doc) continue;
      const spans = doc.querySelectorAll(`span[data-syntagma-word="${CSS.escape(lemma)}"]`);
      for (const span of spans) {
        if (settings.readerShowLearningStatusColors) {
          (span as HTMLElement).style.borderBottom = getUnderlineStyle(status);
        } else {
          (span as HTMLElement).style.borderBottom = '2px solid transparent';
        }
      }
    }
  } catch { /* iframe may be gone */ }
}

// ─── Shared popup components ────────────────────────────────────────────────

const PC = {
  base: '#F5F1E9',
  surface0: '#FFFFFF',
  surface1: '#E2DACE',
  surface2: '#C9BEAD',
  text: '#4A3B2C',
  subtext: '#877666',
  blue: '#98C1D9',
  red: '#D97762',
  amber: '#E9C46A',
  green: '#A8B693',
  mauve: '#A07855',
  overlay: 'rgba(245, 241, 233, 0.97)',
};

type AIActionType = 'explain-word' | 'explain-sentence' | 'translate';

const STATUS_CONFIG: Array<{ status: WordStatus; color: string; description: string }> = [
  { status: 'unknown', color: PC.red, description: 'Unknown' },
  { status: 'learning', color: PC.amber, description: 'Learning' },
  { status: 'known', color: PC.green, description: 'Known' },
  { status: 'ignored', color: PC.subtext, description: 'Ignore' },
];

function StatusIcon({ status, color }: { status: WordStatus; color: string }) {
  if (status === 'unknown') return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
  if (status === 'learning') return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
  if (status === 'known') return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: PC.subtext, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>{label}</div>
      <div style={{ color: PC.text }}>{value}</div>
    </div>
  );
}

function AIPanel({ result, loading, error }: { result: AiResultData | null; loading: boolean; error?: string | null }) {
  if (!result && !loading && !error) return null;
  const wrap: React.CSSProperties = {
    background: PC.surface0, borderRadius: '6px', padding: '10px 12px',
    marginBottom: '8px', fontSize: '12px', color: PC.text, lineHeight: 1.55,
    maxHeight: '260px', overflowY: 'auto',
  };
  if (error) return <div style={wrap}><span style={{ color: PC.red }}>{error}</span></div>;
  if (loading && !result) return <div style={wrap}><span style={{ color: PC.subtext }}>Thinking...</span></div>;
  if (!result) return null;

  if (result.kind === 'explain-word') {
    const d = result.data;
    return (
      <div style={wrap}>
        <Field label="Meaning" value={d.meaning} />
        <Field label="Part of Speech" value={d.partOfSpeech} />
        <Field label="Usage Note" value={d.usageNote} />
        <Field label="Common Mistake" value={d.commonMistake} />
        {d.examples?.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: PC.subtext, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Examples</div>
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
              {d.examples.map((ex: string, i: number) => <li key={i} style={{ marginBottom: '2px' }}>{ex}</li>)}
            </ul>
          </div>
        )}
      </div>
    );
  }
  if (result.kind === 'translate') {
    const d = result.data;
    return (
      <div style={wrap}>
        <Field label="Natural" value={d.naturalTranslation} />
        <Field label="Literal" value={d.literalTranslation} />
        <Field label="Alternative" value={d.alternativeTranslation} />
      </div>
    );
  }
  const d = result.data;
  return (
    <div style={wrap}>
      {d.parts?.length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: PC.subtext, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Parts</div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {d.parts.map((p: any, i: number) => (
              <li key={i} style={{ marginBottom: '2px' }}>
                <span style={{ fontWeight: 600 }}>{p.chunk}</span>
                <span style={{ color: PC.subtext }}> — {p.function}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Field label="Turkish Meaning" value={d.turkishMeaning} />
      <Field label="Grammar" value={d.grammarStructure} />
      <Field label="Why This Structure" value={d.whyThisStructure} />
      <Field label="Learner Tip" value={d.learnerTip} />
    </div>
  );
}

const DICT_LINKS = [
  { id: 'tureng', label: 'Tureng', url: (w: string) => `https://tureng.com/en/turkish-english/${encodeURIComponent(w)}` },
  { id: 'cambridge', label: 'Cambridge', url: (w: string) => `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(w)}` },
  { id: 'oxford', label: 'Oxford', url: (w: string) => `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(w)}` },
  { id: 'merriam', label: 'Merriam-Webster', url: (w: string) => `https://www.merriam-webster.com/dictionary/${encodeURIComponent(w)}` },
  { id: 'images', label: 'Google Images', url: (w: string) => `https://www.google.com/search?q=${encodeURIComponent(w)}&tbm=isch` },
];

function speakWord(word: string): void {
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

// ─── Reader Word Popup ──────────────────────────────────────────────────────

function ReaderWordPopup({
  word,
  surface,
  sentence,
  lexeme,
  settings,
  position,
  bookTitle,
  bookId,
  onClose,
  onStatusChange,
}: {
  word: string;
  surface: string;
  sentence: string;
  lexeme: LexemeEntry | null;
  settings: UserSettings;
  position: { x: number; y: number };
  bookTitle: string;
  bookId: string;
  onClose: () => void;
  onStatusChange: (lemma: string, status: WordStatus) => void;
}) {
  const [currentStatus, setCurrentStatus] = useState<WordStatus>(lexeme?.status ?? 'unknown');
  const [translations, setTranslations] = useState<string[]>([]);
  const [aiResult, setAiResult] = useState<AiResultData | null>(null);
  const [aiLoading, setAiLoading] = useState<AIActionType | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [cardSaved, setCardSaved] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [showLinks, setShowLinks] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const freqEntry = lookupFrequency(word);

  useEffect(() => {
    sendMessage<{ translations: string[] }>({
      type: 'LOOKUP_DICTIONARY',
      payload: { word },
    }).then(res => setTranslations(res?.translations ?? [])).catch(() => {});
  }, [word]);

  useEffect(() => {
    const handler = (msg: any) => {
      if (!requestIdRef.current) return;
      if (msg.payload?.requestId !== requestIdRef.current) return;
      if (msg.type === 'AI_RESULT' && msg.payload.result) {
        setAiResult(msg.payload.result);
        setAiLoading(null);
        requestIdRef.current = null;
      } else if (msg.type === 'AI_STREAM_ERROR') {
        setAiError(msg.payload.error ?? 'AI error');
        setAiLoading(null);
        requestIdRef.current = null;
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleStatusChange = useCallback((status: WordStatus) => {
    setCurrentStatus(status);
    onStatusChange(word, status);
    sendMessage({ type: 'SET_WORD_STATUS', payload: { lemma: word, status } }).catch(console.error);
  }, [word, onStatusChange]);

  const handleCycleStatus = useCallback(() => {
    const idx = STATUS_CONFIG.findIndex(c => c.status === currentStatus);
    const next = STATUS_CONFIG[(idx + 1) % STATUS_CONFIG.length];
    handleStatusChange(next.status);
  }, [currentStatus, handleStatusChange]);

  const handleAIAction = useCallback((type: AIActionType) => {
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    requestIdRef.current = reqId;
    setAiResult(null);
    setAiError(null);
    setAiLoading(type);

    const msgType = type === 'explain-word' ? 'EXPLAIN_WORD_WITH_AI'
      : type === 'explain-sentence' ? 'EXPLAIN_SENTENCE_WITH_AI'
      : 'TRANSLATE_SENTENCE_WITH_AI';

    const payload = type === 'explain-word'
      ? { word, sentence, level: settings.learnerLevel, requestId: reqId }
      : type === 'explain-sentence'
      ? { sentence, level: settings.learnerLevel, requestId: reqId }
      : { sentence, requestId: reqId };

    sendMessage({ type: msgType, payload } as any).catch(err => {
      setAiError((err as Error).message);
      setAiLoading(null);
    });
  }, [word, sentence, settings.learnerLevel]);

  const [cardError, setCardError] = useState<string | null>(null);
  const handleSaveCard = useCallback(async () => {
    if (cardSaved !== 'idle') return;
    setCardSaved('saving');
    setCardError(null);
    try {
      const card: FlashcardPayload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        lemma: word,
        surfaceForm: surface,
        sentence,
        sourceUrl: `syntagma-reader://${bookId}`,
        sourceTitle: bookTitle,
        trMeaning: lexeme?.trMeaning ?? (translations[0] ?? ''),
        createdAt: Date.now(),
        deckName: settings.activeCollectionName || 'Syntagma',
        tags: ['syntagma', 'reader'],
      };
      const result = await sendMessage<{ ok: boolean; error?: string }>({
        type: 'CREATE_FLASHCARD',
        payload: card,
      });
      if (!result.ok) throw new Error(result.error || 'Server error');
      setCardSaved('done');
      handleStatusChange('learning');
      setTimeout(() => setCardSaved('idle'), 2000);
    } catch (err) {
      setCardError((err as Error).message);
      setCardSaved('error');
      setTimeout(() => setCardSaved('idle'), 3000);
    }
  }, [cardSaved, word, surface, sentence, lexeme, translations, bookId, bookTitle, settings, handleStatusChange]);

  const currentCfg = STATUS_CONFIG.find(c => c.status === currentStatus) ?? STATUS_CONFIG[0];
  const popupW = 340;
  const initLeft = Math.max(12, Math.min(position.x - popupW / 2, window.innerWidth - popupW - 12));
  const initTop = Math.max(6, Math.min(position.y, window.innerHeight - 400));
  const finalPos = popupPos ?? { top: initTop, left: initLeft };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragOffsetRef.current = {
      x: e.clientX - finalPos.left,
      y: e.clientY - finalPos.top,
    };
    e.preventDefault();
  }, [finalPos]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !popupRef.current) return;
      const newLeft = e.clientX - dragOffsetRef.current.x;
      const newTop = e.clientY - dragOffsetRef.current.y;
      const pH = popupRef.current.offsetHeight;
      setPopupPos({
        top: Math.max(0, Math.min(newTop, window.innerHeight - pH)),
        left: Math.max(0, Math.min(newLeft, window.innerWidth - popupW)),
      });
    };
    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const btnStyle = (active?: boolean, color?: string): React.CSSProperties => ({
    width: '32px', height: '32px', borderRadius: '16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? (color ?? PC.blue) : 'transparent',
    color: active ? PC.base : (color ?? PC.blue),
    border: `1.5px solid ${color ?? PC.blue}`,
    cursor: 'pointer', padding: 0, transition: 'all 0.15s', flexShrink: 0,
  });

  const Spinner = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'syn-spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <style>{`@keyframes syn-spin { 100% { transform: rotate(360deg); } }`}</style>
    </svg>
  );

  return (
    <div ref={popupRef} style={{
      position: 'fixed', zIndex: 2147483645, top: finalPos.top, left: finalPos.left, width: `${popupW}px`,
      background: PC.overlay, backdropFilter: 'blur(12px)',
      border: `1px solid ${PC.surface1}`, borderRadius: '8px',
      padding: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '13px', color: PC.text,
      ...(isDragging ? { userSelect: 'none' as const, cursor: 'grabbing' } : {}),
    }}>
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '14px',
          marginBottom: '6px',
          marginTop: '-4px',
          cursor: isDragging ? 'grabbing' : 'grab',
          borderRadius: '4px',
        }}
      >
        <svg width="24" height="8" viewBox="0 0 24 8" fill={PC.surface2}>
          <circle cx="7" cy="2" r="1.5"/>
          <circle cx="12" cy="2" r="1.5"/>
          <circle cx="17" cy="2" r="1.5"/>
          <circle cx="7" cy="6" r="1.5"/>
          <circle cx="12" cy="6" r="1.5"/>
          <circle cx="17" cy="6" r="1.5"/>
        </svg>
      </div>
      {/* Header: word + flashcard button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: PC.text }}>{surface}</span>
            {surface.toLowerCase() !== word && (
              <span style={{ fontSize: '12px', color: PC.subtext }}>({word})</span>
            )}
            {freqEntry && (
              <span style={{ background: PC.surface1, color: PC.subtext, borderRadius: '3px', padding: '1px 5px', fontSize: '10px', fontWeight: 600 }}>
                #{freqEntry.rank}
              </span>
            )}
          </div>
          {lexeme?.trMeaning && (
            <div style={{ fontSize: '12px', color: PC.blue, fontStyle: 'italic' }}>{lexeme.trMeaning}</div>
          )}
        </div>
        <button
          onClick={handleSaveCard}
          title={!settings.authToken ? 'Log in to save cards' : cardSaved === 'done' ? 'Card saved!' : 'Add to flashcards'}
          disabled={!settings.authToken || cardSaved === 'saving'}
          style={{
            width: '32px', height: '32px', borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: cardSaved === 'done' ? PC.green : cardSaved === 'error' ? PC.red : PC.green,
            color: PC.base, border: 'none',
            cursor: cardSaved === 'idle' ? 'pointer' : 'default',
            padding: 0, transition: 'background 0.2s', flexShrink: 0,
          }}
        >
          {cardSaved === 'done' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : cardSaved === 'error' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
          )}
        </button>
      </div>

      {/* Card save feedback */}
      {(cardSaved === 'done' || cardSaved === 'error') && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: cardSaved === 'done' ? PC.green + '22' : PC.red + '22',
          border: `1px solid ${cardSaved === 'done' ? PC.green : PC.red}`,
          borderRadius: '5px', padding: '5px 9px', marginBottom: '8px',
          fontSize: '12px', fontWeight: 600,
          color: cardSaved === 'done' ? PC.green : PC.red,
        }}>
          {cardSaved === 'done' ? 'Card saved to your flashcards!' : `Failed: ${cardError || 'Unknown error'}. Try again.`}
        </div>
      )}

      {/* Sentence context */}
      {sentence && (
        <div style={{
          background: PC.surface0, borderRadius: '4px', padding: '6px 8px',
          marginBottom: '8px', fontSize: '12px', color: PC.subtext,
          lineHeight: 1.5, fontStyle: 'italic', maxHeight: '120px', overflowY: 'auto',
        }}>
          {sentence}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        <button onClick={() => speakWord(surface)} style={btnStyle(false, PC.green)} title="Pronounce word">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        </button>
        <button onClick={() => handleAIAction('explain-word')} disabled={aiLoading !== null} style={btnStyle(aiLoading === 'explain-word', PC.blue)} title="AI: explain word">
          {aiLoading === 'explain-word' ? <Spinner /> : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg>
          )}
        </button>
        <button onClick={() => handleAIAction('explain-sentence')} disabled={aiLoading !== null} style={btnStyle(aiLoading === 'explain-sentence', PC.amber)} title="AI: explain sentence">
          {aiLoading === 'explain-sentence' ? <Spinner /> : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
          )}
        </button>
        <button onClick={() => handleAIAction('translate')} disabled={aiLoading !== null} style={btnStyle(aiLoading === 'translate', PC.green)} title="AI: translate sentence">
          {aiLoading === 'translate' ? <Spinner /> : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></svg>
          )}
        </button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowLinks(v => !v)} style={btnStyle(showLinks, PC.subtext)} title="External dictionaries">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
          </button>
          {showLinks && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: '6px',
              background: PC.surface0, border: `1px solid ${PC.surface1}`,
              borderRadius: '8px', padding: '6px', zIndex: 2147483647,
              minWidth: '160px', boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
            }}>
              {DICT_LINKS.map(link => (
                <button key={link.id} onClick={() => { window.open(link.url(surface), '_blank'); setShowLinks(false); }}
                  style={{ display: 'block', width: '100%', background: 'transparent', color: PC.text, border: 'none', borderRadius: '6px', padding: '8px 10px', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = PC.surface1)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >{link.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dictionary translations */}
      {translations.length > 0 && (
        <ul style={{ margin: '0 0 12px 24px', padding: 0, color: PC.text, fontSize: '14px', fontWeight: 600, lineHeight: 1.4 }}>
          {translations.map((tr, idx) => <li key={idx} style={{ paddingLeft: '4px', marginBottom: '4px' }}>{tr}</li>)}
        </ul>
      )}

      {/* AI panel */}
      <AIPanel result={aiResult} loading={aiLoading !== null} error={aiError} />

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderTop: `1px solid ${PC.surface1}`, paddingTop: '10px' }}>
        <button onClick={handleCycleStatus} title="Click to cycle status" style={{
          background: currentCfg.color, color: PC.base, border: 'none', borderRadius: '16px',
          padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 800,
          transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          <StatusIcon status={currentStatus} color={PC.base} />
          {currentCfg.description}
        </button>
      </div>
    </div>
  );
}

// ─── Library View ───────────────────────────────────────────────────────────

function LibraryView({
  books,
  onOpen,
  onImport,
  onDelete,
  theme,
}: {
  books: EbookMeta[];
  onOpen: (id: string) => void;
  onImport: () => void;
  onDelete: (id: string) => void;
  theme: Theme;
}) {
  return (
    <div style={{ padding: '32px', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
            <span style={{ color: C.blue, fontWeight: 800, fontSize: '22px' }}>Syn</span>
            <span style={{ color: C.amber, fontWeight: 800, fontSize: '22px' }}>tagma</span>
          </div>
          <span style={{ color: theme.text, fontSize: '14px', opacity: 0.6 }}>Reader</span>
        </div>
        <button
          onClick={onImport}
          style={{
            background: C.blue,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Import EPUB
        </button>
      </div>

      {books.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          color: theme.text,
          opacity: 0.5,
          fontSize: '15px',
        }}>
          No books yet. Import an EPUB to start reading.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '20px',
        }}>
          {books.map(book => (
            <div
              key={book.id}
              style={{
                background: theme.surface,
                borderRadius: '10px',
                overflow: 'hidden',
                cursor: 'pointer',
                border: `1px solid ${theme.border}`,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onClick={() => onOpen(book.id)}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = '';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '';
              }}
            >
              <div style={{
                height: '220px',
                background: book.coverUrl ? `url(${book.coverUrl}) center/cover` : theme.border,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '40px',
                color: theme.text,
                opacity: book.coverUrl ? 1 : 0.3,
              }}>
                {!book.coverUrl && '\u{1F4D6}'}
              </div>
              <div style={{ padding: '12px' }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: theme.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {book.title}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: theme.text,
                  opacity: 0.6,
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {book.author || 'Unknown'}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '8px',
                }}>
                  <div style={{
                    flex: 1,
                    height: '4px',
                    background: theme.border,
                    borderRadius: '2px',
                    overflow: 'hidden',
                    marginRight: '8px',
                  }}>
                    <div style={{
                      width: `${Math.round(book.progress * 100)}%`,
                      height: '100%',
                      background: C.green,
                      borderRadius: '2px',
                    }} />
                  </div>
                  <span style={{ fontSize: '11px', color: theme.text, opacity: 0.5 }}>
                    {Math.round(book.progress * 100)}%
                  </span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(book.id); }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: C.red,
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: '4px 0',
                    marginTop: '4px',
                    opacity: 0.6,
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reader View ────────────────────────────────────────────────────────────

function ReaderView({
  bookMeta,
  settings,
  onBack,
  theme,
}: {
  bookMeta: EbookMeta;
  settings: UserSettings;
  onBack: () => void;
  theme: Theme;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [chapterTokens, setChapterTokens] = useState<Token[]>([]);
  const [currentChapter, setCurrentChapter] = useState('');
  const [progress, setProgress] = useState(bookMeta.progress);
  const [fontSize, setFontSize] = useState(settings.readerDefaultFontSize);
  const [lexemes, setLexemes] = useState<Record<string, LexemeEntry>>({});
  const [wordPopup, setWordPopup] = useState<{
    word: string;
    surface: string;
    sentence: string;
    x: number;
    y: number;
  } | null>(null);

  // Use refs for hooks to avoid re-registering them on every state change
  const lexemesRef = useRef(lexemes);
  const settingsRef = useRef(settings);
  useEffect(() => { lexemesRef.current = lexemes; }, [lexemes]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Load lexemes (user-scoped)
  useEffect(() => {
    getStoredUserId().then(userId => {
      const key = userScopedKey('lexemes', userId);
      chrome.storage.local.get(key).then(r => {
        const loaded = (r[key] ?? {}) as Record<string, LexemeEntry>;
        setLexemes(loaded);
        lexemesRef.current = loaded;
      });
    });
  }, []);

  // Listen for status changes
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg.type === 'STATUS_CHANGED') {
        const { lemma, status } = msg.payload;
        setLexemes(prev => {
          const next = {
            ...prev,
            [lemma]: {
              ...(prev[lemma] ?? { key: lemma, lemma, surface: lemma, status: 'unknown', seenCount: 0, lastSeenAt: 0, createdAt: 0 }),
              status,
            } as LexemeEntry,
          };
          lexemesRef.current = next;
          return next;
        });
        updateWordUnderlines(renditionRef.current, lemma, status, settingsRef.current);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Initialize book
  useEffect(() => {
    let destroyed = false;

    async function init() {
      const buffer = await loadEpubBlob(bookMeta.id);
      if (!buffer || destroyed) return;

      const book = ePub(buffer);
      bookRef.current = book;

      await book.ready;
      if (destroyed) { book.destroy(); return; }

      const nav = await book.loaded.navigation;
      setToc(nav.toc as TocItem[]);

      if (!viewerRef.current) return;

      const rendition = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
        spread: 'none',
        flow: 'paginated',
      });
      renditionRef.current = rendition;

      // Apply theme and custom styles for our spans
      rendition.themes.default({
        body: {
          'font-family': 'Georgia, "Times New Roman", serif',
          'font-size': `${fontSize}px`,
          'line-height': `${settingsRef.current.readerLineHeight}`,
          'color': theme.text,
          'background': theme.bg,
          'padding': '24px 12%',
          'margin': '0',
          'text-align': 'justify',
        },
        'a': { color: theme.accent },
        'img': { 'max-width': '100%' },
        'span[data-syntagma-word]': {
          'display': 'inline !important',
          'cursor': 'pointer !important',
          'border-bottom': '2px solid transparent',
          'transition': 'background-color 0.1s, border-color 0.1s !important',
        },
        'span[data-syntagma-word]:hover': {
          'background-color': 'rgba(233, 196, 106, 0.15) !important',
        }
      });

      // Wrap words after each chapter renders
      rendition.hooks.content.register((contents: any) => {
        if (destroyed) return;
        const doc = contents.document as Document;
        // Inject a small style block to handle the dynamic status colors if needed,
        // though we also set them directly in wrapWordsInElement
        const tokens = wrapWordsInElement(doc, lexemesRef.current, settingsRef.current);
        setChapterTokens(tokens);
      });

      // Word click handling
      rendition.on('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const span = target.closest('span[data-syntagma-word]') as HTMLElement;
        
        if (span) {
          const word = span.dataset.syntagmaWord!;
          const surface = span.dataset.surface || word;
          const sentence = extractSentence(span);
          
          // Coordinate transformation: iframe relative -> window relative
          const rect = span.getBoundingClientRect();
          const viewerRect = viewerRef.current?.getBoundingClientRect();
          const popupWidth = 340;
          const anchorX = (viewerRect?.left ?? 0) + rect.left + rect.width / 2;
          const anchorY = (viewerRect?.top ?? 0) + rect.bottom + 8;

          // If there is enough whitespace on the right side of the reader,
          // center the popup in that area for a more comfortable layout.
          const rightSpaceStart = viewerRect?.right ?? window.innerWidth;
          const rightSpaceWidth = Math.max(0, window.innerWidth - rightSpaceStart);
          const hasUsableRightSpace = rightSpaceWidth >= popupWidth + 56;
          const preferredRightCenterX = rightSpaceStart + rightSpaceWidth / 2;
          
          setWordPopup({
            word,
            surface,
            sentence,
            x: hasUsableRightSpace ? preferredRightCenterX : anchorX,
            y: anchorY,
          });
        } else {
          setWordPopup(null);
        }
      });

      // Display from saved position or beginning
      if (bookMeta.currentCfi) {
        await rendition.display(bookMeta.currentCfi);
      } else {
        await rendition.display();
      }

      // Generate locations for progress tracking
      book.locations.generate(1024).then(() => {
        if (destroyed) return;
        updateProgress(rendition);
      });

      // Track location changes
      rendition.on('relocated', (location: any) => {
        if (destroyed) return;
        const cfi = location?.start?.cfi;
        if (cfi) {
          savePosition(bookMeta.id, cfi);
        }
        updateProgress(rendition);

        // Update chapter title
        const href = location?.start?.href;
        if (href && nav.toc) {
          const chapter = findChapterByHref(nav.toc as TocItem[], href);
          if (chapter) setCurrentChapter(chapter.label);
        }
      });
    }

    init();
    return () => {
      destroyed = true;
      renditionRef.current?.destroy();
      bookRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [bookMeta.id]); // ONLY re-run when book changes

  // Update font size dynamically without full re-render
  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}px`);
  }, [fontSize]);

  function updateProgress(rendition: Rendition) {
    const loc = rendition.currentLocation() as any;
    if (loc?.start?.percentage != null) {
      setProgress(loc.start.percentage);
    }
  }

  async function savePosition(bookId: string, cfi: string) {
    const lib = await loadLibrary();
    const idx = lib.findIndex(b => b.id === bookId);
    if (idx < 0) return;
    const loc = renditionRef.current?.currentLocation() as any;
    lib[idx].currentCfi = cfi;
    lib[idx].lastReadAt = Date.now();
    if (loc?.start?.percentage != null) {
      lib[idx].progress = loc.start.percentage;
    }
    await saveLibrary(lib);
  }

  function findChapterByHref(items: TocItem[], href: string): TocItem | null {
    for (const item of items) {
      if (href.includes(item.href.split('#')[0])) return item;
      if (item.subitems) {
        const sub = findChapterByHref(item.subitems, href);
        if (sub) return sub;
      }
    }
    return null;
  }

  function extractSentence(span: HTMLElement): string {
    const parent = span.closest('p') ?? span.parentElement;
    const fullText = parent?.textContent?.trim() ?? '';
    if (!fullText) return span.textContent ?? '';

    const wordText = span.textContent ?? '';
    const wordIdx = fullText.indexOf(wordText);
    if (wordIdx === -1) return fullText;

    const sentenceEnders = /[.!?…]+[\s"'»)}\]]*|$/g;
    let sentenceStart = 0;
    let sentenceEnd = fullText.length;

    let match;
    while ((match = sentenceEnders.exec(fullText)) !== null) {
      const endPos = match.index + match[0].length;
      if (endPos <= wordIdx) {
        sentenceStart = endPos;
      } else if (match.index >= wordIdx) {
        sentenceEnd = endPos;
        break;
      }
    }

    const sentence = fullText.slice(sentenceStart, sentenceEnd).trim();
    return sentence || fullText;
  }

  function goNext() { renditionRef.current?.next(); }
  function goPrev() { renditionRef.current?.prev(); }

  function navigateToChapter(href: string) {
    renditionRef.current?.display(href);
    setShowToc(false);
  }

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') goPrev();
      if (e.key === 'Escape') setWordPopup(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const analysis = usePageAnalysis(chapterTokens, lexemes);
  const pct = analysis.comprehensionScore;
  const scoreColor = pct >= 90 ? StatsUIColors.green : pct >= 70 ? StatsUIColors.amber : StatsUIColors.red;
  
  const statsRef = useRef<HTMLButtonElement>(null);
  const statsAnchorLeft = statsRef.current ? statsRef.current.getBoundingClientRect().left : 80;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: theme.outerBg,
      color: theme.text,
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        background: theme.surface,
        borderBottom: `1px solid ${theme.border}`,
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', color: theme.text,
          cursor: 'pointer', fontSize: '18px', padding: '4px 8px',
        }}>
          ←
        </button>
        <button onClick={() => setShowToc(!showToc)} style={{
          background: showToc ? theme.accent : 'transparent',
          color: showToc ? '#fff' : theme.text,
          border: `1px solid ${theme.border}`, borderRadius: '6px',
          cursor: 'pointer', fontSize: '12px', padding: '4px 10px',
        }}>
          TOC
        </button>

        <button
          ref={statsRef}
          onClick={() => setShowStats(v => !v)}
          title="Chapter analysis"
          style={{
            background: showStats ? theme.border : 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '2px 8px', cursor: 'pointer',
            transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          <MiniDonut
            known={analysis.counts.known}
            learning={analysis.counts.learning}
            unknown={analysis.counts.unknown}
            total={analysis.counts.total}
          />
          {pct > 0 ? (
            <span style={{ fontWeight: 700, fontSize: '13px', color: scoreColor }}>
              {pct}%
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: theme.text, opacity: 0.5 }}>
              —
            </span>
          )}
        </button>
        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', opacity: 0.7 }}>
          {currentChapter || bookMeta.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setFontSize(s => Math.max(12, s - 2))} style={{
            background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px',
            color: theme.text, cursor: 'pointer', fontSize: '14px', padding: '2px 8px',
          }}>A-</button>
          <span style={{ fontSize: '12px', opacity: 0.5 }}>{fontSize}px</span>
          <button onClick={() => setFontSize(s => Math.min(32, s + 2))} style={{
            background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px',
            color: theme.text, cursor: 'pointer', fontSize: '14px', padding: '2px 8px',
          }}>A+</button>
        </div>
        <span style={{ fontSize: '12px', opacity: 0.5 }}>{Math.round(progress * 100)}%</span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* TOC sidebar */}
        {showToc && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, bottom: 0,
            width: '280px',
            zIndex: 10,
            background: theme.surface,
            borderRight: `1px solid ${theme.border}`,
            boxShadow: '4px 0 16px rgba(0,0,0,0.1)',
            overflowY: 'auto',
            padding: '12px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', opacity: 0.6 }}>
              Table of Contents
            </div>
            {toc.map((item, i) => (
              <div key={i}>
                <div
                  onClick={() => navigateToChapter(item.href)}
                  style={{
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    borderRadius: '4px',
                    color: theme.text,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = theme.border)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {item.label}
                </div>
                {item.subitems?.map((sub, j) => (
                  <div
                    key={j}
                    onClick={() => navigateToChapter(sub.href)}
                    style={{
                      padding: '4px 8px 4px 24px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: theme.text,
                      opacity: 0.7,
                      borderRadius: '4px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = theme.border)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {sub.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Book content */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <div ref={viewerRef} style={{ 
            width: '50%', minWidth: '400px', maxWidth: '800px', height: '100%',
            background: theme.surface,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            borderRadius: '4px',
          }} />
        </div>
      </div>

      {/* Bottom controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        padding: '12px',
        background: theme.outerBg,
      }}>
        <button onClick={goPrev} style={{
          background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px',
          color: theme.text, cursor: 'pointer', padding: '2px 32px', fontSize: '24px', fontWeight: 600,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'background 0.2s',
        }} onMouseEnter={e => (e.currentTarget.style.background = theme.border)} onMouseLeave={e => (e.currentTarget.style.background = theme.surface)}>
          ‹
        </button>
        <button onClick={goNext} style={{
          background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px',
          color: theme.text, cursor: 'pointer', padding: '2px 32px', fontSize: '24px', fontWeight: 600,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'background 0.2s',
        }} onMouseEnter={e => (e.currentTarget.style.background = theme.border)} onMouseLeave={e => (e.currentTarget.style.background = theme.surface)}>
          ›
        </button>
      </div>

      {/* Progress bar */}
      <div style={{
        height: '3px',
        background: theme.border,
        flexShrink: 0,
      }}>
        <div style={{
          width: `${Math.round(progress * 100)}%`,
          height: '100%',
          background: C.green,
          transition: 'width 0.3s',
        }} />
      </div>

      {/* Word popup */}
      {wordPopup && (
        <ReaderWordPopup
          word={wordPopup.word}
          surface={wordPopup.surface}
          sentence={wordPopup.sentence}
          lexeme={lexemes[wordPopup.word] || null}
          settings={settings}
          position={{ x: wordPopup.x, y: wordPopup.y }}
          bookTitle={bookMeta.title}
          bookId={bookMeta.id}
          onClose={() => setWordPopup(null)}
          onStatusChange={(lemma, status) => {
             setLexemes(prev => ({
               ...prev,
               [lemma]: { ...(prev[lemma] ?? { key: lemma, lemma, surface: lemma, status: 'unknown', seenCount: 0, lastSeenAt: 0, createdAt: 0 }), status } as LexemeEntry
             }));
             updateWordUnderlines(renditionRef.current, lemma, status, settings);
          }}
        />
      )}

      {/* Stats Popup */}
      {showStats && (
        <StatsPopup
          analysis={analysis}
          anchorLeft={statsAnchorLeft}
          onClose={() => setShowStats(false)}
          isFixed={false}
        />
      )}
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export function ReaderApp() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [books, setBooks] = useState<EbookMeta[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const theme = THEMES[settings.readerTheme] ?? THEMES.light;

  useEffect(() => {
    Promise.all([
      sendMessage<UserSettings>({ type: 'GET_SETTINGS', payload: null }),
      loadLibrary(),
      initFrequencyTable(),
    ]).then(([s, lib]) => {
      setSettings(s);
      setBooks(lib);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const book = ePub(buffer);
    await book.ready;

    const meta = await book.loaded.metadata;
    const id = crypto.randomUUID();

    let coverUrl: string | undefined;
    try {
      const coverUrlResult = await book.coverUrl();
      if (coverUrlResult) {
        const res = await fetch(coverUrlResult);
        const blob = await res.blob();
        coverUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
    } catch {}

    const entry: EbookMeta = {
      id,
      title: meta.title || file.name.replace(/\.epub$/i, ''),
      author: meta.creator || '',
      coverUrl,
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      progress: 0,
    };

    await storeEpubBlob(id, buffer);

    const lib = await loadLibrary();
    lib.unshift(entry);
    await saveLibrary(lib);
    setBooks(lib);

    book.destroy();
    e.target.value = '';
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await removeEpubBlob(id);
    const lib = (await loadLibrary()).filter(b => b.id !== id);
    await saveLibrary(lib);
    setBooks(lib);
    if (activeBookId === id) setActiveBookId(null);
  }, [activeBookId]);

  const handleOpen = useCallback((id: string) => {
    setActiveBookId(id);
  }, []);

  const handleBack = useCallback(() => {
    setActiveBookId(null);
    loadLibrary().then(setBooks);
  }, []);

  if (loading) {
    return (
      <div style={{
        background: theme.outerBg, minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', color: theme.text,
      }}>
        Loading...
      </div>
    );
  }

  const activeBook = activeBookId ? books.find(b => b.id === activeBookId) : null;

  return (
    <div style={{ background: theme.outerBg, minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {activeBook ? (
        <ReaderView
          bookMeta={activeBook}
          settings={settings}
          onBack={handleBack}
          theme={theme}
        />
      ) : (
        <LibraryView
          books={books}
          onOpen={handleOpen}
          onImport={handleImport}
          onDelete={handleDelete}
          theme={theme}
        />
      )}
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

