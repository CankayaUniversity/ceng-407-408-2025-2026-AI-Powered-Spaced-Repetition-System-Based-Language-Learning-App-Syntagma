import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getThemePreference, saveThemePreference } from './storage';

const ThemeContext = createContext({
  isDark: false,
  colors: {},
  setIsDark: () => {},
});

const lightColors = {
  background: '#F2EDE4',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  mutedSurface: '#F7F3EE',
  border: '#EAE0D4',
  textPrimary: '#1A1009',
  textSecondary: '#8A7A6A',
  textMuted: '#A08C7C',
  accent: '#6B4226',
  accentSoft: '#F5C49A',
  accentStrong: '#C49A6C',
  warning: '#9C3D2D',
  pill: '#EDEBE6',
  overlay: 'rgba(25, 18, 12, 0.4)',
};

const darkColors = {
  background: '#161412',
  surface: '#1F1C19',
  card: '#24201C',
  mutedSurface: '#2A2622',
  border: '#2E2924',
  textPrimary: '#F4EBDD',
  textSecondary: '#C2B5A4',
  textMuted: '#9C8F7E',
  accent: '#F2C59A',
  accentSoft: '#5E412B',
  accentStrong: '#E1A46C',
  warning: '#E07B6E',
  pill: '#2C2824',
  overlay: 'rgba(8, 8, 8, 0.6)',
};

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadPreference = async () => {
      const saved = await getThemePreference();
      if (isMounted && typeof saved === 'boolean') {
        setIsDark(saved);
      }
    };

    loadPreference();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateTheme = useCallback((value) => {
    setIsDark(value);
    saveThemePreference(value);
  }, []);

  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  const value = useMemo(
    () => ({
      isDark,
      colors,
      setIsDark: updateTheme,
    }),
    [colors, isDark, updateTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
