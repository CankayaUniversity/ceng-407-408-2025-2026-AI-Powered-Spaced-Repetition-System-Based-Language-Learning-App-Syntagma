import type { SubtitleCue, UserSettings } from '../../shared/types';
import { parseSubtitleFile } from './subtitle-parser';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: 'rgba(12, 12, 14, 0.96)',
  surface: 'rgba(38, 36, 34, 0.9)',
  text: '#E8E0D0',
  subtext: '#9A8878',
  accent: '#E9C46A',
  border: 'rgba(255,255,255,0.10)',
  blue: '#98C1D9',
  divider: 'rgba(255,255,255,0.07)',
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '10px',
      fontWeight: 700,
      color: C.subtext,
      textTransform: 'uppercase',
      letterSpacing: '0.8px',
      margin: '14px 0 4px',
    }}>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '5px 0',
      borderBottom: `1px solid ${C.divider}`,
      gap: '8px',
    }}>
      <span style={{ fontSize: '12px', color: C.text, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>{children}</div>
    </div>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      style={{
        background: C.surface,
        color: C.text,
        border: `1px solid ${C.border}`,
        borderRadius: '4px',
        padding: '2px 6px',
        fontSize: '11px',
        cursor: 'pointer',
        outline: 'none',
        maxWidth: '140px',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: '34px', height: '18px',
        borderRadius: '9px',
        border: 'none',
        background: checked ? C.accent : C.surface,
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
        padding: 0,
        outline: 'none',
      }}
    >
      <span style={{
        position: 'absolute',
        top: '2px',
        left: checked ? '17px' : '2px',
        width: '14px', height: '14px',
        borderRadius: '7px',
        background: '#fff',
        transition: 'left 0.2s',
        display: 'block',
      }} />
    </button>
  );
}

function Slider({
  value, min, max, step, onChange, unit,
}: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: '90px', accentColor: C.accent, cursor: 'pointer' }}
      />
      <span style={{ fontSize: '11px', color: C.subtext, minWidth: '44px', textAlign: 'right' }}>
        {value}{unit ?? ''}
      </span>
    </div>
  );
}

function FileImport({ label, onImport }: {
  label: string;
  onImport: (cues: SubtitleCue[], fileName: string) => void;
}) {
  return (
    <label style={{
      padding: '3px 9px',
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '4px',
      fontSize: '11px',
      color: C.blue,
      cursor: 'pointer',
      display: 'inline-block',
      whiteSpace: 'nowrap',
    }}>
      {label}
      <input
        type="file"
        accept=".srt,.vtt"
        style={{ display: 'none' }}
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          onImport(parseSubtitleFile(text, file.name), file.name);
          e.target.value = '';
        }}
      />
    </label>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

interface SettingsDrawerProps {
  settings: UserSettings;
  onSettingChange: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  onTargetImport: (cues: SubtitleCue[], fileName: string) => void;
  onSecondaryImport: (cues: SubtitleCue[], fileName: string) => void;
  targetTrackSource: 'platform' | 'import' | 'none';
  secondaryTrackSource: 'import' | 'none';
}

export function SettingsDrawer({
  settings,
  onSettingChange,
  onTargetImport,
  onSecondaryImport,
  targetTrackSource,
  secondaryTrackSource,
}: SettingsDrawerProps) {
  const set = <K extends keyof UserSettings>(k: K) =>
    (v: UserSettings[K]) => onSettingChange(k, v);

  return (
    <div style={{
      background: C.bg,
      backdropFilter: 'blur(18px)',
      borderRadius: '8px',
      padding: '12px 14px 16px',
      width: '300px',
      maxHeight: '75vh',
      overflowY: 'auto',
      boxShadow: '0 12px 40px rgba(0,0,0,0.85)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginBottom: '2px' }}>
        Syntagma — Video
      </div>

      {/* ── Auto-Pause ──────────────────────────────────────────────────── */}
      <SectionLabel>Auto-Pause</SectionLabel>
      <Row label="Mode">
        <Select
          value={settings.autoPauseMode}
          onChange={set('autoPauseMode')}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'before', label: 'Before subtitle' },
            { value: 'after', label: 'After subtitle' },
            { value: 'before-and-after', label: 'Before & after' },
            { value: 'rewind-and-pause', label: 'Rewind & pause' },
          ]}
        />
      </Row>
      {(settings.autoPauseMode === 'after' || settings.autoPauseMode === 'before-and-after') && (
        <Row label="End tolerance">
          <Slider
            value={settings.autoPauseDelayToleranceMs} min={0} max={2000} step={50}
            onChange={set('autoPauseDelayToleranceMs')} unit="ms"
          />
        </Row>
      )}

      {/* ── Target Subtitle ─────────────────────────────────────────────── */}
      <SectionLabel>Target Subtitle (English)</SectionLabel>
      <Row label="Source">
        <span style={{ fontSize: '11px', color: C.subtext }}>
          {targetTrackSource === 'platform' ? 'Platform' : targetTrackSource === 'import' ? 'Imported' : 'None'}
        </span>
        <FileImport label="Import SRT/VTT" onImport={onTargetImport} />
      </Row>
      <Row label="Obscure">
        <Select
          value={settings.targetSubtitleObscure}
          onChange={set('targetSubtitleObscure')}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'blur', label: 'Blur' },
            { value: 'hide', label: 'Hide' },
          ]}
        />
      </Row>
      {settings.targetSubtitleObscure !== 'off' && (<>
        <Row label="Reveal on pause">
          <Toggle checked={settings.revealOnPause} onChange={set('revealOnPause')} />
        </Row>
        <Row label="Reveal on hover">
          <Toggle checked={settings.revealOnHover} onChange={set('revealOnHover')} />
        </Row>
        <Row label="Reveal if all known">
          <Toggle checked={settings.revealByKnownStatus} onChange={set('revealByKnownStatus')} />
        </Row>
      </>)}
      <Row label="Font size">
        <Slider value={settings.targetSubtitleSize} min={50} max={150} step={10}
          onChange={set('targetSubtitleSize')} unit="%" />
      </Row>
      <Row label="Timing offset">
        <Slider value={settings.targetSubtitleOffsetMs} min={-5000} max={5000} step={50}
          onChange={set('targetSubtitleOffsetMs')} unit="ms" />
      </Row>

      {/* ── Secondary Subtitle ──────────────────────────────────────────── */}
      <SectionLabel>Secondary Subtitle (Turkish)</SectionLabel>
      <Row label="Source">
        <span style={{ fontSize: '11px', color: C.subtext }}>
          {secondaryTrackSource === 'import' ? 'Imported' : 'None'}
        </span>
        <FileImport label="Import SRT/VTT" onImport={onSecondaryImport} />
      </Row>
      <Row label="Obscure">
        <Select
          value={settings.secondarySubtitleObscure}
          onChange={set('secondarySubtitleObscure')}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'blur', label: 'Blur' },
            { value: 'hide', label: 'Hide' },
          ]}
        />
      </Row>
      <Row label="Font size">
        <Slider value={settings.secondarySubtitleSize} min={50} max={150} step={10}
          onChange={set('secondarySubtitleSize')} unit="%" />
      </Row>
      <Row label="Timing offset">
        <Slider value={settings.secondarySubtitleOffsetMs} min={-5000} max={5000} step={50}
          onChange={set('secondarySubtitleOffsetMs')} unit="ms" />
      </Row>

      {/* ── Scene Skip ──────────────────────────────────────────────────── */}
      <SectionLabel>Scene Skipping</SectionLabel>
      <Row label="Silent gaps">
        <Select
          value={settings.sceneSkipMode}
          onChange={set('sceneSkipMode')}
          options={[
            { value: 'off', label: 'Off' },
            { value: '2x', label: '2× speed' },
            { value: '4x', label: '4× speed' },
            { value: '6x', label: '6× speed' },
            { value: '8x', label: '8× speed' },
            { value: 'jump', label: 'Jump to next' },
          ]}
        />
      </Row>
      <Row label="Strip [brackets]">
        <Toggle checked={settings.removeBracketedSubtitles} onChange={set('removeBracketedSubtitles')} />
      </Row>

      {/* ── Word Interaction ────────────────────────────────────────────── */}
      <SectionLabel>Word Interaction</SectionLabel>
      <Row label="Pause on click">
        <Toggle checked={settings.pauseOnWordInteraction} onChange={set('pauseOnWordInteraction')} />
      </Row>
      <Row label="Click delay">
        <Slider value={settings.interactionDelayMs} min={0} max={3000} step={100}
          onChange={set('interactionDelayMs')} unit="ms" />
      </Row>
      <Row label="Resume after popup">
        <Toggle checked={settings.resumeAfterInteraction} onChange={set('resumeAfterInteraction')} />
      </Row>
      {settings.resumeAfterInteraction && (
        <Row label="Resume delay">
          <Slider value={settings.resumeDelayMs} min={0} max={3000} step={100}
            onChange={set('resumeDelayMs')} unit="ms" />
        </Row>
      )}

      {/* ── Overlay ─────────────────────────────────────────────────────── */}
      <SectionLabel>Overlay</SectionLabel>
      <Row label="BG opacity">
        <Slider value={settings.subtitleOverlayOpacity} min={0} max={1} step={0.05}
          onChange={set('subtitleOverlayOpacity')} />
      </Row>
      <Row label="Transcript sidebar">
        <Toggle checked={settings.showSubtitleSidebar} onChange={set('showSubtitleSidebar')} />
      </Row>
    </div>
  );
}
