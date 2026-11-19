import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { en, type TranslationKey } from './en';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';
import { usePreferences } from '../lib/PreferencesContext';
import type { Language } from '../lib/preferences';

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
};

const locales: Record<Language, string> = {
  en: 'en-US',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
};

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

interface I18nValue {
  t: Translate;
  language: Language;
  locale: string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePreferences();
  const language = prefs.language;
  const value = useMemo<I18nValue>(() => {
    const dictionary = dictionaries[language] || en;
    const t: Translate = (key, vars) => {
      let text = dictionary[key] ?? en[key] ?? String(key);
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
        }
      }
      return text;
    };
    return { t, language, locale: locales[language] };
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

export type { TranslationKey };
