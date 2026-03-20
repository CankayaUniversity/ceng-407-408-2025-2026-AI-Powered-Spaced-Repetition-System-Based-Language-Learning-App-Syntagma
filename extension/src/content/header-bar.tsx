import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { UserSettings } from '../shared/types';

// Catppuccin Mocha palette
const C = {
  base: '#F5F1E9',
  surface0: '#FFFFFF',
  surface1: '#E2DACE',
  text: '#4A3B2C',
  subtext: '#877666',
  blue: '#98C1D9',
  red: '#D97762',
  amber: '#A07855',
  green: '#A8B693',
  mauve: '#A07855',
  overlay: 'rgba(245, 241, 233, 0.95)',
};

interface HeaderBarProps {
  settings: UserSettings;
  onParse: () => void;
  onToggleColors: (val: boolean) => void;
  onToggleTranslations: (val: boolean) => void;
  onOpenSettings: () => void;
  isParsing: boolean;
  comprehensionPercent: number | null;
  wordCounts: { total: number; known: number; learning: number; unknown: number } | null;
}

function HeaderBar({
  settings,
  onParse,
  onToggleColors,
  onToggleTranslations,
  onOpenSettings,
  isParsing,
  comprehensionPercent,
  wordCounts,
}: HeaderBarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [colorsOn, setColorsOn] = useState(settings.showLearningStatusColors);
  const [trOn, setTrOn] = useState(settings.showInlineTranslations);

  useEffect(() => {
    setColorsOn(settings.showLearningStatusColors);
    setTrOn(settings.showInlineTranslations);
  }, [settings]);

  const handleToggleColors = useCallback(() => {
    const newVal = !colorsOn;
    setColorsOn(newVal);
    onToggleColors(newVal);
  }, [colorsOn, onToggleColors]);

  const handleToggleTr = useCallback(() => {
    const newVal = !trOn;
    setTrOn(newVal);
    onToggleTranslations(newVal);
  }, [trOn, onToggleTranslations]);

  if (collapsed) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483640,
        background: C.overlay,
        borderRadius: '0 0 8px 8px',
        padding: '2px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }} onClick={() => setCollapsed(false)}>
        <span style={{ color: C.blue, fontWeight: 700, fontSize: '13px', fontFamily: 'system-ui, sans-serif' }}>S</span>
        <span style={{ color: C.subtext, fontSize: '11px', fontFamily: 'system-ui, sans-serif' }}>
          {comprehensionPercent !== null ? `${comprehensionPercent}%` : '···'}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 2147483640,
      height: '40px',
      background: C.overlay,
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
        <span style={{ color: C.blue, fontWeight: 800, fontSize: '15px', letterSpacing: '-0.5px' }}>
          Syn
        </span>
        <span style={{ color: C.mauve, fontWeight: 800, fontSize: '15px', letterSpacing: '-0.5px' }}>
          tagma
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '20px', background: C.surface1 }} />

      {/* Parse button */}
      <button
        onClick={onParse}
        disabled={isParsing}
        style={{
          background: isParsing ? C.surface1 : C.blue,
          color: isParsing ? C.subtext : C.base,
          border: 'none',
          borderRadius: '4px',
          padding: '3px 10px',
          cursor: isParsing ? 'not-allowed' : 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        {isParsing ? 'Activating…' : 'Activate'}
      </button>

      {/* Comprehension stats */}
      {comprehensionPercent !== null && wordCounts && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            color: comprehensionPercent >= 90 ? C.green : comprehensionPercent >= 70 ? C.amber : C.red,
            fontWeight: 700,
            fontSize: '14px',
          }}>
            {comprehensionPercent}%
          </span>
          <span style={{ color: C.subtext, fontSize: '11px' }}>
            {wordCounts.known}K · {wordCounts.learning}L · {wordCounts.unknown}?
          </span>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Translations toggle */}
      <button
        onClick={handleToggleTr}
        title="Toggle inline Turkish translations"
        style={{
          background: trOn ? C.mauve : C.surface0,
          color: trOn ? C.base : C.subtext,
          border: 'none',
          borderRadius: '4px',
          padding: '3px 8px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 600,
          transition: 'all 0.15s',
        }}
      >
        TR
      </button>

      {/* Colors toggle */}
      <button
        onClick={handleToggleColors}
        title="Toggle status colors"
        style={{
          background: colorsOn ? C.amber : C.surface0,
          color: colorsOn ? C.base : C.subtext,
          border: 'none',
          borderRadius: '4px',
          padding: '3px 8px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 600,
          transition: 'all 0.15s',
        }}
      >
        Colors
      </button>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        title="Open settings"
        style={{
          background: 'transparent',
          color: C.subtext,
          border: `1px solid ${C.surface1}`,
          borderRadius: '4px',
          padding: '3px 8px',
          cursor: 'pointer',
          fontSize: '11px',
          transition: 'all 0.15s',
        }}
      >
        ⚙
      </button>

      {/* Collapse */}
      <button
        onClick={() => setCollapsed(true)}
        title="Collapse header"
        style={{
          background: 'transparent',
          color: C.subtext,
          border: 'none',
          borderRadius: '4px',
          padding: '3px 6px',
          cursor: 'pointer',
          fontSize: '14px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

let headerRoot: ReturnType<typeof createRoot> | null = null;
let headerContainer: HTMLElement | null = null;

export interface HeaderBarState {
  settings: UserSettings;
  isParsing: boolean;
  comprehensionPercent: number | null;
  wordCounts: { total: number; known: number; learning: number; unknown: number } | null;
  onParse: () => void;
  onToggleColors: (val: boolean) => void;
  onToggleTranslations: (val: boolean) => void;
  onOpenSettings: () => void;
}

export function mountHeaderBar(state: HeaderBarState): void {
  if (!headerContainer) {
    headerContainer = document.createElement('div');
    headerContainer.id = 'syntagma-header-root';
    headerContainer.setAttribute('data-syntagma', '');
    document.body.appendChild(headerContainer);
  }

  if (!headerRoot) {
    headerRoot = createRoot(headerContainer);
  }

  headerRoot.render(<HeaderBar {...state} />);

  // Add top padding to body so content isn't hidden under header
  if (!document.body.style.paddingTop || document.body.style.paddingTop === '0px') {
    document.body.style.paddingTop = '44px';
  }
}

export function updateHeaderBar(state: Partial<HeaderBarState> & { settings: UserSettings }): void {
  if (headerRoot) {
    mountHeaderBar(state as HeaderBarState);
  }
}

export function unmountHeaderBar(): void {
  if (headerRoot) {
    headerRoot.unmount();
    headerRoot = null;
  }
  headerContainer?.remove();
  headerContainer = null;

  // Remove added padding
  document.body.style.paddingTop = '';
}
