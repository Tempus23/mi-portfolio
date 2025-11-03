// Language store for managing language preference
export type Language = 'en' | 'es';

const LANGUAGE_KEY = 'preferred-language';
const DEFAULT_LANGUAGE: Language = 'en';

export function getLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored === 'en' || stored === 'es') {
    return stored;
  }
  return DEFAULT_LANGUAGE;
}

export function setLanguage(lang: Language): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LANGUAGE_KEY, lang);
  
  // Dispatch custom event for components to listen to
  window.dispatchEvent(new CustomEvent('languagechange', { detail: { language: lang } }));
}
