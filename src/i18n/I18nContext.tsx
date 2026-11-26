import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { translations, type Lang, type TranslationKey } from './translations';

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LANG_STORAGE_KEY = 'ftk_lang_v1';

function detectInitialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'pl' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) {
    return 'en';
  }
  return 'pl';
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let text: string = translations[lang][key] ?? translations.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    [lang]
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
