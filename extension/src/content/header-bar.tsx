import { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { UserSettings, Token, LexemeEntry } from '../shared/types';
import { usePageAnalysis } from './hooks/usePageAnalysis';
import { MiniDonut, StatsPopup, StatsUIColors } from './components/StatsUI';

const C = {
  base:     'var(--syn-base, #F5F1E9)',
  surface0: 'var(--syn-surface0, #FFFFFF)',
  surface1: 'var(--syn-surface1, #E2DACE)',
  text:     'var(--syn-text, #4A3B2C)',
  subtext:  'var(--syn-subtext, #877666)',
  blue:     'var(--syn-blue, #98C1D9)',
  red:      'var(--syn-red, #D97762)',
  amber:    'var(--syn-amber, #E9C46A)',
  green:    'var(--syn-green, #A8B693)',
  overlay:  'var(--syn-overlay, rgba(245,241,233,0.95))',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeaderBarState {
  settings: UserSettings;
  tokens: Token[];
  lexemes: Record<string, LexemeEntry>;
  isParsing: boolean;
  shiftMode: boolean;
  onParse: () => void;
  onToggleColors: (val: boolean) => void;
  onToggleTranslations: (val: boolean) => void;
  onOpenSettings: () => void;
  onQuickAddCard: (lemma: string, sentence: string) => Promise<void>;
  onOpenAdvancedCreator: (lemma?: string, sentence?: string) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function IconBtn({
  title, active, color, onClick, children, disabled,
}: {
  title: string; active?: boolean; color?: string; onClick: () => void;
  children: React.ReactNode; disabled?: boolean;
}) {
  const bg = active ? (color ?? C.blue) : 'transparent';
  const fg = active ? C.base : (color ?? C.blue);
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '30px', height: '30px', borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, color: fg,
        border: `1.5px solid ${color ?? C.blue}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0, transition: 'all 0.15s', flexShrink: 0,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

// Keyboard shortcut reference panel
const SHORTCUTS = [
  { keys: 'Alt+A',   desc: 'Toggle word overlays' },
  { keys: 'Alt+T',   desc: 'Open translator' },
  { keys: 'Alt+X',   desc: 'Lock/unlock toolbar' },
  { keys: 'Alt+S',   desc: 'Dictionary lookup' },
  { keys: 'Q',       desc: 'Quick create card' },
  { keys: 'E',       desc: 'Send to Card Creator' },
  { keys: '1 / U',   desc: 'Mark unknown' },
  { keys: '2 / T',   desc: 'Track word' },
  { keys: '3 / K',   desc: 'Mark known' },
  { keys: '4 / I',   desc: 'Ignore word' },
  { keys: 'Shift',   desc: 'Hold to click links' },
  { keys: 'Ctrl+X',  desc: 'Cancel quick card' },
];

function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', h), 50);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: 'fixed', top: '48px', right: '80px',
      background: C.surface0, border: `1px solid ${C.surface1}`,
      borderRadius: '10px', padding: '12px',
      width: '240px', zIndex: 2147483646,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: C.subtext, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
        Keyboard Shortcuts
      </div>
      {SHORTCUTS.map(s => (
        <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
          <code style={{ background: C.surface1, borderRadius: '3px', padding: '1px 5px', color: C.text, fontWeight: 600, fontSize: '11px' }}>
            {s.keys}
          </code>
          <span style={{ color: C.subtext }}>{s.desc}</span>
        </div>
      ))}
    </div>
  );
}

// (MiniDonut and StatsPopup have been extracted to StatsUI.tsx)

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastMsg { text: string; ok: boolean; id: number }

// ─── Main TopBar ──────────────────────────────────────────────────────────────

function TopBar({
  settings, tokens, lexemes, shiftMode,
  onToggleColors, onToggleTranslations, onOpenSettings,
  onOpenAdvancedCreator,
}: HeaderBarState) {
  const [collapsed, setCollapsed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [colorsOn, setColorsOn] = useState(settings.showLearningStatusColors);
  const [trOn, setTrOn] = useState(settings.showInlineTranslations);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inVideoMode, setInVideoMode] = useState(false);
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const statsRef = useRef<HTMLButtonElement>(null);

  // Track sidebar visibility from VideoSidebarPanel events
  useEffect(() => {
    const onOpen  = () => setSidebarOpen(true);
    const onClose = () => setSidebarOpen(false);
    window.addEventListener('syntagma:sidebar-visible', onOpen);
    window.addEventListener('syntagma:sidebar-hidden',  onClose);
    return () => {
      window.removeEventListener('syntagma:sidebar-visible', onOpen);
      window.removeEventListener('syntagma:sidebar-hidden',  onClose);
    };
  }, []);

  // Show/hide video-mode buttons based on VideoOverlay lifecycle
  useEffect(() => {
    const onEnter = () => setInVideoMode(true);
    const onExit  = () => setInVideoMode(false);
    const onShown  = () => setSubtitlesOn(true);
    const onHidden = () => setSubtitlesOn(false);
    window.addEventListener('syntagma:video-mode-enter',  onEnter);
    window.addEventListener('syntagma:video-mode-exit',   onExit);
    window.addEventListener('syntagma:subtitles-shown',   onShown);
    window.addEventListener('syntagma:subtitles-hidden',  onHidden);
    // If video mode was already active before this component mounted (race condition
    // where initVideoMode resolves before React commits effects), ask video/index.ts
    // to re-fire the enter event now that we're listening.
    window.dispatchEvent(new CustomEvent('syntagma:query-video-mode'));
    return () => {
      window.removeEventListener('syntagma:video-mode-enter',  onEnter);
      window.removeEventListener('syntagma:video-mode-exit',   onExit);
      window.removeEventListener('syntagma:subtitles-shown',   onShown);
      window.removeEventListener('syntagma:subtitles-hidden',  onHidden);
    };
  }, []);

  useEffect(() => {
    setColorsOn(settings.showLearningStatusColors);
    setTrOn(settings.showInlineTranslations);
  }, [settings]);

  const showToast = useCallback((text: string, ok: boolean) => {
    const id = Date.now();
    setToasts(prev => [...prev, { text, ok, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);
  void showToast; // used by callers via ref in future

  const handleToggleColors = useCallback(() => {
    const v = !colorsOn;
    setColorsOn(v);
    onToggleColors(v);
  }, [colorsOn, onToggleColors]);

  const handleToggleTr = useCallback(() => {
    const v = !trOn;
    setTrOn(v);
    onToggleTranslations(v);
  }, [trOn, onToggleTranslations]);

  // Alt+X locks toolbar
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'x') { e.preventDefault(); setLocked(l => !l); }
      if (e.altKey && e.key === 'z') { setCollapsed(false); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const analysis = usePageAnalysis(tokens, lexemes);
  const pct = analysis.comprehensionScore;
  const scoreColor = pct >= 90 ? C.green : pct >= 70 ? C.amber : C.red;

  // Collapsed pill
  if (collapsed && !locked) {
    return (
      <>
        <div
          data-syntagma
          onClick={() => setCollapsed(false)}
          title="Expand Syntagma (Alt+Z)"
          style={{
            position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
            zIndex: 2147483647, background: C.overlay,
            borderRadius: '0 0 10px 10px',
            padding: '3px 14px 4px',
            display: 'flex', alignItems: 'center', gap: '6px',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <span style={{ color: C.blue, fontWeight: 800, fontSize: '13px' }}>Syn</span>
          <span style={{ color: C.amber, fontWeight: 800, fontSize: '13px' }}>tagma</span>
          {pct > 0 && (
            <span style={{ color: scoreColor, fontWeight: 700, fontSize: '12px' }}>
              {pct}%
            </span>
          )}
        </div>
        <Toasts toasts={toasts} />
      </>
    );
  }

  const statsAnchorLeft = statsRef.current
    ? statsRef.current.getBoundingClientRect().left
    : 80;

  return (
    <>
      <div
        data-syntagma
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          zIndex: 2147483647, height: '44px',
          background: C.overlay, backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center',
          padding: '0 14px', gap: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '13px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flexShrink: 0 }}>
          <span style={{ color: C.blue, fontWeight: 800, fontSize: '15px', letterSpacing: '-0.5px' }}>Syn</span>
          <span style={{ color: C.amber, fontWeight: 800, fontSize: '15px', letterSpacing: '-0.5px' }}>tagma</span>
        </div>

        {/* Stats trigger — mini donut + % score */}
        <button
          ref={statsRef}
          onClick={() => setShowStats(v => !v)}
          title="Page analysis"
          style={{
            background: showStats ? C.surface1 : 'transparent',
            border: `1px solid ${showStats ? C.surface1 : 'transparent'}`,
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 8px', cursor: 'pointer',
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
            <span style={{ fontSize: '12px', color: C.subtext }}>
              —
            </span>
          )}
        </button>

        {/* Shift mode indicator */}
        {shiftMode && (
          <span style={{ fontSize: '11px', color: C.amber, fontWeight: 600, flexShrink: 0 }}>
            LINK MODE
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* ── Icon buttons (right side) ── */}

        {/* Visibility / Colors */}
        <IconBtn title="Toggle status colors (Colors)" active={colorsOn} color={C.amber} onClick={handleToggleColors}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </IconBtn>

        {/* Translator / Inline TR */}
        <IconBtn title="Toggle inline translations (TR)" active={trOn} color={C.blue} onClick={handleToggleTr}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/>
            <path d="M2 5h12"/><path d="M7 2h1"/>
            <path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
          </svg>
        </IconBtn>

        {/* Shortcuts panel */}
        <IconBtn title="Keyboard shortcuts" active={showShortcuts} color={C.subtext} onClick={() => setShowShortcuts(v => !v)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>
          </svg>
        </IconBtn>

        {/* Lock toolbar */}
        <IconBtn title={locked ? 'Unlock toolbar (Alt+X)' : 'Lock toolbar (Alt+X)'} active={locked} color={C.subtext} onClick={() => setLocked(l => !l)}>
          {locked ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
          )}
        </IconBtn>

        {/* CC subtitle toggle — only in video mode */}
        {inVideoMode && (
          <IconBtn
            title={subtitlesOn ? 'Hide subtitles' : 'Show subtitles'}
            active={subtitlesOn}
            color={C.green}
            onClick={() => window.dispatchEvent(new CustomEvent('syntagma:toggle-subtitles'))}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <path d="M7 15h2m4 0h4M7 11h4m4 0h2"/>
            </svg>
          </IconBtn>
        )}

        {/* Transcript sidebar toggle */}
        <IconBtn title="Toggle transcript sidebar" color={C.blue} onClick={() => window.dispatchEvent(new CustomEvent('syntagma:toggle-sidebar'))} active={sidebarOpen}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
            <line x1="3" y1="9" x2="15" y2="9"/>
            <line x1="3" y1="15" x2="15" y2="15"/>
          </svg>
        </IconBtn>

        {/* Advanced Creator */}
        <IconBtn title="Advanced Card Creator (E)" color={C.green} onClick={() => onOpenAdvancedCreator()} active={false}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </IconBtn>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title="Open settings"
          style={{
            background: 'transparent', color: C.subtext,
            border: `1px solid ${C.surface1}`, borderRadius: '5px',
            padding: '3px 8px', cursor: 'pointer', fontSize: '13px', transition: 'all 0.15s',
          }}
        >⚙</button>

        {/* Collapse (only if not locked) */}
        {!locked && (
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse (restore with Alt+Z)"
            style={{
              background: 'transparent', color: C.subtext, border: 'none',
              padding: '3px 4px', cursor: 'pointer', fontSize: '16px', lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {/* Dropdowns */}
      {showStats && (
        <StatsPopup
          analysis={analysis}
          anchorLeft={statsAnchorLeft}
          onClose={() => setShowStats(false)}
        />
      )}
      {showShortcuts && <ShortcutsPanel onClose={() => setShowShortcuts(false)} />}

      {/* Toast notifications */}
      <Toasts toasts={toasts} />
    </>
  );
}

function Toasts({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px',
      zIndex: 2147483647,
      display: 'flex', flexDirection: 'column', gap: '8px',
      pointerEvents: 'none',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.ok ? C.green : C.red,
          color: C.base,
          padding: '10px 16px',
          borderRadius: '8px',
          fontSize: '13px', fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          animation: 'syn-slide-in 0.2s ease-out',
        }}>
          {t.text}
        </div>
      ))}
      <style>{`@keyframes syn-slide-in { from { transform: translateX(20px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
    </div>
  );
}

// ─── Mount helpers (same API as before) ───────────────────────────────────────

let headerRoot: ReturnType<typeof createRoot> | null = null;
let headerContainer: HTMLElement | null = null;

export function mountHeaderBar(state: HeaderBarState): void {
  if (!headerContainer) {
    headerContainer = document.createElement('div');
    headerContainer.id = 'syntagma-header-root';
    headerContainer.setAttribute('data-syntagma', '');
    // Append to <html> not <body>: YouTube/Netflix apply CSS transforms to <body>
    // which breaks position:fixed containment — <html> never has transforms.
    document.documentElement.appendChild(headerContainer);
  }
  if (!headerRoot) headerRoot = createRoot(headerContainer);
  headerRoot.render(<TopBar {...state} />);

  if (!document.body.style.paddingTop || document.body.style.paddingTop === '0px') {
    document.body.style.paddingTop = '44px';
  }
}

export function updateHeaderBar(state: HeaderBarState): void {
  if (headerRoot) mountHeaderBar(state);
}

export function unmountHeaderBar(): void {
  headerRoot?.unmount();
  headerRoot = null;
  headerContainer?.remove();
  headerContainer = null;
  document.body.style.paddingTop = '';
}
