import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIFICATIONS_ENABLED_STORAGE_KEY = '@omnifolio_notifications_enabled';

export async function getNotificationsEnabledPreference(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_STORAGE_KEY);
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

export async function setNotificationsEnabledPreference(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage write failures
  }
}
