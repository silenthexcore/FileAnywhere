import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  defaultPreferences,
  loadPreferences,
  PREFERENCES_KEY,
  resolveTheme,
  type Language,
  type Preferences,
  type ThemeMode,
} from './preferences';

interface PreferencesContextValue {
  prefs: Preferences;
  updatePrefs: (patch: Partial<Preferences>) => void;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  resolvedTheme: 'light' | 'dark';
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(() => {
    const loaded = loadPreferences();
    if (!localStorage.getItem(PREFERENCES_KEY)) {
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(loaded));
      } catch {
        /* ignore */
      }
    }
    return loaded;
  });
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(prefs.theme));

  const updatePrefs = useCallback((patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setTheme = useCallback((theme: ThemeMode) => updatePrefs({ theme }), [updatePrefs]);
  const setLanguage = useCallback((language: Language) => updatePrefs({ language }), [updatePrefs]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = resolveTheme(prefs.theme);
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.content = resolved === 'dark' ? '#080b12' : '#f4f6fb';
    };
    apply();
    if (prefs.theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [prefs.theme]);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === PREFERENCES_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as Partial<Preferences>;
          setPrefs((current) => ({ ...current, ...parsed }));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const value = useMemo(
    () => ({ prefs: prefs || defaultPreferences, updatePrefs, setTheme, setLanguage, resolvedTheme }),
    [prefs, updatePrefs, setTheme, setLanguage, resolvedTheme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}
