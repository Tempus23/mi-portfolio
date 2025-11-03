import cvDataEn from '@/data/cv_data.json';
import cvDataEs from '@/data/cv_data_es.json';
import translations from '@/data/translations.json';
import type { Language } from './languageStore';

export function getCvData(lang: Language) {
  return lang === 'es' ? cvDataEs : cvDataEn;
}

export function getTranslations(lang: Language) {
  return lang === 'es' ? translations.es : translations.en;
}
