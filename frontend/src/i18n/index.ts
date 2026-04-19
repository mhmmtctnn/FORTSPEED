/**
 * i18n barrel — single import point for all language utilities.
 *
 * Adding i18n to a new page/component:
 *   1. import { useT } from '../i18n';          (adjust path depth)
 *   2. const t = useT();                         (inside the component)
 *   3. Replace hardcoded strings: t('your_key')
 *   4. Add the key + translations to translations.ts (all 4 locales)
 *
 * Adding a new locale:
 *   1. Add the locale to the Locale union in translations.ts
 *   2. Add the full translation object for that locale
 *   3. Add flag + label to LOCALE_FLAGS / LOCALE_LABELS
 *   4. Done — LanguageContext picks it up automatically.
 */

export { useT } from './useT';
export { useLanguage, LanguageProvider } from './LanguageContext';
export type { Locale } from './translations';
export { LOCALE_FLAGS, LOCALE_LABELS, LOCALE_BCP47 } from './translations';
