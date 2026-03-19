import { useState, useRef } from 'react';
import type { LearnerLevel } from '../../shared/types';

const C = {
  surface0: '#FFFFFF',
  surface1: '#E2DACE',
  text: '#4A3B2C',
  subtext: '#877666',
  blue: '#98C1D9',
  red: '#D97762',
  amber: '#A07855',
  green: '#A8B693',
  mauve: '#A07855',
  base: '#F5F1E9',
};

type AIActionType = 'explain-word' | 'explain-sentence' | 'translate';

interface PopupButtonsProps {
  word: string;
  sentence: string;
  level: LearnerLevel;
  audioUrl?: string | null;
  onAIAction: (type: AIActionType) => void;
  aiLoading: AIActionType | null;
}

const DICT_LINKS: Array<{ id: string; label: string; url: (w: string) => string }> = [
  { id: 'tureng', label: 'Tureng', url: (w) => `https://tureng.com/en/turkish-english/${encodeURIComponent(w)}` },
  { id: 'cambridge', label: 'Cambridge', url: (w) => `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(w)}` },
  { id: 'oxford', label: 'Oxford', url: (w) => `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(w)}` },
  { id: 'merriam', label: 'Merriam-Webster', url: (w) => `https://www.merriam-webster.com/dictionary/${encodeURIComponent(w)}` },
  { id: 'images', label: 'Google Images', url: (w) => `https://www.google.com/search?q=${encodeURIComponent(w)}&tbm=isch` },
];

function speakWord(word: string): void {
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function playAudio(url: string): void {
  const audio = new Audio(url);
  audio.play().catch(() => {
    // Fallback to TTS
    speakWord(url);
  });
}

export function PopupButtons({ word, sentence: _sentence, level: _level, audioUrl, onAIAction, aiLoading }: PopupButtonsProps) {
  const [showLinks, setShowLinks] = useState(false);
  const linksRef = useRef<HTMLDivElement>(null);

  const handleAudio = () => {
    if (audioUrl) {
      playAudio(audioUrl);
    } else {
      speakWord(word);
    }
  };

  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowLinks(false);
  };

  const btnStyle = (active?: boolean, color?: string): React.CSSProperties => ({
    background: active ? (color ?? C.blue) : C.surface0,
    color: active ? C.base : (color ?? C.blue),
    border: `1px solid ${color ?? C.blue}`,
    borderRadius: '4px',
    padding: '5px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.12s',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
      {/* Audio */}
      <button onClick={handleAudio} style={btnStyle(false, C.mauve)} title="Pronounce word">
        <span>🔊</span>
        <span>Audio</span>
      </button>

      {/* Explain Word */}
      <button
        onClick={() => onAIAction('explain-word')}
        disabled={aiLoading !== null}
        style={btnStyle(aiLoading === 'explain-word', C.blue)}
        title="AI: explain this word in context"
      >
        <span>{aiLoading === 'explain-word' ? '⟳' : '✦'}</span>
        <span>Word</span>
      </button>

      {/* Explain Sentence */}
      <button
        onClick={() => onAIAction('explain-sentence')}
        disabled={aiLoading !== null}
        style={btnStyle(aiLoading === 'explain-sentence', C.amber)}
        title="AI: explain the sentence grammar"
      >
        <span>{aiLoading === 'explain-sentence' ? '⟳' : '✦'}</span>
        <span>Sentence</span>
      </button>

      {/* Translate */}
      <button
        onClick={() => onAIAction('translate')}
        disabled={aiLoading !== null}
        style={btnStyle(aiLoading === 'translate', C.green)}
        title="AI: translate sentence to Turkish"
      >
        <span>{aiLoading === 'translate' ? '⟳' : 'TR'}</span>
        <span>Translate</span>
      </button>

      {/* External Links */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowLinks(v => !v)}
          style={btnStyle(showLinks, C.subtext)}
          title="Open in external dictionary"
        >
          <span>🔗</span>
          <span>Links</span>
        </button>
        {showLinks && (
          <div
            ref={linksRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              background: C.surface0,
              border: `1px solid ${C.surface1}`,
              borderRadius: '6px',
              padding: '4px',
              zIndex: 2147483647,
              minWidth: '160px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}
          >
            {DICT_LINKS.map(link => (
              <button
                key={link.id}
                onClick={() => handleExternalLink(link.url(word))}
                style={{
                  display: 'block',
                  width: '100%',
                  background: 'transparent',
                  color: C.text,
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.surface1)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {link.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
