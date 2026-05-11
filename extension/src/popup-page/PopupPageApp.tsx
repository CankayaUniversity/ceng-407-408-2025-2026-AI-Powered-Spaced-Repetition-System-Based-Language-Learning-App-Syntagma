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
  amber:    '#E9C46A',
  red:      '#D97762',
};

export function PopupPageApp() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const s = await sendMessage<UserSettings>({ type: 'GET_SETTINGS', payload: null });
      setSettings(s);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    async function init() {
      await loadSettings();
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        setActiveTab(tab ?? null);
      } catch { /* ignore */ }
      setLoading(false);
    }
    init();

    // Refresh when storage changes (e.g. auth completes in external window)
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.userSettings) {
        const updated = changes.userSettings.newValue as UserSettings;
        setSettings(prev => ({ ...prev, ...updated }));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [loadSettings]);

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

  const handleOpenAuth = async () => {
    await sendMessage({ type: 'OPEN_AUTH_PAGE', payload: null });
    window.close();
  };

  const handleOpenReader = async () => {
    await sendMessage({ type: 'OPEN_READER', payload: null });
    window.close();
  };

  const handleLogout = async () => {
    await sendMessage({ type: 'LOGOUT', payload: null });
    setSettings(s => ({ ...s, authToken: null, authEmail: null }));
  };

  const isLoggedIn = !!settings.authToken;

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

        {isLoggedIn && (
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
        )}
      </div>

      <div style={{ padding: '14px' }}>
        {loading ? (
          <div style={{ color: C.subtext, fontSize: '12px', textAlign: 'center', padding: '8px 0' }}>
            Loading…
          </div>
        ) : isLoggedIn ? (
          /* ── Logged-in view ── */
          <>
            <div style={{
              fontSize: '11px', color: C.subtext,
              marginBottom: '12px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {settings.authEmail ?? 'Logged in'}
            </div>

            {activeTab && (
              <div style={{
                fontSize: '11px', color: C.subtext,
                marginBottom: '12px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {activeTab.title ?? activeTab.url ?? ''}
              </div>
            )}

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
                transition: 'all 0.15s', marginBottom: '8px',
              }}
            >
              Activate  <span style={{ fontWeight: 400, opacity: 0.7, fontSize: '11px' }}>Alt+A</span>
            </button>

            <button
              onClick={handleOpenReader}
              style={{
                width: '100%', background: 'transparent',
                color: C.subtext, border: `1px solid ${C.surface1}`,
                borderRadius: '6px', padding: '6px',
                cursor: 'pointer', fontSize: '11px',
                transition: 'all 0.15s', marginBottom: '6px',
              }}
            >
              eBook Reader
            </button>

            <button
              onClick={handleOpenSettings}
              style={{
                width: '100%', background: 'transparent',
                color: C.subtext, border: `1px solid ${C.surface1}`,
                borderRadius: '6px', padding: '6px',
                cursor: 'pointer', fontSize: '11px',
                transition: 'all 0.15s', marginBottom: '6px',
              }}
            >
              Settings
            </button>

            <button
              onClick={handleLogout}
              style={{
                width: '100%', background: 'transparent',
                color: C.red, border: `1px solid ${C.red}40`,
                borderRadius: '6px', padding: '6px',
                cursor: 'pointer', fontSize: '11px',
                transition: 'all 0.15s',
              }}
            >
              Sign Out
            </button>
          </>
        ) : (
          /* ── Logged-out view ── */
          <>
            <div style={{
              fontSize: '12px', color: C.subtext,
              marginBottom: '14px', textAlign: 'center', lineHeight: 1.5,
            }}>
              Sign in to sync your progress across devices.
            </div>
            <button
              onClick={handleOpenAuth}
              style={{
                width: '100%',
                background: C.blue,
                color: C.base,
                border: 'none', borderRadius: '6px',
                padding: '9px', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              Sign In / Register
            </button>
          </>
        )}
      </div>
    </div>
  );
}
