import { useSyncExternalStore } from 'react';
import { getLanguage, getLocale, setLanguage, subscribeLanguage, t } from './i18n.js';

export function useLanguage() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'zh');
  return { language, locale: getLocale(), setLanguage, t };
}
