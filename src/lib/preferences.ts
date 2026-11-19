import type { TranslationKey } from '../i18n/en';

export type Language = 'en' | 'zh-CN' | 'zh-TW';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ViewMode = 'list' | 'grid';
export type SortKey = 'name' | 'modified' | 'size' | 'type';
export type SortDirection = 'asc' | 'desc';

export interface Preferences {
  theme: ThemeMode;
  language: Language;
  view: ViewMode;
  showHidden: boolean;
  sortBy: SortKey;
  sortDirection: SortDirection;
  editorWrap: boolean;
  editorFontSize: number;
}

export const defaultPreferences: Preferences = {
  theme: 'system',
  language: 'en',
  view: 'list',
  showHidden: false,
  sortBy: 'name',
  sortDirection: 'asc',
  editorWrap: true,
  editorFontSize: 13,
};

export const PREFERENCES_KEY = 'fa.prefs.v1';

export function detectLanguage(): Language {
  const candidates = [navigator.language, ...(navigator.languages || [])].map((item) => item.toLowerCase());
  for (const candidate of candidates) {
    if (candidate.startsWith('zh-tw') || candidate.startsWith('zh-hk') || candidate.startsWith('zh-mo')) return 'zh-TW';
    if (candidate.startsWith('zh')) return 'zh-CN';
  }
  return 'en';
}

export function loadPreferences(): Preferences {
  const fallback: Preferences = { ...defaultPreferences, language: detectLanguage() };
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      ...fallback,
      ...parsed,
      theme: ['system', 'light', 'dark'].includes(String(parsed.theme)) ? (parsed.theme as ThemeMode) : fallback.theme,
      language: ['en', 'zh-CN', 'zh-TW'].includes(String(parsed.language))
        ? (parsed.language as Language)
        : fallback.language,
      view: parsed.view === 'grid' ? 'grid' : 'list',
      sortBy: ['name', 'modified', 'size', 'type'].includes(String(parsed.sortBy))
        ? (parsed.sortBy as SortKey)
        : 'name',
      sortDirection: parsed.sortDirection === 'desc' ? 'desc' : 'asc',
      editorFontSize: Math.min(Math.max(Number(parsed.editorFontSize) || 13, 11), 22),
    };
  } catch {
    return fallback;
  }
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function translateError(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  error: { code?: string; message?: string; details?: unknown } | null | undefined,
): string {
  const code = error?.code || 'UNKNOWN';
  const key = `error.${code}` as TranslationKey;
  const details = error?.details as { retryAfter?: number; paths?: string[] } | undefined;
  if (code === 'TOO_MANY_ATTEMPTS') {
    return t(key, { seconds: details?.retryAfter || 60 });
  }
  try {
    const translated = t(key as TranslationKey);
    if (translated && translated !== key) return translated;
  } catch {
    /* fall through */
  }
  return error?.message || t('error.UNKNOWN');
}
