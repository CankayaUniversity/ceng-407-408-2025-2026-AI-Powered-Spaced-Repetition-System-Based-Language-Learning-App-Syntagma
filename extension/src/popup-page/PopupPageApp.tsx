import { useState, useEffect, useCallback } from 'react';
import type { UserSettings, ComprehensionStats } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/storage';
import { sendMessage } from '../shared/messages';

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
};

function ComprehensionBar({ percent }: { percent: number }) {
  const color = percent >= 90 ? C.green : percent >= 70 ? C.amber : C.red;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: C.subtext }}>Comprehension</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color }}>{percent}%</span>
      </div>
      <div style={{ background: C.surface1, borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
        <div style={{
          background: color,
          width: `${percent}%`,
          height: '100%',
          borderRadius: '4px',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 0',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: '13px', color: C.text }}>{label}</span>
      <div style={{
        width: '32px',
        height: '18px',
        background: value ? C.blue : C.surface1,
        borderRadius: '9px',
        position: 'relative',
        transition: 'background 0.2s',
      }}>
        <div style={{
          position: 'absolute',
          top: '2px',
          left: value ? '16px' : '2px',
          width: '14px',
          height: '14px',
          background: C.text,
          borderRadius: '50%',
          transition: 'left 0.2s',
        }} />
      </div>
    </div>
  );
}

export function PopupPageApp() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<ComprehensionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Get current settings
        const s = await sendMessage<UserSettings>({ type: 'GET_SETTINGS', payload: null });
        setSettings(s);

        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        setActiveTab(tab ?? null);

        // Get comprehension stats for current tab
        if (tab?.url) {
          const result = await chrome.storage.local.get('comprehensionStats');
          const allStats = (result.comprehensionStats ?? {}) as Record<string, ComprehensionStats>;
          setStats(allStats[tab.url] ?? null);
        }
      } catch (err) {
        console.error('[Syntagma popup]', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const updateSetting = useCallback(async (patch: Partial<UserSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await sendMessage({ type: 'SET_SETTINGS', payload: patch });
  }, [settings]);

  const handleParsePage = useCallback(async () => {
    if (!activeTab?.id) return;
    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'PARSE_PAGE' });
    } catch {
      // Content script may not be ready yet — ignore
    }
    window.close();
  }, [activeTab]);

  const handleOpenSettings = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };

  if (loading) {
    return (
      <div style={{
        width: '300px',
        background: C.base,
        color: C.text,
        padding: '20px',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100px',
      }}>
        <span style={{ color: C.subtext, fontSize: '13px' }}>Loading…</span>
      </div>
    );
  }

  return (
    <div style={{
      width: '300px',
      background: C.base,
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
    }}>
      {/* Header */}
      <div style={{
        background: C.surface0,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${C.surface1}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: C.blue, fontWeight: 800, fontSize: '16px' }}>Syn</span>
          <span style={{ color: C.mauve, fontWeight: 800, fontSize: '16px' }}>tagma</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: C.subtext }}>v0.1</span>
          {/* Master enable/disable */}
          <div
            onClick={() => updateSetting({ enabled: !settings.enabled })}
            style={{
              width: '36px',
              height: '20px',
              background: settings.enabled ? C.green : C.surface1,
              borderRadius: '10px',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              position: 'absolute',
              top: '3px',
              left: settings.enabled ? '19px' : '3px',
              width: '14px',
              height: '14px',
              background: C.text,
              borderRadius: '50%',
              transition: 'left 0.2s',
            }} />
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 14px' }}>
        {/* Current page */}
        {activeTab && (
          <div style={{
            background: C.surface0,
            borderRadius: '6px',
            padding: '8px 10px',
            marginBottom: '12px',
          }}>
            <div style={{ fontSize: '11px', color: C.subtext, marginBottom: '4px' }}>Current page</div>
            <div style={{
              fontSize: '12px',
              color: C.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {activeTab.title ?? activeTab.url ?? 'Unknown'}
            </div>
          </div>
        )}

        {/* Comprehension stats */}
        {stats ? (
          <>
            <ComprehensionBar percent={stats.comprehensionPercent} />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6px',
              marginBottom: '12px',
            }}>
              {[
                { label: 'Known', value: stats.knownTokenCount, color: C.green },
                { label: 'Learning', value: stats.learningTokenCount, color: C.amber },
                { label: 'Unknown', value: stats.unknownTokenCount, color: C.red },
              ].map(item => (
                <div key={item.label} style={{
                  background: C.surface0,
                  borderRadius: '6px',
                  padding: '6px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: '10px', color: C.subtext }}>{item.label}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{
            background: C.surface0,
            borderRadius: '6px',
            padding: '10px',
            marginBottom: '12px',
            textAlign: 'center',
            color: C.subtext,
            fontSize: '12px',
          }}>
            No data for this page yet.
            <br />
            Click "Activate" to analyze.
          </div>
        )}

        {/* Parse button */}
        <button
          onClick={handleParsePage}
          disabled={!settings.enabled}
          style={{
            width: '100%',
            background: settings.enabled ? C.blue : C.surface1,
            color: settings.enabled ? C.base : C.subtext,
            border: 'none',
            borderRadius: '6px',
            padding: '8px',
            cursor: settings.enabled ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '10px',
            transition: 'all 0.15s',
          }}
        >
          Activate (Alt+P)
        </button>

        {/* Quick toggles */}
        <div style={{
          borderTop: `1px solid ${C.surface1}`,
          paddingTop: '8px',
          marginBottom: '8px',
        }}>
          <Toggle
            value={settings.showLearningStatusColors}
            onChange={v => updateSetting({ showLearningStatusColors: v })}
            label="Status Colors"
          />
          <Toggle
            value={settings.showInlineTranslations}
            onChange={v => updateSetting({ showInlineTranslations: v })}
            label="Inline Translations"
          />
          <Toggle
            value={settings.autoParseOnLoad}
            onChange={v => updateSetting({ autoParseOnLoad: v })}
            label="Auto-parse on load"
          />
        </div>

        {/* Settings link */}
        <button
          onClick={handleOpenSettings}
          style={{
            width: '100%',
            background: 'transparent',
            color: C.subtext,
            border: `1px solid ${C.surface1}`,
            borderRadius: '6px',
            padding: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'all 0.15s',
          }}
        >
          Open Full Settings
        </button>
      </div>
    </div>
  );
}
