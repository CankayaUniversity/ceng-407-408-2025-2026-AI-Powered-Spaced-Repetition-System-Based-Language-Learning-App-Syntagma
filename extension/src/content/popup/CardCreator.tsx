import { useState } from 'react';
import type { FlashcardPayload, LexemeEntry } from '../../shared/types';
import { sendMessage } from '../../shared/messages';

const C = {
  base: '#F5F1E9',
  surface0: '#FFFFFF',
  surface1: '#E2DACE',
  text: '#4A3B2C',
  subtext: '#877666',
  blue: '#98C1D9',
  red: '#D97762',
  green: '#A8B693',
  amber: '#E9C46A',
};

interface CardCreatorProps {
  lemma: string;
  surface: string;
  sentence: string;
  lexeme: LexemeEntry | null;
  translations?: string[];
  onSaved: () => void;
  onCancel: () => void;
}

export function CardCreator({ lemma, surface, sentence, lexeme, translations, onSaved, onCancel }: CardCreatorProps) {
  const [front, setFront] = useState(surface);
  const [sentenceField, setSentenceField] = useState(sentence);
  const [trMeaning, setTrMeaning] = useState(lexeme?.trMeaning ?? (translations?.length ? translations.join(', ') : ''));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const card: FlashcardPayload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        lemma,
        surfaceForm: front,
        sentence: sentenceField,
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        trMeaning,
        createdAt: Date.now(),
        deckName: 'Syntagma',
        tags: ['syntagma'],
      };
      const result = await sendMessage<{ ok: boolean; error?: string }>({
        type: 'CREATE_FLASHCARD',
        payload: card,
      });
      if (!result.ok) throw new Error(result.error ?? 'Could not save flashcard');
      setSaved(true);
      setTimeout(onSaved, 800);
    } catch (err) {
      console.error('[Syntagma] card save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: C.surface0,
      borderRadius: '6px',
      padding: '10px',
      marginTop: '8px',
      border: `1px solid ${C.blue}`,
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 700,
        color: C.blue,
        marginBottom: '8px',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}>
        Create Flashcard
      </div>

      {/* Word field */}
      <label style={{ display: 'block', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', color: C.subtext, display: 'block', marginBottom: '2px' }}>Word</span>
        <input
          value={front}
          onChange={e => setFront(e.target.value)}
          style={{
            width: '100%',
            background: C.base,
            border: `1px solid ${C.surface1}`,
            borderRadius: '4px',
            color: C.text,
            padding: '4px 6px',
            fontSize: '12px',
            boxSizing: 'border-box',
            outline: 'none',
            fontFamily: 'system-ui, sans-serif',
          }}
        />
      </label>

      {/* Sentence field */}
      <label style={{ display: 'block', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', color: C.subtext, display: 'block', marginBottom: '2px' }}>Sentence</span>
        <textarea
          value={sentenceField}
          onChange={e => setSentenceField(e.target.value)}
          rows={2}
          style={{
            width: '100%',
            background: C.base,
            border: `1px solid ${C.surface1}`,
            borderRadius: '4px',
            color: C.text,
            padding: '4px 6px',
            fontSize: '11px',
            boxSizing: 'border-box',
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'system-ui, sans-serif',
            lineHeight: 1.4,
          }}
        />
      </label>

      {/* Turkish meaning field */}
      <label style={{ display: 'block', marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', color: C.subtext, display: 'block', marginBottom: '2px' }}>
          Turkish Meaning (arka yüz)
        </span>
        <input
          value={trMeaning}
          onChange={e => setTrMeaning(e.target.value)}
          placeholder="Türkçe anlamı..."
          style={{
            width: '100%',
            background: C.base,
            border: `1px solid ${C.surface1}`,
            borderRadius: '4px',
            color: C.text,
            padding: '4px 6px',
            fontSize: '12px',
            boxSizing: 'border-box',
            outline: 'none',
            fontFamily: 'system-ui, sans-serif',
          }}
        />
      </label>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          style={{
            flex: 1,
            background: saved ? C.green : C.blue,
            color: C.base,
            border: 'none',
            borderRadius: '4px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: saving || saved ? 'default' : 'pointer',
            transition: 'background 0.2s',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {saved ? '✓ Saved!' : saving ? 'Saving…' : '💾 Save Card'}
        </button>
        <button
          onClick={onCancel}
          style={{
            background: C.surface1,
            color: C.subtext,
            border: 'none',
            borderRadius: '4px',
            padding: '5px 10px',
            fontSize: '12px',
            cursor: 'pointer',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
