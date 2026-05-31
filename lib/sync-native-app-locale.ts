import { Platform } from 'react-native';
import { setLanguage } from 'react-native-localization-settings';

/** Uygulama içi dil seçimini Android/iOS native locale ile eşleştirir (DatePicker vb.). */
export async function syncNativeAppLocale(lng: 'tr' | 'en'): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await setLanguage(lng === 'tr' ? 'tr-TR' : 'en-US');
  } catch {
    // Expo Go veya native modül yok — yalnızca JS i18n kullanılır.
  }
}
