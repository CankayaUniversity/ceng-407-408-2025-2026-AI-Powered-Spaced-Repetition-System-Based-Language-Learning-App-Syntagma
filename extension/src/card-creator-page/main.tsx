import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback } from 'react';
import { CardCreatorApp } from './CardCreatorApp';
import { AuthApp } from '../auth-page/AuthApp';
import { sendMessage } from '../shared/messages';
import type { UserSettings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/storage';

function Root() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const isLoggedIn = !!settings.authToken;

  const loadSettings = useCallback(async () => {
    try {
      const s = await sendMessage<UserSettings>({ type: 'GET_SETTINGS', payload: null });
      setSettings(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.userSettings) {
        const updated = changes.userSettings.newValue as UserSettings;
        setSettings(prev => ({ ...prev, ...updated }));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [loadSettings]);

  useEffect(() => {
    document.title = isLoggedIn ? 'Syntagma — Card Creator' : 'Syntagma — Sign In';
  }, [isLoggedIn]);

  if (loading) {
    return (
      <div style={{
        background: '#F5F1E9',
        color: '#877666',
        height: '100vh',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        Loading...
      </div>
    );
  }

  if (!isLoggedIn) {
    return <AuthApp inline />;
  }

  return <CardCreatorApp />;
}

createRoot(document.getElementById('root')!).render(<Root />);
