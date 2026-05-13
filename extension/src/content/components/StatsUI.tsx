import React, { useRef, useEffect } from 'react';
import type { PageAnalysis } from '../hooks/usePageAnalysis';

export const StatsUIColors = {
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

// ─── Mini donut (topbar indicator) ────────────────────────────────────────────

export function MiniDonut({ known, learning, unknown, total, themeColors = StatsUIColors }: { known: number; learning: number; unknown: number; total: number; themeColors?: typeof StatsUIColors }) {
  const r = 8, cx = 11, cy = 11;
  const circ = 2 * Math.PI * r;

  if (total === 0) {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={themeColors.surface1} strokeWidth="4" />
      </svg>
    );
  }

  const kFrac = known / total;
  const lFrac = learning / total;
  const uFrac = unknown / total;

  const segments = [
    { frac: kFrac, color: themeColors.green,  start: 0 },
    { frac: lFrac, color: themeColors.amber,  start: kFrac },
    { frac: uFrac, color: themeColors.red,    start: kFrac + lFrac },
  ];

  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={themeColors.surface1} strokeWidth="4" />
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

export interface StatsPopupProps {
  analysis: PageAnalysis;
  anchorLeft: number;
  onClose: () => void;
  themeColors?: typeof StatsUIColors;
  isFixed?: boolean;
  title?: string;
  emptyMessage?: string;
}

export function StatsPopup({
  analysis,
  anchorLeft,
  onClose,
  themeColors = StatsUIColors,
  isFixed = true,
  title = 'Page Analysis',
  emptyMessage = 'No words analyzed yet.',
}: StatsPopupProps) {
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
    { frac: kFrac, color: themeColors.green,  start: 0 },
    { frac: lFrac, color: themeColors.amber,  start: kFrac },
    { frac: uFrac, color: themeColors.red,    start: kFrac + lFrac },
  ];

  const pctK = total > 0 ? Math.round((counts.known / total) * 100) : 0;
  const pctL = total > 0 ? Math.round((counts.learning / total) * 100) : 0;
  const pctU = total > 0 ? Math.round((counts.unknown / total) * 100) : 0;

  const scoreColor = comprehensionScore >= 90 ? themeColors.green : comprehensionScore >= 70 ? themeColors.amber : themeColors.red;

  // clamp popup so it doesn't go off-screen
  const left = Math.min(anchorLeft, window.innerWidth - 300);

  return (
    <div ref={ref} style={{
      position: isFixed ? 'fixed' : 'absolute', 
      top: isFixed ? '48px' : '40px', 
      left: `${left}px`,
      background: themeColors.surface0,
      border: `1px solid ${themeColors.surface1}`,
      borderRadius: '14px',
      padding: '20px 20px 16px',
      width: '276px',
      zIndex: 2147483646,
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: themeColors.text,
    }}>
      {/* Title */}
      <div style={{
        fontSize: '11px', fontWeight: 700, color: themeColors.subtext,
        textTransform: 'uppercase', letterSpacing: '0.6px',
        marginBottom: '16px', textAlign: 'center',
      }}>
        {title}
      </div>

      {total === 0 ? (
        <div style={{ textAlign: 'center', color: themeColors.subtext, fontSize: '13px', padding: '24px 0' }}>
          {emptyMessage}
        </div>
      ) : (
        <>
          {/* Donut chart */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px', position: 'relative' }}>
            <svg width="104" height="104" viewBox="0 0 104 104">
              {/* Track */}
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={themeColors.surface1} strokeWidth={strokeW} />
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
            </div>
          </div>

          {/* Legend rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {[
              { color: themeColors.green, label: 'Known',    count: counts.known,    pct: pctK },
              { color: themeColors.amber, label: 'Learning',  count: counts.learning, pct: pctL },
              { color: themeColors.red,   label: 'Unknown',   count: counts.unknown,  pct: pctU },
            ].map(({ color, label, count, pct }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Color dot */}
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                {/* Label */}
                <span style={{ color: themeColors.text, fontSize: '13px', flex: 1 }}>{label}</span>
                {/* Mini bar */}
                <div style={{ width: '60px', height: '4px', background: themeColors.surface1, borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
                </div>
                {/* Count */}
                <span style={{ color: themeColors.subtext, fontSize: '11px', minWidth: '28px', textAlign: 'right' }}>{count}</span>
                {/* Percent */}
                <span style={{ color, fontWeight: 700, fontSize: '13px', minWidth: '34px', textAlign: 'right' }}>{pct}%</span>
              </div>
            ))}

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${themeColors.surface1}`, marginTop: '4px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: themeColors.subtext }}>Total words</span>
                <span style={{ color: themeColors.text, fontWeight: 600 }}>{total}</span>
              </div>
              {iPlusOneSentences > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: themeColors.subtext }}>i+1 sentences</span>
                  <span style={{ color: themeColors.blue, fontWeight: 600 }}>{iPlusOneSentences}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
