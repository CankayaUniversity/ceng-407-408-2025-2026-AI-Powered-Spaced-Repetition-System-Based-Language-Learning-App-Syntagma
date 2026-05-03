import { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { LexemeEntry, UserSettings, FlashcardPayload } from '../../shared/types';
import { sendMessage } from '../../shared/messages';

const C = {
  base:     'var(--syn-base, #F5F1E9)',
  surface0: 'var(--syn-surface0, #FFFFFF)',
  surface1: 'var(--syn-surface1, #E2DACE)',
  surface2: 'var(--syn-surface2, #C9BEAD)',
  text:     'var(--syn-text, #4A3B2C)',
  subtext:  'var(--syn-subtext, #877666)',
  blue:     'var(--syn-blue, #98C1D9)',
  red:      'var(--syn-red, #D97762)',
  amber:    'var(--syn-amber, #A07855)',
  green:    'var(--syn-green, #A8B693)',
};

const CARD_TYPES = ['Basic', 'Basic (reversed)', 'Cloze'];
const DECK_NAMES = ['Syntagma', 'English Vocab', 'Sentences', 'Phrases'];

interface Props {
  initialWord?: string;
  initialSentence?: string;
  settings: UserSettings;
  lexemes: Record<string, LexemeEntry>;
  onClose: () => void;
  onCreated: (lemma: string) => void;
}

function AdvancedCardCreatorInner({ initialWord = '', initialSentence = '', settings, lexemes, onClose, onCreated }: Props) {
  const [search, setSearch] = useState(initialWord);
  const [dictResults, setDictResults] = useState<string[]>([]);
  const [dictLoading, setDictLoading] = useState(false);

  const [cardType, setCardType] = useState(CARD_TYPES[0]);
  const [deck, setDeck] = useState(settings.ankiDeckName || DECK_NAMES[0]);
  const [targetWord, setTargetWord] = useState(initialWord);
  const [sentence, setSentence] = useState(initialSentence);
  const [sentenceTr, setSentenceTr] = useState('');
  const [definition, setDefinition] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Auto-populate definition from lexemes
  useEffect(() => {
    if (targetWord && lexemes[targetWord]?.trMeaning) {
      setDefinition(lexemes[targetWord].trMeaning ?? '');
    }
  }, [targetWord, lexemes]);

  // Lookup dictionary when search changes (debounced)
  useEffect(() => {
    if (!search.trim()) { setDictResults([]); return; }
    const tid = setTimeout(async () => {
      setDictLoading(true);
      try {
        const res = await sendMessage<{ translations: string[] }>({
          type: 'LOOKUP_DICTIONARY',
          payload: { word: search.trim() },
        });
        setDictResults(res?.translations ?? []);
      } catch { setDictResults([]); }
      setDictLoading(false);
    }, 350);
    return () => clearTimeout(tid);
  }, [search]);

  const handleCreate = useCallback(async () => {
    if (!targetWord.trim()) return;
    setSaving(true);
    try {
      const card: FlashcardPayload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        lemma: targetWord.trim().toLowerCase(),
        surfaceForm: targetWord.trim(),
        sentence: sentence.trim(),
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        trMeaning: definition.trim() || dictResults[0] || '',
        createdAt: Date.now(),
        deckName: deck,
        tags: ['syntagma', 'advanced-creator'],
      };
      const result = await sendMessage<{ ok: boolean; error?: string }>({
        type: 'CREATE_FLASHCARD',
        payload: card,
      });
      if (!result.ok) throw new Error(result.error ?? 'Could not create card');
      onCreated(card.lemma);
      setSaveMsg({ text: 'Card created!', ok: true });
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err) {
      setSaveMsg({ text: (err as Error).message, ok: false });
    }
    setSaving(false);
  }, [targetWord, sentence, definition, deck, dictResults, onCreated]);

  // Escape closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.base,
    border: `1px solid ${C.surface1}`,
    borderRadius: '6px',
    padding: '8px 10px',
    fontSize: '13px',
    color: C.text,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: C.subtext,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '4px',
    display: 'block',
  };

  const fieldStyle: React.CSSProperties = { marginBottom: '12px' };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2147483644,
      background: 'rgba(74, 59, 44, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div data-syntagma style={{
        background: C.surface0,
        borderRadius: '12px',
        width: '880px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: `1px solid ${C.surface1}`,
          background: C.base,
        }}>
          <span style={{ fontWeight: 700, fontSize: '14px', color: C.text }}>Advanced Card Creator</span>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: C.subtext, fontSize: '18px', lineHeight: 1, padding: '2px 6px',
          }}>×</button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.surface1}`, background: C.base }}>
          <input
            ref={searchRef}
            value={search}
            onChange={e => { setSearch(e.target.value); setTargetWord(e.target.value); }}
            placeholder="Search word or phrase…"
            style={{ ...inputStyle, fontSize: '15px', padding: '10px 14px' }}
          />
        </div>

        {/* Main area */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: dictionary results */}
          <div style={{
            flex: 1,
            padding: '16px 18px',
            overflowY: 'auto',
            borderRight: `1px solid ${C.surface1}`,
          }}>
            {/* Word header */}
            {targetWord && (
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '22px', fontWeight: 700, color: C.text }}>{targetWord}</span>
              </div>
            )}

            {/* Dictionary translations */}
            <div style={{ marginBottom: '16px' }}>
              <span style={labelStyle}>Dictionary Translations</span>
              {dictLoading ? (
                <span style={{ color: C.subtext, fontSize: '13px' }}>Looking up…</span>
              ) : dictResults.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {dictResults.map((tr, i) => (
                    <button
                      key={i}
                      onClick={() => setDefinition(tr)}
                      style={{
                        background: definition === tr ? C.blue : C.surface1,
                        color: definition === tr ? C.base : C.text,
                        border: 'none', borderRadius: '6px',
                        padding: '6px 12px', fontSize: '13px',
                        cursor: 'pointer', fontWeight: 500,
                      }}
                    >
                      {tr}
                    </button>
                  ))}
                </div>
              ) : (
                <span style={{ color: C.subtext, fontSize: '13px' }}>
                  {search.trim() ? 'No results found.' : 'Type a word to look up.'}
                </span>
              )}
            </div>

            {/* Sentence context */}
            {sentence && (
              <div style={{ marginBottom: '16px' }}>
                <span style={labelStyle}>Source Sentence</span>
                <div style={{
                  background: C.base,
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  color: C.text,
                  lineHeight: 1.6,
                  fontStyle: 'italic',
                }}>
                  {sentence}
                </div>
              </div>
            )}

            {/* Source */}
            <div>
              <span style={labelStyle}>Source</span>
              <span style={{ fontSize: '12px', color: C.subtext }}>{document.title}</span>
            </div>
          </div>

          {/* Right: card creator fields */}
          <div style={{ width: '300px', padding: '16px 18px', overflowY: 'auto', background: C.base }}>

            <div style={fieldStyle}>
              <label style={labelStyle}>Card Type</label>
              <select value={cardType} onChange={e => setCardType(e.target.value)} style={{ ...inputStyle }}>
                {CARD_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Deck</label>
              <select value={deck} onChange={e => setDeck(e.target.value)} style={{ ...inputStyle }}>
                {DECK_NAMES.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Target Word</label>
              <input
                value={targetWord}
                onChange={e => setTargetWord(e.target.value)}
                style={inputStyle}
                placeholder="Word or phrase"
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Sentence</label>
              <textarea
                value={sentence}
                onChange={e => setSentence(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Example sentence…"
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Sentence Translation (TR)</label>
              <textarea
                value={sentenceTr}
                onChange={e => setSentenceTr(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Türkçe çeviri…"
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Definition / Meaning</label>
              <textarea
                value={definition}
                onChange={e => setDefinition(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Türkçe anlam…"
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Personal notes…"
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={saving || !targetWord.trim()}
              style={{
                width: '100%',
                background: saving ? C.surface1 : C.blue,
                color: saving ? C.subtext : C.base,
                border: 'none',
                borderRadius: '8px',
                padding: '11px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: saving || !targetWord.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Saving…' : 'Create Card'}
            </button>

            {saveMsg && (
              <div style={{
                marginTop: '10px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: saveMsg.ok ? C.green : C.red,
                color: C.base,
                fontSize: '13px',
                fontWeight: 600,
                textAlign: 'center',
              }}>
                {saveMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mount helpers ────────────────────────────────────────────────────────────

let creatorRoot: ReturnType<typeof createRoot> | null = null;
let creatorContainer: HTMLElement | null = null;

export function mountAdvancedCardCreator(props: Omit<Props, 'onClose'> & { onClose?: () => void }): void {
  dismissAdvancedCardCreator();

  creatorContainer = document.createElement('div');
  creatorContainer.id = 'syntagma-creator-root';
  creatorContainer.setAttribute('data-syntagma', '');
  document.documentElement.appendChild(creatorContainer);

  creatorRoot = createRoot(creatorContainer);
  creatorRoot.render(
    <AdvancedCardCreatorInner
      {...props}
      onClose={props.onClose ?? dismissAdvancedCardCreator}
    />
  );
}

export function dismissAdvancedCardCreator(): void {
  creatorRoot?.unmount();
  creatorRoot = null;
  creatorContainer?.remove();
  creatorContainer = null;
}
