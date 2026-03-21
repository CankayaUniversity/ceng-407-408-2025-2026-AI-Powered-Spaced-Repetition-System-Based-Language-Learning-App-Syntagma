import { useState, useEffect, useCallback } from 'react';
import type { UserSettings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/storage';
import { sendMessage } from '../shared/messages';

const C = {
  base:     '#F5F1E9',
  surface0: '#FFFFFF',
  surface1: '#E2DACE',
  text:     '#4A3B2C',
  subtext:  '#877666',
  blue:     '#98C1D9',
  green:    '#A8B693',
  amber:    '#A07855',
};

export function PopupPageApp() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const s = await sendMessage<UserSettings>({ type: 'GET_SETTINGS', payload: null });
        setSettings(s);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        setActiveTab(tab ?? null);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const toggleEnabled = useCallback(async () => {
    const next = !settings.enabled;
    setSettings(s => ({ ...s, enabled: next }));
    await sendMessage({ type: 'SET_SETTINGS', payload: { enabled: next } });
  }, [settings.enabled]);

  const handleActivate = useCallback(async () => {
    if (!activeTab?.id || !settings.enabled) return;
    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'PARSE_PAGE' });
    } catch { /* content script may not be ready */ }
    window.close();
  }, [activeTab, settings.enabled]);

  const handleOpenSettings = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };

  return (
    <div style={{
      width: '240px',
      background: C.base,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      color: C.text,
    }}>
      {/* Header */}
      <div style={{
        background: C.surface0,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${C.surface1}`,
      }}>
        <div>
          <span style={{ color: C.blue, fontWeight: 800, fontSize: '16px', letterSpacing: '-0.5px' }}>Syn</span>
          <span style={{ color: C.amber, fontWeight: 800, fontSize: '16px', letterSpacing: '-0.5px' }}>tagma</span>
        </div>

        {/* Master on/off */}
        <div
          onClick={toggleEnabled}
          title={settings.enabled ? 'Disable extension' : 'Enable extension'}
          style={{
            width: '36px', height: '20px',
            background: settings.enabled ? C.green : C.surface1,
            borderRadius: '10px', position: 'relative',
            cursor: 'pointer', transition: 'background 0.2s',
          }}
        >
          <div style={{
            position: 'absolute', top: '3px',
            left: settings.enabled ? '19px' : '3px',
            width: '14px', height: '14px',
            background: settings.enabled ? C.base : C.subtext,
            borderRadius: '50%', transition: 'left 0.2s',
          }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px' }}>
        {/* Current page title */}
        {activeTab && (
          <div style={{
            fontSize: '11px', color: C.subtext,
            marginBottom: '12px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {activeTab.title ?? activeTab.url ?? ''}
          </div>
        )}

        {loading ? (
          <div style={{ color: C.subtext, fontSize: '12px', textAlign: 'center', padding: '8px 0' }}>
            Loading…
          </div>
        ) : (
          <button
            onClick={handleActivate}
            disabled={!settings.enabled}
            style={{
              width: '100%',
              background: settings.enabled ? C.blue : C.surface1,
              color: settings.enabled ? C.base : C.subtext,
              border: 'none', borderRadius: '6px',
              padding: '9px', fontSize: '13px', fontWeight: 700,
              cursor: settings.enabled ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s', marginBottom: '10px',
            }}
          >
            Activate  <span style={{ fontWeight: 400, opacity: 0.7, fontSize: '11px' }}>Alt+A</span>
          </button>
        )}

        <button
          onClick={handleOpenSettings}
          style={{
            width: '100%', background: 'transparent',
            color: C.subtext, border: `1px solid ${C.surface1}`,
            borderRadius: '6px', padding: '6px',
            cursor: 'pointer', fontSize: '11px', transition: 'all 0.15s',
          }}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
