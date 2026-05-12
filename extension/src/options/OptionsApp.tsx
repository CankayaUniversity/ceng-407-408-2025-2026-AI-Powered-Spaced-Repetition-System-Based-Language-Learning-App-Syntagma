import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { UserSettings, LexemeEntry, FlashcardPayload, WordStatus } from '../shared/types';
import { DEFAULT_SETTINGS, userScopedKey } from '../shared/storage';
import { sendMessage } from '../shared/messages';

const C = {
  base: '#F5F1E9',
  mantle: '#ECE7DD',
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
  yellow: '#E6C280',
};

// ─── Shared UI primitives ────────────────────────────────────────────────────

function Toggle({ value, onChange, label, description }: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: `1px solid ${C.surface1}`,
    }}>
      <div>
        <div style={{ fontSize: '14px', color: C.text }}>{label}</div>
        {description && <div style={{ fontSize: '12px', color: C.subtext, marginTop: '2px' }}>{description}</div>}
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: '40px',
          height: '22px',
          background: value ? C.blue : C.surface1,
          borderRadius: '11px',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 0.2s',
          flexShrink: 0,
          marginLeft: '16px',
        }}
      >
        <div style={{
          position: 'absolute',
          top: '3px',
          left: value ? '21px' : '3px',
          width: '16px',
          height: '16px',
          background: C.text,
          borderRadius: '50%',
          transition: 'left 0.2s',
        }} />
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, type = 'text', placeholder, description }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  description?: string;
}) {
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.surface1}` }}>
      <label style={{ display: 'block', fontSize: '14px', color: C.text, marginBottom: '6px' }}>{label}</label>
      {description && <div style={{ fontSize: '12px', color: C.subtext, marginBottom: '6px' }}>{description}</div>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: C.surface0,
          border: `1px solid ${C.surface1}`,
          borderRadius: '6px',
          padding: '8px 10px',
          color: C.text,
          fontSize: '13px',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function Select({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.surface1}` }}>
      <label style={{ display: 'block', fontSize: '14px', color: C.text, marginBottom: '6px' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: C.surface0,
          border: `1px solid ${C.surface1}`,
          borderRadius: '6px',
          padding: '8px 10px',
          color: C.text,
          fontSize: '13px',
          outline: 'none',
          width: '100%',
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

interface CollectionItem {
  collectionId: number;
  name: string;
  createdAt: string;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      color: C.blue,
      fontSize: '13px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginTop: '20px',
      marginBottom: '4px',
    }}>
      {children}
    </h3>
  );
}

// ─── Tab: General ────────────────────────────────────────────────────────────

function ActiveDeckSelector({ settings, onUpdate }: { settings: UserSettings; onUpdate: (p: Partial<UserSettings>) => void }) {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchCollections = useCallback(async () => {
    if (!settings.authToken) return;
    try {
      const result = await sendMessage<{ ok: boolean; collections?: CollectionItem[]; error?: string }>({
        type: 'FETCH_COLLECTIONS',
        payload: null,
      });
      if (result.ok) setCollections(result.collections ?? []);
    } catch {}
  }, [settings.authToken]);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  const handleChange = (collId: string) => {
    if (collId === '') {
      onUpdate({ activeCollectionId: null, activeCollectionName: null });
    } else {
      const id = Number(collId);
      const name = collections.find(c => c.collectionId === id)?.name ?? null;
      onUpdate({ activeCollectionId: id, activeCollectionName: name });
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const result = await sendMessage<{ ok: boolean; collection?: CollectionItem; error?: string }>({
        type: 'CREATE_COLLECTION',
        payload: { name: newName.trim() },
      });
      if (result.ok && result.collection) {
        setCollections(prev => [result.collection!, ...prev]);
        onUpdate({ activeCollectionId: result.collection.collectionId, activeCollectionName: result.collection.name });
        setNewName('');
      }
    } catch {}
    setCreating(false);
  };

  if (!settings.authToken) {
    return <div style={{ fontSize: '12px', color: C.subtext, padding: '8px 0' }}>Log in to use decks.</div>;
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
        <select
          value={settings.activeCollectionId ?? ''}
          onChange={e => handleChange(e.target.value)}
          style={{
            flex: 1,
            background: C.surface0,
            border: `1px solid ${C.surface1}`,
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '13px',
            color: C.text,
            outline: 'none',
          }}
        >
          <option value="">No deck (unsorted)</option>
          {collections.map(c => (
            <option key={c.collectionId} value={c.collectionId}>{c.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Create new deck…"
          style={{
            flex: 1,
            background: C.surface0,
            border: `1px solid ${C.surface1}`,
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            color: C.text,
            outline: 'none',
          }}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          style={{
            background: C.green,
            color: C.base,
            border: 'none',
            borderRadius: '4px',
            padding: '4px 10px',
            fontSize: '12px',
            cursor: 'pointer',
            opacity: creating || !newName.trim() ? 0.5 : 1,
          }}
        >
          + Create
        </button>
      </div>
    </div>
  );
}

function GeneralTab({ settings, onUpdate }: { settings: UserSettings; onUpdate: (p: Partial<UserSettings>) => void }) {
  return (
    <div>
      <SectionTitle>Active Deck</SectionTitle>
      <p style={{ fontSize: '12px', color: C.subtext, margin: '0 0 8px 0' }}>New flashcards will be saved to this deck.</p>
      <ActiveDeckSelector settings={settings} onUpdate={onUpdate} />

      <SectionTitle>Parsing</SectionTitle>
      <Toggle value={settings.enabled} onChange={v => onUpdate({ enabled: v })} label="Enable Syntagma" description="Master on/off switch" />
      <Toggle value={settings.autoParseOnLoad} onChange={v => onUpdate({ autoParseOnLoad: v })} label="Auto-parse pages on load" />
      <Toggle value={settings.hideRareWords} onChange={v => onUpdate({ hideRareWords: v })} label="Hide very rare words" description="Skip words ranked > 20,000" />

      <SectionTitle>Display</SectionTitle>
      <Toggle value={settings.showComprehensionHeader} onChange={v => onUpdate({ showComprehensionHeader: v })} label="Show comprehension header bar" />
      <Toggle value={settings.showLearningStatusColors} onChange={v => onUpdate({ showLearningStatusColors: v })} label="Show status colors" description="Red = unknown, Amber = learning" />
      <Toggle value={settings.showInlineTranslations} onChange={v => onUpdate({ showInlineTranslations: v })} label="Show inline Turkish translations" />

      <Select
        label="Your English level"
        value={settings.learnerLevel}
        onChange={v => onUpdate({ learnerLevel: v as UserSettings['learnerLevel'] })}
        options={[
          { value: 'beginner', label: 'Beginner (A1 · ~1,235 words)' },
          { value: 'elementary', label: 'Elementary (A2 · ~2,531 words)' },
          { value: 'intermediate', label: 'Intermediate (B1 · ~4,535 words)' },
          { value: 'upper-intermediate', label: 'Upper Intermediate (B2 · ~6,983 words)' },
          { value: 'advanced', label: 'Advanced (C2 · ~9,190 words)' },
        ]}
      />

      <SectionTitle>Reader</SectionTitle>
      <Toggle value={settings.readerEnableInlineTranslations} onChange={v => onUpdate({ readerEnableInlineTranslations: v })} label="Inline translations in reader" />
      <Toggle value={settings.readerShowLearningStatusColors} onChange={v => onUpdate({ readerShowLearningStatusColors: v })} label="Status colors in reader" />
      <Toggle value={settings.readerAutoParseChapterOnOpen} onChange={v => onUpdate({ readerAutoParseChapterOnOpen: v })} label="Auto-parse chapters on open" />
      <Select
        label="Reader theme"
        value={settings.readerTheme}
        onChange={v => onUpdate({ readerTheme: v as UserSettings['readerTheme'] })}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'sepia', label: 'Sepia' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </div>
  );
}

const BACKEND_URL = 'https://syntagma.omerhanyigit.online';

// ─── Tab: Word Browser ───────────────────────────────────────────────────────

type StatusFilter = 'all' | 'unknown' | 'learning' | 'known' | 'ignored';
type EditableWordStatus = Exclude<WordStatus, 'unknown'>;

const EDITABLE_WORD_STATUSES: EditableWordStatus[] = ['learning', 'known', 'ignored'];

interface WordKnowledgeEntry {
  lemma: string;
  status: WordStatus;
  updatedAt: number;
}

interface ServerWordCounts {
  total: number | null;
  known: number | null;
  learning: number | null;
  ignored: number | null;
}

function normalizeLemma(lemma: string): string {
  return lemma.trim().toLowerCase();
}

function toWordStatus(raw: unknown): WordStatus {
  const normalized = String(raw ?? '').toLowerCase();
  if (normalized === 'known' || normalized === 'learning' || normalized === 'ignored') {
    return normalized;
  }
  return 'unknown';
}

function WordBrowserTab({ settings }: { settings: UserSettings }) {
  const [words, setWords] = useState<WordKnowledgeEntry[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'lemma' | 'status' | 'updatedAt'>('lemma');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [source, setSource] = useState<'server' | 'local'>('local');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [serverCounts, setServerCounts] = useState<ServerWordCounts>({
    total: null,
    known: null,
    learning: null,
    ignored: null,
  });
  const [newLemma, setNewLemma] = useState('');
  const [newStatus, setNewStatus] = useState<EditableWordStatus>('learning');
  const [savingLemma, setSavingLemma] = useState<string | null>(null);
  const [deletingLemma, setDeletingLemma] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const PAGE_SIZE = 200;

  const apiBase = settings.apiBaseUrl || BACKEND_URL;
  const authHeader: Record<string, string> = useMemo(() => (
    settings.authToken
      ? {
          'Authorization': `Bearer ${settings.authToken}`,
          'Content-Type': 'application/json',
          ...(settings.authUserId ? { 'X-User-Id': settings.authUserId } : {}),
        }
      : {}
  ), [settings.authToken, settings.authUserId]);

  const loadFromLocal = useCallback(async () => {
    const key = userScopedKey('lexemes', settings.authUserId);
    const result = await chrome.storage.local.get(key);
    const entries = Object.values(result[key] ?? {}) as LexemeEntry[];
    setWords(entries.map(e => ({
      lemma: e.lemma,
      status: toWordStatus(e.status),
      updatedAt: e.lastSeenAt || 0,
    })));
    setSource('local');
    setServerCounts({ total: null, known: null, learning: null, ignored: null });
  }, [settings.authUserId]);

  const fetchServerTotal = useCallback(async (status?: Exclude<StatusFilter, 'all'>): Promise<number | null> => {
    const statusParam = status ? `&status=${status.toUpperCase()}` : '';
    const res = await fetch(`${apiBase}/api/word-knowledge?size=1&page=0${statusParam}`, {
      headers: authHeader,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const total = Number(json?.data?.totalElements);
    return Number.isFinite(total) ? total : null;
  }, [apiBase, authHeader]);

  const fetchWords = useCallback(async (pageToLoad = 0, append = false) => {
    if (pageToLoad === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    if (!settings.authToken) {
      await loadFromLocal();
      setPage(0);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    try {
      const statusParam = filter !== 'all' ? `&status=${filter.toUpperCase()}` : '';
      const res = await fetch(`${apiBase}/api/word-knowledge?size=${PAGE_SIZE}&page=${pageToLoad}${statusParam}`, {
        headers: authHeader,
      });
      const newToken = res.headers.get('X-Refreshed-Token');
      if (newToken) sendMessage({ type: 'SET_SETTINGS', payload: { authToken: newToken } }).catch(() => {});
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = await res.json();
      const content = json.data?.content ?? json.data ?? [];
      const mapped: WordKnowledgeEntry[] = content.map((wk: any) => ({
        lemma: wk.lemma ?? '',
        status: toWordStatus(wk.status),
        updatedAt: wk.updatedAt ? new Date(wk.updatedAt).getTime() : 0,
      }));
      const totalElements = Number(json?.data?.totalElements);
      setWords(prev => append ? [...prev, ...mapped] : mapped);
      setSource('server');
      setPage(pageToLoad);
      if (Number.isFinite(totalElements)) {
        setHasMore(((pageToLoad + 1) * PAGE_SIZE) < totalElements);
      } else {
        setHasMore(mapped.length === PAGE_SIZE);
      }
      if (pageToLoad === 0) {
        const [total, known, learning, ignored] = await Promise.all([
          fetchServerTotal(),
          fetchServerTotal('known'),
          fetchServerTotal('learning'),
          fetchServerTotal('ignored'),
        ]);
        setServerCounts({ total, known, learning, ignored });
      }
    } catch {
      await loadFromLocal();
      setPage(0);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [apiBase, authHeader, settings.authToken, filter, fetchServerTotal, loadFromLocal]);

  useEffect(() => { fetchWords(0, false); }, [fetchWords]);

  const filtered = words
    .filter(e => !search || e.lemma.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'lemma') return a.lemma.localeCompare(b.lemma);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      if (sortBy === 'updatedAt') return b.updatedAt - a.updatedAt;
      return 0;
    });

  const statusColor = (status: WordStatus) => {
    if (status === 'known') return C.green;
    if (status === 'learning') return C.amber;
    if (status === 'unknown') return C.red;
    return C.subtext;
  };

  const displayedTotal = source === 'server' && serverCounts.total !== null
    ? (serverCounts.known !== null && serverCounts.learning !== null && serverCounts.ignored !== null
      ? serverCounts.known + serverCounts.learning + serverCounts.ignored
      : serverCounts.total)
    : filtered.length;
  const displayedKnown = source === 'server' && serverCounts.known !== null
    ? serverCounts.known
    : words.filter(e => e.status === 'known').length;
  const displayedLearning = source === 'server' && serverCounts.learning !== null
    ? serverCounts.learning
    : words.filter(e => e.status === 'learning').length;

  const upsertWord = useCallback(async (lemma: string, status: WordStatus) => {
    const normalized = normalizeLemma(lemma);
    if (!normalized) return { ok: false, error: 'Please enter a word.' };
    return sendMessage<{ ok: boolean; error?: string }>({
      type: 'UPSERT_WORD_KNOWLEDGE',
      payload: { lemma: normalized, status },
    });
  }, []);

  const removeWord = useCallback(async (lemma: string) => {
    const normalized = normalizeLemma(lemma);
    if (!normalized) return { ok: false, error: 'Invalid word.' };
    return sendMessage<{ ok: boolean; error?: string }>({
      type: 'DELETE_WORD_KNOWLEDGE',
      payload: { lemma: normalized },
    });
  }, []);

  const handleCreate = useCallback(async () => {
    setActionError(null);
    const normalized = normalizeLemma(newLemma);
    if (!normalized) {
      setActionError('Please enter a word.');
      return;
    }
    setSavingLemma(`create:${normalized}`);
    try {
      const result = await upsertWord(normalized, newStatus);
      if (!result.ok) {
        setActionError(result.error ?? 'Could not create word.');
        return;
      }
      setNewLemma('');
      await fetchWords(0, false);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSavingLemma(null);
    }
  }, [newLemma, newStatus, upsertWord, fetchWords]);

  const handleStatusChange = useCallback(async (lemma: string, nextStatus: EditableWordStatus) => {
    setActionError(null);
    setSavingLemma(lemma);
    try {
      const result = await upsertWord(lemma, nextStatus);
      if (!result.ok) {
        setActionError(result.error ?? 'Could not update word.');
        return;
      }
      await fetchWords(0, false);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSavingLemma(null);
    }
  }, [upsertWord, fetchWords]);

  const handleDelete = useCallback(async (lemma: string) => {
    setActionError(null);
    if (!window.confirm(`Remove "${lemma}" from known words?`)) return;
    setDeletingLemma(lemma);
    try {
      const result = await removeWord(lemma);
      if (!result.ok) {
        setActionError(result.error ?? 'Could not delete word.');
        return;
      }
      await fetchWords(0, false);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setDeletingLemma(null);
    }
  }, [removeWord, fetchWords]);

  if (loading) return <div style={{ color: C.subtext, padding: '20px', textAlign: 'center' }}>Loading words...</div>;

  return (
    <div>
      {actionError && (
        <div style={{
          background: C.red + '20',
          border: `1px solid ${C.red}`,
          borderRadius: '6px',
          padding: '8px 10px',
          marginBottom: '10px',
          fontSize: '12px',
          color: C.red,
        }}>
          {actionError}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={newLemma}
          onChange={e => setNewLemma(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Add word..."
          style={{
            flex: 1,
            minWidth: '120px',
            background: C.surface0,
            border: `1px solid ${C.surface1}`,
            borderRadius: '6px',
            padding: '6px 10px',
            color: C.text,
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <select
          value={newStatus}
          onChange={e => setNewStatus(e.target.value as EditableWordStatus)}
          style={{
            background: C.surface0,
            border: `1px solid ${C.surface1}`,
            borderRadius: '6px',
            padding: '6px 10px',
            color: C.text,
            fontSize: '13px',
            outline: 'none',
          }}
        >
          {EDITABLE_WORD_STATUSES.map(status => (
            <option key={status} value={status}>
              {status[0].toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
        <button
          onClick={handleCreate}
          disabled={!newLemma.trim() || savingLemma?.startsWith('create:') || deletingLemma !== null}
          style={{
            background: C.green,
            color: C.base,
            border: 'none',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '12px',
            cursor: !newLemma.trim() || savingLemma?.startsWith('create:') || deletingLemma !== null ? 'not-allowed' : 'pointer',
            opacity: !newLemma.trim() || savingLemma?.startsWith('create:') || deletingLemma !== null ? 0.6 : 1,
          }}
        >
          {savingLemma?.startsWith('create:') ? 'Saving...' : '+ Add'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search words..."
          style={{
            flex: 1,
            minWidth: '120px',
            background: C.surface0,
            border: `1px solid ${C.surface1}`,
            borderRadius: '6px',
            padding: '6px 10px',
            color: C.text,
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as StatusFilter)}
          style={{
            background: C.surface0,
            border: `1px solid ${C.surface1}`,
            borderRadius: '6px',
            padding: '6px 10px',
            color: C.text,
            fontSize: '13px',
            outline: 'none',
          }}
        >
          <option value="all">All</option>
          <option value="unknown">Unknown</option>
          <option value="learning">Learning</option>
          <option value="known">Known</option>
          <option value="ignored">Ignored</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          style={{
            background: C.surface0,
            border: `1px solid ${C.surface1}`,
            borderRadius: '6px',
            padding: '6px 10px',
            color: C.text,
            fontSize: '13px',
            outline: 'none',
          }}
        >
          <option value="lemma">Sort: A-Z</option>
          <option value="status">Sort: Status</option>
          <option value="updatedAt">Sort: Last updated</option>
        </select>
        <button onClick={() => fetchWords()} style={{ background: C.surface0, border: `1px solid ${C.surface1}`, borderRadius: '4px', padding: '4px 8px', color: C.text, cursor: 'pointer', fontSize: '12px' }}>
          Refresh
        </button>
      </div>

      <div style={{ fontSize: '12px', color: C.subtext, marginBottom: '8px' }}>
        {displayedTotal} words · {displayedKnown} known · {displayedLearning} learning
        <span style={{ color: source === 'server' ? C.green : C.amber, marginLeft: '6px' }}>
          {source === 'server' ? 'Live' : 'Local'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: C.subtext,
          fontSize: '13px',
        }}>
          No words tracked yet.
          <br />
          <span style={{ fontSize: '12px' }}>
            Click on words while reading to mark them as known/learning.
          </span>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.surface1}` }}>
                {['Word', 'Status', 'Last Updated', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: C.subtext, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.lemma} style={{ borderBottom: `1px solid ${C.surface0}` }}>
                  <td style={{ padding: '6px 8px', color: C.text, fontWeight: 500 }}>{entry.lemma}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {entry.status === 'unknown' ? (
                      <span style={{
                        color: statusColor(entry.status),
                        fontSize: '12px',
                        textTransform: 'capitalize',
                      }}>
                        {entry.status}
                      </span>
                    ) : (
                      <select
                        value={entry.status}
                        onChange={e => handleStatusChange(entry.lemma, e.target.value as EditableWordStatus)}
                        disabled={savingLemma === entry.lemma || deletingLemma === entry.lemma}
                        style={{
                          background: C.surface0,
                          border: `1px solid ${C.surface1}`,
                          borderRadius: '6px',
                          padding: '4px 8px',
                          color: statusColor(entry.status),
                          fontSize: '12px',
                          outline: 'none',
                          textTransform: 'capitalize',
                        }}
                      >
                        {EDITABLE_WORD_STATUSES.map(status => (
                          <option key={status} value={status}>
                            {status[0].toUpperCase() + status.slice(1)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', color: C.subtext, fontSize: '12px' }}>
                    {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <button
                      onClick={() => handleDelete(entry.lemma)}
                      disabled={savingLemma === entry.lemma || deletingLemma === entry.lemma}
                      style={{
                        background: C.red + '12',
                        border: `1px solid ${C.red + '50'}`,
                        color: C.red,
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: savingLemma === entry.lemma || deletingLemma === entry.lemma ? 'not-allowed' : 'pointer',
                        opacity: savingLemma === entry.lemma || deletingLemma === entry.lemma ? 0.6 : 1,
                      }}
                    >
                      {deletingLemma === entry.lemma ? 'Removing...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {source === 'server' && hasMore && (
            <div style={{ textAlign: 'center', padding: '10px' }}>
              <button
                onClick={() => fetchWords(page + 1, true)}
                disabled={loadingMore}
                style={{
                  background: C.surface0,
                  border: `1px solid ${C.surface1}`,
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: C.text,
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                {loadingMore ? 'Loading...' : 'Show more'}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{
        marginTop: '16px',
        padding: '10px',
        background: C.surface0,
        borderRadius: '6px',
        fontSize: '12px',
        color: C.subtext,
      }}>
        Server: <span style={{ color: C.text }}>{apiBase}</span>
        <br />
        Account: <span style={{ color: C.text }}>{settings.authEmail ?? 'Not logged in'}</span>
      </div>
    </div>
  );
}

function AudioPlayButton({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (error) { setError(false); }

    if (!audioRef.current) {
      const audio = new Audio(url);
      audio.onended = () => setPlaying(false);
      audio.onerror = () => { setPlaying(false); setError(true); };
      audioRef.current = audio;
    }

    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {
        setPlaying(false);
        setError(true);
      });
    }
  }, [url, playing, error]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <button
      onClick={toggle}
      title={error ? 'Audio unavailable' : playing ? 'Stop' : 'Play sentence audio'}
      style={{
        width: '72px',
        height: '22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        background: error ? C.red + '18' : playing ? C.green + '22' : C.blue + '18',
        border: `1px solid ${error ? C.red + '55' : playing ? C.green + '55' : C.blue + '55'}`,
        borderRadius: '4px',
        color: error ? C.red : playing ? C.green : C.blue,
        cursor: 'pointer',
        fontSize: '10px',
        fontWeight: 600,
        padding: 0,
        transition: 'all 0.15s',
      }}
    >
      {error ? (
        <>✕ Error</>
      ) : playing ? (
        <>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
          Stop
        </>
      ) : (
        <>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
          Audio
        </>
      )}
    </button>
  );
}

// ─── Tab: Flashcards ─────────────────────────────────────────────────────────

function FlashcardsTab({ settings, onUpdate }: { settings: UserSettings; onUpdate: (patch: Partial<UserSettings>) => void }) {
  const [cards, setCards] = useState<FlashcardPayload[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [viewFilter, setViewFilter] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCollName, setNewCollName] = useState('');
  const [creatingColl, setCreatingColl] = useState(false);

  const apiBase = settings.apiBaseUrl || BACKEND_URL;

  const fetchCollections = useCallback(async () => {
    if (!settings.authToken) return;
    try {
      const result = await sendMessage<{ ok: boolean; collections?: CollectionItem[]; error?: string }>({
        type: 'FETCH_COLLECTIONS',
        payload: null,
      });
      if (result.ok) setCollections(result.collections ?? []);
    } catch {}
  }, [settings.authToken]);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await sendMessage<{ ok: boolean; cards?: FlashcardPayload[]; error?: string }>({
        type: 'FETCH_FLASHCARDS',
        payload: null,
      });
      if (!result.ok) throw new Error(result.error ?? 'Could not fetch flashcards');
      setCards(result.cards ?? []);
    } catch (err) {
      console.error('[Syntagma] Failed to fetch flashcards:', err);
      setError((err as Error).message);
      const fcKey = userScopedKey('flashcards', settings.authUserId);
      const result = await chrome.storage.local.get(fcKey);
      setCards((result[fcKey] ?? []) as FlashcardPayload[]);
    } finally {
      setLoading(false);
    }
  }, [settings.authUserId, settings.apiBaseUrl]);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);
  useEffect(() => { fetchCards(); }, [fetchCards]);

  const filteredCards = viewFilter !== null
    ? cards.filter(c => c.collectionId != null && Number(c.collectionId) === Number(viewFilter))
    : cards;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filteredCards.map(c => c.id)));
  const clearAll = () => setSelected(new Set());

  const handleDeleteCard = async (id: string) => {
    try {
      const result = await sendMessage<{ ok: boolean; error?: string }>({
        type: 'DELETE_FLASHCARD',
        payload: { id },
      });
      if (!result.ok) throw new Error(result.error ?? 'Delete failed');
    } catch (err) {
      console.warn('[Syntagma] Backend delete failed:', err);
    }
    setCards(prev => prev.filter(c => c.id !== id));
    setSelected(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleCreateCollection = async () => {
    if (!newCollName.trim()) return;
    setCreatingColl(true);
    try {
      const result = await sendMessage<{ ok: boolean; collection?: CollectionItem; error?: string }>({
        type: 'CREATE_COLLECTION',
        payload: { name: newCollName.trim() },
      });
      if (result.ok && result.collection) {
        setCollections(prev => [result.collection!, ...prev]);
        setNewCollName('');
        setViewFilter(result.collection.collectionId);
        onUpdate({ activeCollectionId: result.collection.collectionId, activeCollectionName: result.collection.name });
      }
    } catch {}
    setCreatingColl(false);
  };

  const handleDeleteCollection = async (id: number) => {
    try {
      const result = await sendMessage<{ ok: boolean; error?: string }>({
        type: 'DELETE_COLLECTION',
        payload: { id },
      });
      if (result.ok) {
        setCollections(prev => prev.filter(c => c.collectionId !== id));
        if (viewFilter === id) setViewFilter(null);
        if (settings.activeCollectionId === id) {
          onUpdate({ activeCollectionId: null, activeCollectionName: null });
        }
      }
    } catch {}
  };

  if (loading) return <div style={{ color: C.subtext, padding: '20px', textAlign: 'center' }}>Loading flashcards from server…</div>;

  return (
    <div>
      {/* Error banner */}
      {error && (
        <div style={{
          background: C.red + '20',
          border: `1px solid ${C.red}`,
          borderRadius: '6px',
          padding: '8px 12px',
          marginBottom: '12px',
          fontSize: '12px',
          color: C.red,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>⚠ Could not fetch from server ({error}). Showing local cards.</span>
          <button onClick={fetchCards} style={{ background: C.red, color: C.base, border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Collections filter bar */}
      {settings.authToken && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: C.subtext, marginBottom: '6px' }}>
            Saving to: <strong style={{ color: C.text }}>{settings.activeCollectionName || 'No deck (unsorted)'}</strong>
            <span style={{ marginLeft: '6px', color: C.surface2 }}>— change in General tab</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <button
              onClick={() => setViewFilter(null)}
              style={{
                background: viewFilter === null ? C.blue : C.surface0,
                color: viewFilter === null ? C.base : C.text,
                border: `1px solid ${viewFilter === null ? C.blue : C.surface1}`,
                borderRadius: '12px',
                padding: '4px 10px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              All
            </button>
            {collections.map(coll => (
              <div key={coll.collectionId} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                <button
                  onClick={() => setViewFilter(coll.collectionId)}
                  style={{
                    background: viewFilter === coll.collectionId ? C.blue : C.surface0,
                    color: viewFilter === coll.collectionId ? C.base : C.text,
                    border: `1px solid ${viewFilter === coll.collectionId ? C.blue : C.surface1}`,
                    borderRadius: '12px 0 0 12px',
                    padding: '4px 8px 4px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {coll.name}
                </button>
                <button
                  onClick={() => handleDeleteCollection(coll.collectionId)}
                  style={{
                    background: viewFilter === coll.collectionId ? C.blue : C.surface0,
                    color: viewFilter === coll.collectionId ? C.base : C.red,
                    border: `1px solid ${viewFilter === coll.collectionId ? C.blue : C.surface1}`,
                    borderLeft: 'none',
                    borderRadius: '0 12px 12px 0',
                    padding: '4px 6px',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              value={newCollName}
              onChange={e => setNewCollName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateCollection()}
              placeholder="New collection name…"
              style={{
                flex: 1,
                background: C.surface0,
                border: `1px solid ${C.surface1}`,
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
                color: C.text,
                outline: 'none',
              }}
            />
            <button
              onClick={handleCreateCollection}
              disabled={creatingColl || !newCollName.trim()}
              style={{
                background: C.green,
                color: C.base,
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                opacity: creatingColl || !newCollName.trim() ? 0.5 : 1,
              }}
            >
              + Create
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: C.subtext, flex: 1 }}>
          {filteredCards.length} cards · {selected.size} selected
          {!error && <span style={{ color: C.green, marginLeft: '6px' }}>● Live</span>}
        </span>
        <button onClick={() => fetchCards()} style={{ background: C.surface0, border: `1px solid ${C.surface1}`, borderRadius: '4px', padding: '4px 8px', color: C.text, cursor: 'pointer', fontSize: '12px' }}>
          ↻ Refresh
        </button>
        <button onClick={selectAll} style={{ background: C.surface0, border: `1px solid ${C.surface1}`, borderRadius: '4px', padding: '4px 8px', color: C.text, cursor: 'pointer', fontSize: '12px' }}>
          All
        </button>
        <button onClick={clearAll} style={{ background: C.surface0, border: `1px solid ${C.surface1}`, borderRadius: '4px', padding: '4px 8px', color: C.text, cursor: 'pointer', fontSize: '12px' }}>
          None
        </button>
      </div>

      {filteredCards.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: C.subtext,
          fontSize: '13px',
        }}>
          {viewFilter !== null ? 'No cards in this collection.' : 'No flashcards yet.'}
          <br />
          <span style={{ fontSize: '12px' }}>
            Click the card icon on a word popup to create one.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filteredCards.map(card => (
            <div
              key={card.id}
              style={{
                background: selected.has(card.id) ? C.surface1 : C.surface0,
                borderRadius: '6px',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                border: `1px solid ${selected.has(card.id) ? C.blue : C.surface1}`,
                cursor: 'pointer',
              }}
              onClick={() => toggleSelect(card.id)}
            >
              <input
                type="checkbox"
                checked={selected.has(card.id)}
                onChange={() => toggleSelect(card.id)}
                onClick={e => e.stopPropagation()}
                style={{ marginTop: '2px', flexShrink: 0 }}
              />
              {(card.screenshotDataUrl || card.audioUrl) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                  {card.screenshotDataUrl && (
                    <img
                      src={card.screenshotDataUrl}
                      alt=""
                      style={{
                        width: '72px',
                        height: '48px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        border: `1px solid ${C.surface1}`,
                        background: C.base,
                      }}
                    />
                  )}
                  {card.audioUrl && (
                    <AudioPlayButton url={card.audioUrl} />
                  )}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontWeight: 700, color: C.text, fontSize: '14px' }}>{card.lemma}</span>
                  {card.trMeaning && (
                    <span style={{ fontSize: '12px', color: C.blue, fontStyle: 'italic' }}>{card.trMeaning}</span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: C.subtext, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.sentence}
                </div>
                <div style={{ fontSize: '11px', color: C.surface2, marginTop: '2px' }}>
                  {card.deckName} · {new Date(card.createdAt).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteCard(card.id); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: C.red,
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Server info */}
      <div style={{
        marginTop: '16px',
        padding: '10px',
        background: C.surface0,
        borderRadius: '6px',
        fontSize: '12px',
        color: C.subtext,
      }}>
        Server: <span style={{ color: C.text }}>{apiBase}</span>
        <br />
        Account: <span style={{ color: C.text }}>{settings.authEmail ?? 'Not logged in'}</span>
      </div>
    </div>
  );
}

// ─── Main OptionsApp ─────────────────────────────────────────────────────────

// ─── Tab: Video ──────────────────────────────────────────────────────────────

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.surface1}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
      <span style={{ fontSize: '14px', color: C.text }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)}
          style={{ width: '120px', accentColor: C.blue, cursor: 'pointer' }}
        />
        <span style={{ fontSize: '12px', color: C.subtext, minWidth: '52px', textAlign: 'right' }}>
          {value}{unit ?? ''}
        </span>
      </div>
    </div>
  );
}

function VideoTab({ settings, onUpdate }: { settings: UserSettings; onUpdate: (p: Partial<UserSettings>) => void }) {
  return (
    <div>
      <SectionTitle>Subtitles</SectionTitle>
      <SliderRow label="Target subtitle size" value={settings.targetSubtitleSize} min={50} max={300} step={10} unit="%" onChange={v => onUpdate({ targetSubtitleSize: v })} />
      <SliderRow label="Secondary subtitle size" value={settings.secondarySubtitleSize} min={50} max={300} step={10} unit="%" onChange={v => onUpdate({ secondarySubtitleSize: v })} />
      <SliderRow label="Target timing offset" value={settings.targetSubtitleOffsetMs} min={-5000} max={5000} step={50} unit="ms" onChange={v => onUpdate({ targetSubtitleOffsetMs: v })} />
      <SliderRow label="Secondary timing offset" value={settings.secondarySubtitleOffsetMs} min={-5000} max={5000} step={50} unit="ms" onChange={v => onUpdate({ secondarySubtitleOffsetMs: v })} />
      <Select
        label="Obscure target subtitle"
        value={settings.targetSubtitleObscure}
        onChange={v => onUpdate({ targetSubtitleObscure: v as UserSettings['targetSubtitleObscure'] })}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'blur', label: 'Blur until revealed' },
          { value: 'hide', label: 'Hide until revealed' },
        ]}
      />
      {settings.targetSubtitleObscure !== 'off' && <>
        <Toggle value={settings.revealOnPause} onChange={v => onUpdate({ revealOnPause: v })} label="Reveal on pause" />
        <Toggle value={settings.revealOnHover} onChange={v => onUpdate({ revealOnHover: v })} label="Reveal on hover" />
        <Toggle value={settings.revealByKnownStatus} onChange={v => onUpdate({ revealByKnownStatus: v })} label="Reveal if all words known" />
      </>}
      <Toggle value={settings.removeBracketedSubtitles} onChange={v => onUpdate({ removeBracketedSubtitles: v })} label="Strip [bracketed] subtitles" description="Remove sound effects like [music]" />

      <SectionTitle>Auto-Pause</SectionTitle>
      <Select
        label="Auto-pause mode"
        value={settings.autoPauseMode}
        onChange={v => onUpdate({ autoPauseMode: v as UserSettings['autoPauseMode'] })}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'before', label: 'Before subtitle' },
          { value: 'after', label: 'After subtitle' },
          { value: 'before-and-after', label: 'Before & after' },
          { value: 'rewind-and-pause', label: 'Rewind & pause' },
        ]}
      />
      {(settings.autoPauseMode === 'after' || settings.autoPauseMode === 'before-and-after') && (
        <SliderRow label="End tolerance" value={settings.autoPauseDelayToleranceMs} min={0} max={2000} step={50} unit="ms" onChange={v => onUpdate({ autoPauseDelayToleranceMs: v })} />
      )}

      <SectionTitle>Scene Skipping</SectionTitle>
      <Select
        label="Silent gaps"
        value={settings.sceneSkipMode}
        onChange={v => onUpdate({ sceneSkipMode: v as UserSettings['sceneSkipMode'] })}
        options={[
          { value: 'off', label: 'Off' },
          { value: '2x', label: '2× speed' },
          { value: '4x', label: '4× speed' },
          { value: '6x', label: '6× speed' },
          { value: '8x', label: '8× speed' },
          { value: 'jump', label: 'Jump to next subtitle' },
        ]}
      />

      <SectionTitle>Word Interaction</SectionTitle>
      <Toggle value={settings.pauseOnWordInteraction} onChange={v => onUpdate({ pauseOnWordInteraction: v })} label="Pause on word click" />
      <Toggle value={settings.resumeAfterInteraction} onChange={v => onUpdate({ resumeAfterInteraction: v })} label="Resume after closing popup" />
      {settings.resumeAfterInteraction && (
        <SliderRow label="Resume delay" value={settings.resumeDelayMs} min={0} max={3000} step={100} unit="ms" onChange={v => onUpdate({ resumeDelayMs: v })} />
      )}
      <SliderRow label="Click delay" value={settings.interactionDelayMs} min={0} max={3000} step={100} unit="ms" onChange={v => onUpdate({ interactionDelayMs: v })} />
    </div>
  );
}

type TabId = 'general' | 'words' | 'flashcards' | 'video';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'words', label: 'Word Browser' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'video', label: 'Video' },
];

export function OptionsApp() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    sendMessage<UserSettings>({ type: 'GET_SETTINGS', payload: null })
      .then(s => { setSettings(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !changes.userSettings?.newValue) return;
      setSettings({ ...DEFAULT_SETTINGS, ...(changes.userSettings.newValue as Partial<UserSettings>) });
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const handleUpdate = useCallback(async (patch: Partial<UserSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    setSaveStatus('saving');
    try {
      await sendMessage({ type: 'SET_SETTINGS', payload: patch });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch (err) {
      console.error('[Syntagma options] save error', err);
      setSaveStatus('idle');
    }
  }, [settings]);

  const globalStyle = `
    * { box-sizing: border-box; }
    body { margin: 0; background: ${C.base}; }
    select option { background: ${C.surface0}; color: ${C.text}; }
    input::placeholder { color: ${C.surface2}; }
  `;

  if (loading) {
    return (
      <>
        <style>{globalStyle}</style>
        <div style={{ background: C.base, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: C.subtext, fontFamily: 'system-ui, sans-serif' }}>Loading…</span>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{globalStyle}</style>
      <div style={{
        background: C.base,
        minHeight: '100vh',
        color: C.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
      }}>
        {/* Top bar */}
        <div style={{
          background: C.mantle,
          borderBottom: `1px solid ${C.surface1}`,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          height: '52px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '16px' }}>
            <span style={{ color: C.blue, fontWeight: 800, fontSize: '18px' }}>Syn</span>
            <span style={{ color: C.mauve, fontWeight: 800, fontSize: '18px' }}>tagma</span>
            <span style={{ color: C.subtext, fontSize: '12px', marginLeft: '4px' }}>Settings</span>
          </div>

          {/* Tabs */}
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? `2px solid ${C.blue}` : '2px solid transparent',
                color: activeTab === tab.id ? C.blue : C.subtext,
                padding: '0 4px',
                height: '100%',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tab.id ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}

          <div style={{ flex: 1 }} />
          {saveStatus !== 'idle' && (
            <span style={{ fontSize: '12px', color: saveStatus === 'saved' ? C.green : C.subtext }}>
              {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px' }}>
          {activeTab === 'general' && <GeneralTab settings={settings} onUpdate={handleUpdate} />}
          {activeTab === 'words' && <WordBrowserTab settings={settings} />}
          {activeTab === 'flashcards' && <FlashcardsTab settings={settings} onUpdate={handleUpdate} />}
          {activeTab === 'video' && <VideoTab settings={settings} onUpdate={handleUpdate} />}
        </div>
      </div>
    </>
  );
}
