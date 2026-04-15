import { useLanguage } from './LanguageContext';

/**
 * Shorthand i18n hook.
 *
 * Usage in any component:
 *   import { useT } from '../i18n';
 *   const t = useT();
 *   <h1>{t('dashboard_title')}</h1>
 *
 * If a local variable named `t` already exists (e.g. inside a .map()),
 * alias it: const translate = useT();
 */
export const useT = () => useLanguage().t;
