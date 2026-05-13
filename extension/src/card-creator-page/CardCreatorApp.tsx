import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sendMessage, type FlashcardMediaOp } from '../shared/messages';
import type { FlashcardPayload, LexemeEntry, UserSettings, WordStatus } from '../shared/types';
import { DEFAULT_SETTINGS, userScopedKey } from '../shared/storage';
import {
  cardMatchesCollection,
  resolveCardCollectionLabel,
  resolvePreferredCollectionId,
} from '../shared/flashcards';

const C = {
  bg: '#F5F1E9',
  sidebar: '#FFFFFF',
  panel: '#FFFFFF',
  panelAlt: '#F5F1E9',
  line: '#E2DACE',
  text: '#4A3B2C',
  muted: '#877666',
  accent: '#98C1D9',
  accentSoft: '#E8F0F6',
  success: '#A8B693',
  danger: '#D97762',
  warning: '#E9C46A',
  input: '#FFFFFF',
  inputAlt: '#F5F1E9',
  button: '#E2DACE',
  buttonPrimary: '#98C1D9',
};

interface CollectionItem {
  collectionId: number;
  name: string;
}

interface WordBrowserEntry {
  lemma: string;
  status: WordStatus;
  updatedAt: number;
}

type AppPanel = 'home' | 'flashcards' | 'dictionary';
type DictionaryView = 'lookup' | 'word-browser';
type EditorMode = 'create' | 'edit';
type KnowledgeStatusValue = 'KNOWN' | 'LEARNING' | 'UNKNOWN' | 'IGNORED';

const KNOWLEDGE_STATUSES: KnowledgeStatusValue[] = ['LEARNING', 'KNOWN', 'UNKNOWN', 'IGNORED'];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read file.'));
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function normalizeWordStatus(value: string): WordStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'known' || normalized === 'learning' || normalized === 'ignored') return normalized;
  return 'unknown';
}

function statusColor(status: WordStatus): string {
  if (status === 'known') return C.success;
  if (status === 'learning') return C.warning;
  if (status === 'ignored') return C.muted;
  return C.danger;
}

export function CardCreatorApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialMode: EditorMode = params.get('mode') === 'edit' ? 'edit' : 'create';
  const initialPanelParam = params.get('panel');
  const initialPanel: AppPanel =
    initialPanelParam === 'home' || initialPanelParam === 'flashcards' || initialPanelParam === 'dictionary'
      ? initialPanelParam
      : 'dictionary';
  const draftKey = params.get('draftKey');
  const initialWord = params.get('word') ?? '';
  const initialSentence = params.get('sentence') ?? '';
  const initialSourceUrl = params.get('sourceUrl') ?? '';
  const initialSourceTitle = params.get('sourceTitle') ?? '';
  const initialTranslation = params.get('trMeaning') ?? '';

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardPayload[]>([]);
  const [wordEntries, setWordEntries] = useState<WordBrowserEntry[]>([]);

  const [activePanel, setActivePanel] = useState<AppPanel>(initialPanel);
  const [dictionaryView, setDictionaryView] = useState<DictionaryView>('lookup');
  const [editorMode, setEditorMode] = useState<EditorMode>(initialMode);
  const [editingCard, setEditingCard] = useState<FlashcardPayload | null>(null);

  const [search, setSearch] = useState(initialWord);
  const [targetWord, setTargetWord] = useState(initialWord);
  const [sentence, setSentence] = useState(initialSentence);
  const [exampleSentence, setExampleSentence] = useState('');
  const [translation, setTranslation] = useState(initialTranslation);
  const [knowledgeStatus, setKnowledgeStatus] = useState<KnowledgeStatusValue>('LEARNING');
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [sourceTitle, setSourceTitle] = useState(initialSourceTitle);

  const [dictionaryResults, setDictionaryResults] = useState<string[]>([]);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [wordBrowserSearch, setWordBrowserSearch] = useState('');
  const [wordBrowserPage, setWordBrowserPage] = useState(0);
  const WORDS_PER_PAGE = 10;
  const [flashcardFilter, setFlashcardFilter] = useState<number | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const [screenshotPreview, setScreenshotPreview] = useState<string | undefined>(undefined);
  const [audioPreview, setAudioPreview] = useState<string | undefined>(undefined);
  const [audioReplacementDataUrl, setAudioReplacementDataUrl] = useState<string | undefined>(undefined);
  const [mediaOps, setMediaOps] = useState<{ screenshot: FlashcardMediaOp; audio: FlashcardMediaOp }>({
    screenshot: 'keep',
    audio: 'keep',
  });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const collectionNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const coll of collections) map[coll.collectionId] = coll.name;
    return map;
  }, [collections]);

  const filteredWordEntries = useMemo(() => {
    const query = wordBrowserSearch.trim().toLowerCase();
    return wordEntries
      .filter(entry => !query || entry.lemma.includes(query))
      .sort((a, b) => a.lemma.localeCompare(b.lemma));
  }, [wordEntries, wordBrowserSearch]);

  const filteredFlashcards = useMemo(() => {
    if (flashcardFilter == null) return flashcards;
    return flashcards.filter(card => cardMatchesCollection(card, flashcardFilter));
  }, [flashcards, flashcardFilter]);

  const selectedCollectionName = useMemo(
    () => collections.find(c => c.collectionId === selectedCollectionId)?.name ?? null,
    [collections, selectedCollectionId]
  );

  const loadCollections = useCallback(async () => {
    const result = await sendMessage<{ ok: boolean; collections?: CollectionItem[] }>({
      type: 'FETCH_COLLECTIONS',
      payload: null,
    }).catch(() => ({ ok: false as const }));
    if (result.ok) setCollections(result.collections ?? []);
  }, []);

  const loadFlashcards = useCallback(async (currentSettings: UserSettings) => {
    setListLoading(true);
    try {
      const result = await sendMessage<{ ok: boolean; cards?: FlashcardPayload[]; error?: string }>({
        type: 'FETCH_FLASHCARDS',
        payload: null,
      });
      if (result.ok) {
        setFlashcards(result.cards ?? []);
        return;
      }
      throw new Error(result.error ?? 'Could not fetch flashcards');
    } catch {
      const key = userScopedKey('flashcards', currentSettings.authUserId);
      const cache = await chrome.storage.local.get(key);
      setFlashcards((cache[key] ?? []) as FlashcardPayload[]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadWordBrowser = useCallback(async (currentSettings: UserSettings) => {
    const key = userScopedKey('lexemes', currentSettings.authUserId);
    const result = await chrome.storage.local.get(key);
    const lexemes = Object.values((result[key] ?? {}) as Record<string, LexemeEntry>);
    setWordEntries(lexemes.map(entry => ({
      lemma: entry.lemma,
      status: entry.status,
      updatedAt: entry.lastSeenAt ?? entry.createdAt ?? 0,
    })));
  }, []);

  const loadCardIntoEditor = useCallback((card: FlashcardPayload, fallbackCollectionId: number | null) => {
    const word = card.surfaceForm || card.lemma || '';
    setEditorMode('edit');
    setEditingCard(card);
    setSearch(word);
    setTargetWord(word);
    setSentence(card.sentence || '');
    setExampleSentence(card.exampleSentence || '');
    setTranslation(card.trMeaning || '');
    setKnowledgeStatus(card.knowledgeStatus ?? 'LEARNING');
    setSourceUrl(card.sourceUrl || '');
    setSourceTitle(card.sourceTitle || '');
    setSelectedCollectionId(resolvePreferredCollectionId(card, fallbackCollectionId));
    setScreenshotPreview(card.screenshotDataUrl);
    setAudioPreview(card.audioUrl);
    setAudioReplacementDataUrl(undefined);
    setMediaOps({ screenshot: 'keep', audio: 'keep' });
    setSaveMsg(null);
    setActivePanel('dictionary');
    setDictionaryView('lookup');
  }, []);

  const resetEditorToCreateMode = useCallback(() => {
    setEditorMode('create');
    setEditingCard(null);
    setExampleSentence('');
    setKnowledgeStatus('LEARNING');
    setSelectedCollectionId(settings.activeCollectionId);
    setScreenshotPreview(undefined);
    setAudioPreview(undefined);
    setAudioReplacementDataUrl(undefined);
    setMediaOps({ screenshot: 'keep', audio: 'keep' });
    setSaveMsg(null);
  }, [settings.activeCollectionId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const currentSettings = await sendMessage<UserSettings>({ type: 'GET_SETTINGS', payload: null });
        if (cancelled) return;
        setSettings(currentSettings);
        setSelectedCollectionId(currentSettings.activeCollectionId);

        await Promise.all([
          loadCollections(),
          loadFlashcards(currentSettings),
          loadWordBrowser(currentSettings),
        ]);
        if (cancelled) return;

        if (initialMode === 'edit' && draftKey) {
          const draftResult = await chrome.storage.local.get(draftKey);
          await chrome.storage.local.remove(draftKey);
          if (cancelled) return;
          const draft = draftResult[draftKey] as FlashcardPayload | undefined;
          if (draft) {
            loadCardIntoEditor(draft, currentSettings.activeCollectionId);
          } else {
            setSaveMsg({ text: 'Could not load flashcard draft.', ok: false });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftKey, initialMode, loadCardIntoEditor, loadCollections, loadFlashcards, loadWordBrowser]);

  useEffect(() => {
    if (!search.trim()) {
      setDictionaryResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setDictionaryLoading(true);
      try {
        const result = await sendMessage<{ translations: string[] }>({
          type: 'LOOKUP_DICTIONARY',
          payload: { word: search.trim() },
        });
        setDictionaryResults(result.translations ?? []);
      } catch {
        setDictionaryResults([]);
      } finally {
        setDictionaryLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!settings.authUserId) return;
    const flashcardsKey = userScopedKey('flashcards', settings.authUserId);
    const lexemesKey = userScopedKey('lexemes', settings.authUserId);

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      if (changes[flashcardsKey]?.newValue) {
        setFlashcards((changes[flashcardsKey].newValue ?? []) as FlashcardPayload[]);
      }
      if (changes[lexemesKey]?.newValue) {
        const entries = Object.values((changes[lexemesKey].newValue ?? {}) as Record<string, LexemeEntry>);
        setWordEntries(entries.map(entry => ({
          lemma: entry.lemma,
          status: entry.status,
          updatedAt: entry.lastSeenAt ?? entry.createdAt ?? 0,
        })));
      }
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [settings.authUserId]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const updateWordStatus = useCallback(async (lemma: string, status: WordStatus) => {
    const result = await sendMessage<{ ok: boolean; error?: string }>({
      type: 'UPSERT_WORD_KNOWLEDGE',
      payload: { lemma, status },
    });
    if (!result.ok) throw new Error(result.error ?? 'Could not update word.');
  }, []);

  const handleScreenshotReplace = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setScreenshotPreview(dataUrl);
    setMediaOps(prev => ({ ...prev, screenshot: 'replace' }));
    event.target.value = '';
  }, []);

  const handleAudioReplace = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setAudioPreview(dataUrl);
    setAudioReplacementDataUrl(dataUrl);
    setMediaOps(prev => ({ ...prev, audio: 'replace' }));
    event.target.value = '';
  }, []);

  const resetScreenshotMedia = useCallback(() => {
    if (editingCard?.screenshotDataUrl) {
      setScreenshotPreview(editingCard.screenshotDataUrl);
      setMediaOps(prev => ({ ...prev, screenshot: 'keep' }));
      return;
    }
    setScreenshotPreview(undefined);
    setMediaOps(prev => ({ ...prev, screenshot: 'keep' }));
  }, [editingCard?.screenshotDataUrl]);

  const resetAudioMedia = useCallback(() => {
    if (editingCard?.audioUrl) {
      setAudioPreview(editingCard.audioUrl);
      setAudioReplacementDataUrl(undefined);
      setMediaOps(prev => ({ ...prev, audio: 'keep' }));
      return;
    }
    setAudioPreview(undefined);
    setAudioReplacementDataUrl(undefined);
    setMediaOps(prev => ({ ...prev, audio: 'keep' }));
  }, [editingCard?.audioUrl]);

  const handleSave = useCallback(async () => {
    if (!targetWord.trim()) return;
    setSaving(true);
    setSaveMsg(null);

    const normalizedWord = targetWord.trim();
    const card: FlashcardPayload = {
      id: editingCard?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      lemma: normalizedWord.toLowerCase(),
      surfaceForm: normalizedWord,
      sentence: sentence.trim(),
      exampleSentence: exampleSentence.trim(),
      sourceUrl,
      sourceTitle,
      trMeaning: translation.trim() || dictionaryResults[0] || '',
      knowledgeStatus,
      createdAt: editingCard?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      deckName: selectedCollectionName ?? settings.activeCollectionName ?? settings.ankiDeckName ?? 'Syntagma',
      tags: editingCard?.tags ?? ['syntagma', 'workspace-creator'],
      collectionId: selectedCollectionId,
      collectionIds: editingCard?.collectionIds ?? [],
      screenshotDataUrl:
        mediaOps.screenshot === 'replace'
          ? screenshotPreview
          : mediaOps.screenshot === 'remove'
            ? undefined
            : screenshotPreview,
      audioUrl: mediaOps.audio === 'remove' ? undefined : audioPreview,
      sentenceAudioDataUrl: mediaOps.audio === 'replace' ? audioReplacementDataUrl : undefined,
    };

    try {
      if (editorMode === 'edit' && editingCard) {
        const result = await sendMessage<{ ok: boolean; card?: FlashcardPayload; error?: string }>({
          type: 'UPDATE_FLASHCARD',
          payload: {
            id: editingCard.id,
            card,
            selectedCollectionId,
            mediaOps,
          },
        });
        if (!result.ok) throw new Error(result.error ?? 'Could not update card');
        if (result.card) {
          setFlashcards(prev => prev.map(item => (item.id === result.card!.id ? result.card! : item)));
          loadCardIntoEditor(result.card, selectedCollectionId);
        }
        setSaveMsg({ text: 'Flashcard updated.', ok: true });
      } else {
        const result = await sendMessage<{ ok: boolean; card?: FlashcardPayload; error?: string }>({
          type: 'CREATE_FLASHCARD',
          payload: card,
        });
        if (!result.ok) throw new Error(result.error ?? 'Could not create card');
        if (result.card) {
          setFlashcards(prev => [result.card!, ...prev]);
        }
        setSaveMsg({ text: 'Flashcard created.', ok: true });
      }
    } catch (error) {
      setSaveMsg({ text: (error as Error).message, ok: false });
    } finally {
      setSaving(false);
    }
  }, [
    audioPreview,
    audioReplacementDataUrl,
    dictionaryResults,
    editorMode,
    editingCard,
    exampleSentence,
    knowledgeStatus,
    loadCardIntoEditor,
    mediaOps,
    screenshotPreview,
    selectedCollectionId,
    selectedCollectionName,
    sentence,
    settings.activeCollectionName,
    settings.ankiDeckName,
    sourceTitle,
    sourceUrl,
    targetWord,
    translation,
  ]);

  const navButtonStyle = (active: boolean): React.CSSProperties => ({
    background: active ? C.accentSoft : 'transparent',
    color: active ? C.accent : C.muted,
    border: `1px solid ${active ? C.accentSoft : 'transparent'}`,
    borderRadius: '8px',
    width: '100%',
    textAlign: 'left',
    padding: '9px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: active ? 700 : 500,
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.input,
    border: `1px solid ${C.line}`,
    borderRadius: '8px',
    color: C.text,
    padding: '10px 12px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const sectionLabelStyle: React.CSSProperties = {
    color: C.muted,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: '6px',
    display: 'block',
  };

  if (loading) {
    return (
      <div style={{ background: C.bg, color: C.muted, height: '100vh', display: 'grid', placeItems: 'center' }}>
        Loading workspace...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: C.bg,
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden',
    }}>
      <aside style={{
        width: '210px',
        background: C.sidebar,
        borderRight: `1px solid ${C.line}`,
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: C.accent }}>Syntagma</div>
          <div style={{ color: C.muted, fontSize: '11px' }}>Workspace</div>
        </div>

        <button style={navButtonStyle(activePanel === 'home')} onClick={() => setActivePanel('home')}>
          Home
        </button>
        <button style={navButtonStyle(activePanel === 'flashcards')} onClick={() => setActivePanel('flashcards')}>
          Flashcards
        </button>
        <button style={navButtonStyle(activePanel === 'dictionary')} onClick={() => setActivePanel('dictionary')}>
          Dictionary + Card Edit
        </button>
        <button
          style={navButtonStyle(false)}
          onClick={() => sendMessage({ type: 'OPEN_READER', payload: null }).catch(() => { })}
        >
          Open eBook Reader
        </button>

        <div style={{ flex: 1 }} />
        <button
          style={navButtonStyle(false)}
          onClick={() => sendMessage({ type: 'OPEN_OPTIONS_PAGE', payload: null }).catch(() => { })}
        >
          Settings
        </button>
        <button
          style={{
            ...navButtonStyle(false),
            color: C.danger,
            border: `1px solid ${C.danger}40`,
          }}
          onClick={async () => {
            await sendMessage({ type: 'LOGOUT', payload: null });
            window.close();
          }}
        >
          Sign Out
        </button>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{
          height: '58px',
          borderBottom: `1px solid ${C.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: C.panelAlt,
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>
              {activePanel === 'home' && 'Home'}
              {activePanel === 'flashcards' && 'Flashcards'}
              {activePanel === 'dictionary' && 'Dictionary + Card Edit'}
            </div>
            <div style={{ color: C.muted, fontSize: '11px' }}>
              {settings.authEmail ?? 'Not logged in'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {editorMode === 'edit' && (
              <button
                style={{
                  background: C.button,
                  border: `1px solid ${C.line}`,
                  color: C.text,
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
                onClick={resetEditorToCreateMode}
              >
                New Card
              </button>
            )}
            <button
              style={{
                background: 'transparent',
                border: `1px solid ${C.line}`,
                color: C.muted,
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              onClick={() => window.close()}
            >
              Close
            </button>
          </div>
        </header>

        {activePanel === 'home' && (
          <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
            <div style={{
              background: C.panel,
              border: `1px solid ${C.line}`,
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '860px',
            }}>
              <h1 style={{ margin: 0, fontSize: '28px', lineHeight: 1.2 }}>Welcome to your Syntagma workspace</h1>
              <p style={{ marginTop: '12px', color: C.muted, maxWidth: '620px', lineHeight: 1.6 }}>
                Look up words, browse your flashcards, edit cards (including image/audio), and jump into the reader from one place.
              </p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                <button style={{ ...navButtonStyle(false), width: 'auto' }} onClick={() => setActivePanel('dictionary')}>
                  Go To Dictionary + Card Edit
                </button>
                <button style={{ ...navButtonStyle(false), width: 'auto' }} onClick={() => setActivePanel('flashcards')}>
                  Open Flashcards
                </button>
              </div>
            </div>
          </div>
        )}

        {activePanel === 'flashcards' && (
          <div style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
            <div style={{ marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                onClick={() => setFlashcardFilter(null)}
                style={{
                  background: flashcardFilter == null ? C.accentSoft : C.input,
                  color: flashcardFilter == null ? C.accent : C.text,
                  border: `1px solid ${C.line}`,
                  borderRadius: '999px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {collections.map(collection => (
                <button
                  key={collection.collectionId}
                  onClick={() => setFlashcardFilter(collection.collectionId)}
                  style={{
                    background: flashcardFilter === collection.collectionId ? C.accentSoft : C.input,
                    color: flashcardFilter === collection.collectionId ? C.accent : C.text,
                    border: `1px solid ${C.line}`,
                    borderRadius: '999px',
                    padding: '5px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {collection.name}
                </button>
              ))}
            </div>

            {listLoading ? (
              <div style={{ color: C.muted, padding: '20px 0' }}>Loading flashcards...</div>
            ) : filteredFlashcards.length === 0 ? (
              <div style={{ color: C.muted, padding: '24px 0' }}>No flashcards found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredFlashcards.map(card => (
                  <div
                    key={card.id}
                    style={{
                      background: C.panel,
                      border: `1px solid ${C.line}`,
                      borderRadius: '10px',
                      padding: '10px',
                      display: 'flex',
                      gap: '10px',
                    }}
                  >
                    {(card.screenshotDataUrl || card.audioUrl) && (
                      <div style={{ width: '92px', flexShrink: 0 }}>
                        {card.screenshotDataUrl && (
                          <img
                            src={card.screenshotDataUrl}
                            alt="card screenshot"
                            style={{ width: '92px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: `1px solid ${C.line}` }}
                          />
                        )}
                        {card.audioUrl && (
                          <audio controls style={{ width: '92px', marginTop: '6px', height: '22px' }}>
                            <source src={card.audioUrl} />
                          </audio>
                        )}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '15px' }}>{card.surfaceForm || card.lemma}</div>
                      <div style={{ color: C.accent, fontSize: '13px', marginTop: '2px' }}>{card.trMeaning}</div>
                      <div style={{ color: C.muted, fontSize: '12px', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {card.sentence}
                      </div>
                      <div style={{ color: C.muted, fontSize: '11px', marginTop: '4px' }}>
                        {resolveCardCollectionLabel(card, collectionNameById)}
                      </div>
                    </div>
                    <button
                      onClick={() => loadCardIntoEditor(card, settings.activeCollectionId)}
                      style={{
                        alignSelf: 'start',
                        background: C.button,
                        border: `1px solid ${C.line}`,
                        color: C.text,
                        borderRadius: '8px',
                        fontSize: '12px',
                        padding: '6px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activePanel === 'dictionary' && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <section style={{
              width: '45%',
              minWidth: '330px',
              borderRight: `1px solid ${C.line}`,
              background: C.panelAlt,
              padding: '16px',
              overflow: 'auto',
            }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button
                  onClick={() => setDictionaryView('lookup')}
                  style={{
                    flex: 1,
                    background: dictionaryView === 'lookup' ? C.accentSoft : C.input,
                    color: dictionaryView === 'lookup' ? C.accent : C.text,
                    border: `1px solid ${C.line}`,
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Dictionary
                </button>
                <button
                  onClick={() => setDictionaryView('word-browser')}
                  style={{
                    flex: 1,
                    background: dictionaryView === 'word-browser' ? C.accentSoft : C.input,
                    color: dictionaryView === 'word-browser' ? C.accent : C.text,
                    border: `1px solid ${C.line}`,
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Word Browser
                </button>
              </div>

              {dictionaryView === 'lookup' ? (
                <>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={event => { setSearch(event.target.value); setTargetWord(event.target.value); }}
                    placeholder="Search keyword..."
                    style={{ ...inputStyle, marginBottom: '10px' }}
                  />

                  {targetWord.trim() && (
                    <div style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>{targetWord.trim()}</div>
                  )}

                  <div style={{ marginBottom: '14px' }}>
                    <span style={sectionLabelStyle}>Translations</span>
                    {dictionaryLoading ? (
                      <div style={{ color: C.muted, fontSize: '12px' }}>Looking up dictionary...</div>
                    ) : dictionaryResults.length ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {dictionaryResults.map(result => (
                          <button
                            key={result}
                            onClick={() => setTranslation(result)}
                            style={{
                              background: translation === result ? C.accentSoft : C.input,
                              color: translation === result ? C.accent : C.text,
                              border: `1px solid ${C.line}`,
                              borderRadius: '999px',
                              padding: '6px 10px',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            {result}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: C.muted, fontSize: '12px' }}>
                        {search.trim() ? 'No translation found.' : 'Type a word to search.'}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <span style={sectionLabelStyle}>Sentence</span>
                    <div style={{ background: C.input, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '10px 12px', minHeight: '70px', color: C.text }}>
                      {sentence || 'No sentence selected yet.'}
                    </div>
                  </div>

                  <div>
                    <span style={sectionLabelStyle}>Source</span>
                    <div style={{ color: C.muted, fontSize: '12px' }}>{sourceTitle || sourceUrl || 'Unknown source'}</div>
                  </div>
                </>
              ) : (
                <>
                  <input
                    value={wordBrowserSearch}
                    onChange={event => { setWordBrowserSearch(event.target.value); setWordBrowserPage(0); }}
                    placeholder="Filter words..."
                    style={{ ...inputStyle, marginBottom: '10px' }}
                  />
                  {(() => {
                    const totalPages = Math.max(1, Math.ceil(filteredWordEntries.length / WORDS_PER_PAGE));
                    const safePage = Math.min(wordBrowserPage, totalPages - 1);
                    const startIdx = safePage * WORDS_PER_PAGE;
                    const pageEntries = filteredWordEntries.slice(startIdx, startIdx + WORDS_PER_PAGE);
                    return (
                      <>
                        <div style={{ color: C.muted, fontSize: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{filteredWordEntries.length} tracked words</span>
                          {totalPages > 1 && (
                            <span>Page {safePage + 1} / {totalPages}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                          {pageEntries.map(entry => (
                            <div
                              key={entry.lemma}
                              style={{
                                background: C.input,
                                border: `1px solid ${C.line}`,
                                borderRadius: '8px',
                                padding: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                              }}
                            >
                              <span style={{ fontWeight: 600, fontSize: '13px', flex: 1 }}>{entry.lemma}</span>
                              <select
                                value={entry.status}
                                onChange={async event => {
                                  const nextStatus = normalizeWordStatus(event.target.value);
                                  setWordEntries(prev => prev.map(item => (
                                    item.lemma === entry.lemma
                                      ? { ...item, status: nextStatus, updatedAt: Date.now() }
                                      : item
                                  )));
                                  try {
                                    await updateWordStatus(entry.lemma, nextStatus);
                                  } catch (error) {
                                    setSaveMsg({ text: (error as Error).message, ok: false });
                                    setWordEntries(prev => prev.map(item => (
                                      item.lemma === entry.lemma ? entry : item
                                    )));
                                  }
                                }}
                                style={{
                                  background: C.inputAlt,
                                  color: statusColor(entry.status),
                                  border: `1px solid ${C.line}`,
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  padding: '4px 6px',
                                }}
                              >
                                <option value="unknown">unknown</option>
                                <option value="learning">learning</option>
                                <option value="known">known</option>
                                <option value="ignored">ignored</option>
                              </select>
                            </div>
                          ))}
                        </div>
                        {totalPages > 1 && (
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '12px' }}>
                            <button
                              disabled={safePage === 0}
                              onClick={() => setWordBrowserPage(0)}
                              style={{
                                background: C.button, border: `1px solid ${C.line}`, borderRadius: '6px',
                                padding: '4px 10px', cursor: safePage === 0 ? 'default' : 'pointer',
                                opacity: safePage === 0 ? 0.4 : 1, fontSize: '12px', color: C.text,
                              }}
                            >
                              ««
                            </button>
                            <button
                              disabled={safePage === 0}
                              onClick={() => setWordBrowserPage(p => Math.max(0, p - 1))}
                              style={{
                                background: C.button, border: `1px solid ${C.line}`, borderRadius: '6px',
                                padding: '4px 10px', cursor: safePage === 0 ? 'default' : 'pointer',
                                opacity: safePage === 0 ? 0.4 : 1, fontSize: '12px', color: C.text,
                              }}
                            >
                              ‹ Prev
                            </button>
                            <button
                              disabled={safePage >= totalPages - 1}
                              onClick={() => setWordBrowserPage(p => Math.min(totalPages - 1, p + 1))}
                              style={{
                                background: C.button, border: `1px solid ${C.line}`, borderRadius: '6px',
                                padding: '4px 10px', cursor: safePage >= totalPages - 1 ? 'default' : 'pointer',
                                opacity: safePage >= totalPages - 1 ? 0.4 : 1, fontSize: '12px', color: C.text,
                              }}
                            >
                              Next ›
                            </button>
                            <button
                              disabled={safePage >= totalPages - 1}
                              onClick={() => setWordBrowserPage(totalPages - 1)}
                              style={{
                                background: C.button, border: `1px solid ${C.line}`, borderRadius: '6px',
                                padding: '4px 10px', cursor: safePage >= totalPages - 1 ? 'default' : 'pointer',
                                opacity: safePage >= totalPages - 1 ? 0.4 : 1, fontSize: '12px', color: C.text,
                              }}
                            >
                              »»
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </section>

            <section style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <span style={sectionLabelStyle}>Deck</span>
                  <select
                    value={selectedCollectionId ?? ''}
                    onChange={event => {
                      const value = event.target.value;
                      setSelectedCollectionId(value ? Number(value) : null);
                    }}
                    style={inputStyle}
                  >
                    <option value="">No deck (unsorted)</option>
                    {collections.map(collection => (
                      <option key={collection.collectionId} value={collection.collectionId}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span style={sectionLabelStyle}>Knowledge Status</span>
                  <select
                    value={knowledgeStatus}
                    onChange={event => setKnowledgeStatus(event.target.value as KnowledgeStatusValue)}
                    style={inputStyle}
                  >
                    {KNOWLEDGE_STATUSES.map(item => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={sectionLabelStyle}>Target Word</span>
                <input
                  value={targetWord}
                  onChange={event => setTargetWord(event.target.value)}
                  placeholder="The word you want to learn"
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={sectionLabelStyle}>Source Sentence</span>
                <textarea
                  value={sentence}
                  onChange={event => setSentence(event.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  placeholder="Sentence the target word is in"
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={sectionLabelStyle}>Example Sentence</span>
                <textarea
                  value={exampleSentence}
                  onChange={event => setExampleSentence(event.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  placeholder="Optional example sentence"
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <span style={sectionLabelStyle}>Translation</span>
                <textarea
                  value={translation}
                  onChange={event => setTranslation(event.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  placeholder="Meaning in Turkish"
                />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginBottom: '12px',
              }}>
                <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '10px', padding: '10px' }}>
                  <span style={sectionLabelStyle}>Image</span>
                  {screenshotPreview ? (
                    <img
                      src={screenshotPreview}
                      alt="Flashcard image"
                      style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '6px', border: `1px solid ${C.line}` }}
                    />
                  ) : (
                    <div style={{ background: C.input, border: `1px solid ${C.line}`, borderRadius: '6px', height: '110px', display: 'grid', placeItems: 'center', color: C.muted, fontSize: '12px' }}>
                      No image
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button
                      onClick={() => screenshotInputRef.current?.click()}
                      style={{ flex: 1, background: C.button, color: C.text, border: `1px solid ${C.line}`, borderRadius: '6px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Replace
                    </button>
                    <button
                      onClick={() => { setScreenshotPreview(undefined); setMediaOps(prev => ({ ...prev, screenshot: 'remove' })); }}
                      style={{ flex: 1, background: C.input, color: C.danger, border: `1px solid ${C.line}`, borderRadius: '6px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                    <button
                      onClick={resetScreenshotMedia}
                      style={{ flex: 1, background: C.input, color: C.muted, border: `1px solid ${C.line}`, borderRadius: '6px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Keep
                    </button>
                  </div>
                  <input
                    ref={screenshotInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleScreenshotReplace}
                  />
                </div>

                <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '10px', padding: '10px' }}>
                  <span style={sectionLabelStyle}>Audio</span>
                  {audioPreview ? (
                    <audio controls style={{ width: '100%', marginTop: '6px' }}>
                      <source src={audioPreview} />
                    </audio>
                  ) : (
                    <div style={{ background: C.input, border: `1px solid ${C.line}`, borderRadius: '6px', height: '110px', display: 'grid', placeItems: 'center', color: C.muted, fontSize: '12px' }}>
                      No audio
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button
                      onClick={() => audioInputRef.current?.click()}
                      style={{ flex: 1, background: C.button, color: C.text, border: `1px solid ${C.line}`, borderRadius: '6px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Replace
                    </button>
                    <button
                      onClick={() => {
                        setAudioPreview(undefined);
                        setAudioReplacementDataUrl(undefined);
                        setMediaOps(prev => ({ ...prev, audio: 'remove' }));
                      }}
                      style={{ flex: 1, background: C.input, color: C.danger, border: `1px solid ${C.line}`, borderRadius: '6px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                    <button
                      onClick={resetAudioMedia}
                      style={{ flex: 1, background: C.input, color: C.muted, border: `1px solid ${C.line}`, borderRadius: '6px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Keep
                    </button>
                  </div>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    style={{ display: 'none' }}
                    onChange={handleAudioReplace}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleSave}
                  disabled={saving || !targetWord.trim()}
                  style={{
                    flex: 1,
                    background: saving ? C.input : C.buttonPrimary,
                    color: saving ? C.muted : '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: saving || !targetWord.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : editorMode === 'edit' ? 'Save Changes' : 'Create Card'}
                </button>
              </div>

              {saveMsg && (
                <div style={{
                  marginTop: '10px',
                  background: saveMsg.ok ? `${C.success}33` : `${C.danger}33`,
                  color: saveMsg.ok ? C.success : C.danger,
                  border: `1px solid ${saveMsg.ok ? C.success : C.danger}`,
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}>
                  {saveMsg.text}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
