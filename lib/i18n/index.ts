import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en';
import tr from '@/locales/tr';

export const LANG_STORAGE_KEY = '@omnifolio_lang';

/** Telefon dili Türkçe ise `tr`, aksi halde `en` (kayıtlı tercih yokken kullanılır). */
export function getDevicePreferredAppLang(): 'tr' | 'en' {
  try {
    const locales = Localization.getLocales();
    const code = (locales[0]?.languageCode ?? 'en').toLowerCase();
    if (code === 'tr') return 'tr';
    return 'en';
  } catch {
    return 'en';
  }
}

const initialLng = getDevicePreferredAppLang();

void i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: initialLng,
  fallbackLng: 'tr',
  compatibilityJSON: 'v4',
  interpolation: { escapeValue: false },
});

AsyncStorage.getItem(LANG_STORAGE_KEY).then((stored) => {
  if (stored === 'en' || stored === 'tr') {
    void i18n.changeLanguage(stored);
  }
});

export async function setAppLanguage(lng: 'tr' | 'en'): Promise<void> {
  await AsyncStorage.setItem(LANG_STORAGE_KEY, lng);
  await i18n.changeLanguage(lng);
}

export default i18n;
