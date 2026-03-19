import { useState } from 'react';
import type { FlashcardPayload, LexemeEntry } from '../../shared/types';
import { sendMessage } from '../../shared/messages';

const C = {
  base: '#1e1e2e',
  surface0: '#313244',
  surface1: '#45475a',
  text: '#cdd6f4',
  subtext: '#a6adc8',
  blue: '#cba6f7',
  red: '#cba6f7',
  green: '#a6e3a1',
  amber: '#fab387',
};

interface CardCreatorProps {
  lemma: string;
  surface: string;
  sentence: string;
  lexeme: LexemeEntry | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function CardCreator({ lemma, surface, sentence, lexeme, onSaved, onCancel }: CardCreatorProps) {
  const [front, setFront] = useState(surface);
  const [sentenceField, setSentenceField] = useState(sentence);
  const [trMeaning, setTrMeaning] = useState(lexeme?.trMeaning ?? '');
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
      await sendMessage({ type: 'CREATE_FLASHCARD', payload: card });
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
