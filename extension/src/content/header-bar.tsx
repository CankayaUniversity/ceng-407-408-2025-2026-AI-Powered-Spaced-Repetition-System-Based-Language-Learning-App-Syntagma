import { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { UserSettings, Token, LexemeEntry } from '../shared/types';
import { usePageAnalysis } from './hooks/usePageAnalysis';

const C = {
  base:     'var(--syn-base, #F5F1E9)',
  surface0: 'var(--syn-surface0, #FFFFFF)',
  surface1: 'var(--syn-surface1, #E2DACE)',
  text:     'var(--syn-text, #4A3B2C)',
  subtext:  'var(--syn-subtext, #877666)',
  blue:     'var(--syn-blue, #98C1D9)',
  red:      'var(--syn-red, #D97762)',
  amber:    'var(--syn-amber, #A07855)',
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

// ─── Mini donut (topbar indicator) ────────────────────────────────────────────

function MiniDonut({ known, learning, unknown, total }: { known: number; learning: number; unknown: number; total: number }) {
  const r = 8, cx = 11, cy = 11;
  const circ = 2 * Math.PI * r;

  if (total === 0) {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surface1} strokeWidth="4" />
      </svg>
    );
  }

  const kFrac = known / total;
  const lFrac = learning / total;
  const uFrac = unknown / total;

  const segments = [
    { frac: kFrac, color: C.green,  start: 0 },
    { frac: lFrac, color: C.amber,  start: kFrac },
    { frac: uFrac, color: C.red,    start: kFrac + lFrac },
  ];

  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surface1} strokeWidth="4" />
      {segments.map((seg, i) =>
        seg.frac > 0 ? (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth="4"
            strokeDasharray={`${seg.frac * circ} ${circ - seg.frac * circ}`}
            transform={`rotate(${-90 + seg.start * 360} ${cx} ${cy})`}
          />
        ) : null
      )}
    </svg>
  );
}

// ─── Stats popup ──────────────────────────────────────────────────────────────

interface StatsPopupProps {
  analysis: ReturnType<typeof usePageAnalysis>;
  anchorLeft: number;
  onClose: () => void;
}

function StatsPopup({ analysis, anchorLeft, onClose }: StatsPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { counts, comprehensionScore, iPlusOneSentences } = analysis;
  const total = counts.total;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', h), 50);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const r = 44, cx = 52, cy = 52;
  const circ = 2 * Math.PI * r;
  const strokeW = 16;

  const kFrac = total > 0 ? counts.known / total : 0;
  const lFrac = total > 0 ? counts.learning / total : 0;
  const uFrac = total > 0 ? counts.unknown / total : 0;

  const segments = [
    { frac: kFrac, color: C.green,  start: 0 },
    { frac: lFrac, color: C.amber,  start: kFrac },
    { frac: uFrac, color: C.red,    start: kFrac + lFrac },
  ];

  const pctK = total > 0 ? Math.round((counts.known / total) * 100) : 0;
  const pctL = total > 0 ? Math.round((counts.learning / total) * 100) : 0;
  const pctU = total > 0 ? Math.round((counts.unknown / total) * 100) : 0;

  const scoreColor = comprehensionScore >= 90 ? C.green : comprehensionScore >= 70 ? C.amber : C.red;

  // clamp popup so it doesn't go off-screen
  const left = Math.min(anchorLeft, window.innerWidth - 300);

  return (
    <div ref={ref} style={{
      position: 'fixed', top: '48px', left: `${left}px`,
      background: C.surface0,
      border: `1px solid ${C.surface1}`,
      borderRadius: '14px',
      padding: '20px 20px 16px',
      width: '276px',
      zIndex: 2147483646,
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Title */}
      <div style={{
        fontSize: '11px', fontWeight: 700, color: C.subtext,
        textTransform: 'uppercase', letterSpacing: '0.6px',
        marginBottom: '16px', textAlign: 'center',
      }}>
        Page Analysis
      </div>

      {total === 0 ? (
        <div style={{ textAlign: 'center', color: C.subtext, fontSize: '13px', padding: '24px 0' }}>
          No words analyzed yet.<br/>
          <span style={{ fontSize: '12px', opacity: 0.7 }}>Press Alt+A to parse the page.</span>
        </div>
      ) : (
        <>
          {/* Donut chart */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px', position: 'relative' }}>
            <svg width="104" height="104" viewBox="0 0 104 104">
              {/* Track */}
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surface1} strokeWidth={strokeW} />
              {/* Segments */}
              {segments.map((seg, i) =>
                seg.frac > 0 ? (
                  <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                    stroke={seg.color} strokeWidth={strokeW}
                    strokeLinecap="butt"
                    strokeDasharray={`${seg.frac * circ} ${circ - seg.frac * circ}`}
                    transform={`rotate(${-90 + seg.start * 360} ${cx} ${cy})`}
                    style={{ transition: 'stroke-dasharray 0.4s ease' }}
                  />
                ) : null
              )}
            </svg>
            {/* Center label */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center', pointerEvents: 'none',
            }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                {comprehensionScore}%
              </div>
              <div style={{ fontSize: '9px', color: C.subtext, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                comprehension
              </div>
            </div>
          </div>

          {/* Legend rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {[
              { color: C.green, label: 'Known',    count: counts.known,    pct: pctK },
              { color: C.amber, label: 'Learning',  count: counts.learning, pct: pctL },
              { color: C.red,   label: 'Unknown',   count: counts.unknown,  pct: pctU },
            ].map(({ color, label, count, pct }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Color dot */}
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                {/* Label */}
                <span style={{ color: C.text, fontSize: '13px', flex: 1 }}>{label}</span>
                {/* Mini bar */}
                <div style={{ width: '60px', height: '4px', background: C.surface1, borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
                </div>
                {/* Count */}
                <span style={{ color: C.subtext, fontSize: '11px', minWidth: '28px', textAlign: 'right' }}>{count}</span>
                {/* Percent */}
                <span style={{ color, fontWeight: 700, fontSize: '13px', minWidth: '34px', textAlign: 'right' }}>{pct}%</span>
              </div>
            ))}

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${C.surface1}`, marginTop: '4px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: C.subtext }}>Total words</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{total}</span>
              </div>
              {iPlusOneSentences > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: C.subtext }}>i+1 sentences</span>
                  <span style={{ color: C.blue, fontWeight: 600 }}>{iPlusOneSentences}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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
    document.body.appendChild(headerContainer);
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
