import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import translations, { Locale, TranslationKey } from './translations';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
  isRtl: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'tr',
  setLocale: () => {},
  t: (key) => key,
  isRtl: false,
});

const RTL_LOCALES: Locale[] = ['ar'];
const STORAGE_KEY = 'speedtest_locale';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    return (saved && saved in translations) ? saved : 'tr';
  });

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLocaleState(l);
  }, []);

  const isRtl = RTL_LOCALES.includes(locale);

  useEffect(() => {
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', locale);
  }, [locale, isRtl]);

  const t = useCallback((key: TranslationKey): string => {
    const dict = translations[locale] as Record<string, string>;
    return dict[key] ?? (translations['tr'] as Record<string, string>)[key] ?? key;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, isRtl }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
