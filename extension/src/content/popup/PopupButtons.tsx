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
  audio.play().catch(() => speakWord(url));
}

export function PopupButtons({ word, audioUrl, onAIAction, aiLoading }: PopupButtonsProps) {
  const [showLinks, setShowLinks] = useState(false);
  const linksRef = useRef<HTMLDivElement>(null);

  const handleAudio = () => audioUrl ? playAudio(audioUrl) : speakWord(word);
  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowLinks(false);
  };

  const btnStyle = (active?: boolean, color?: string): React.CSSProperties => ({
    width: '32px',
    height: '32px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? (color ?? C.blue) : 'transparent',
    color: active ? C.base : (color ?? C.blue),
    border: `1.5px solid ${color ?? C.blue}`,
    cursor: 'pointer',
    padding: 0,
    transition: 'all 0.15s',
    flexShrink: 0,
  });

  const SpinnerWrapper = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'syntagma-spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      <style>{`@keyframes syntagma-spin { 100% { transform: rotate(360deg); } }`}</style>
    </svg>
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
      {/* Audio Icon */}
      <button onClick={handleAudio} style={btnStyle(false, C.mauve)} title="Pronounce word">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </button>

      {/* Robot / Explain Word Icon */}
      <button
        onClick={() => onAIAction('explain-word')}
        disabled={aiLoading !== null}
        style={btnStyle(aiLoading === 'explain-word', C.blue)}
        title="AI: explain this word in context"
      >
        {aiLoading === 'explain-word' ? <SpinnerWrapper /> : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"></rect>
            <circle cx="12" cy="5" r="2"></circle>
            <path d="M12 7v4"></path>
            <line x1="8" y1="16" x2="8" y2="16"></line>
            <line x1="16" y1="16" x2="16" y2="16"></line>
          </svg>
        )}
      </button>

      {/* Document / Explain Sentence Icon */}
      <button
        onClick={() => onAIAction('explain-sentence')}
        disabled={aiLoading !== null}
        style={btnStyle(aiLoading === 'explain-sentence', C.amber)}
        title="AI: explain the sentence grammar"
      >
        {aiLoading === 'explain-sentence' ? <SpinnerWrapper /> : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        )}
      </button>

      {/* Translate Icon */}
      <button
        onClick={() => onAIAction('translate')}
        disabled={aiLoading !== null}
        style={btnStyle(aiLoading === 'translate', C.green)}
        title="AI: translate sentence to Turkish"
      >
        {aiLoading === 'translate' ? <SpinnerWrapper /> : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 8 6 6"></path>
            <path d="m4 14 6-6 2-3"></path>
            <path d="M2 5h12"></path>
            <path d="M7 2h1"></path>
            <path d="m22 22-5-10-5 10"></path>
            <path d="M14 18h6"></path>
          </svg>
        )}
      </button>

      {/* Link Icon */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowLinks(v => !v)}
          style={btnStyle(showLinks, C.subtext)}
          title="Open in external dictionary"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </button>
        {showLinks && (
          <div
            ref={linksRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '6px',
              background: C.surface0,
              border: `1px solid ${C.surface1}`,
              borderRadius: '8px',
              padding: '6px',
              zIndex: 2147483647,
              minWidth: '160px',
              boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
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
                  borderRadius: '6px',
                  padding: '8px 10px',
                  cursor: 'pointer',
                  fontSize: '13px',
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
