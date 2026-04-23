import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@omnifolio_welcome_v1';

export function welcomeStorageKey(userId: string): string {
  return `${PREFIX}:${userId}`;
}

export async function isWelcomeDismissedForUser(userId: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(welcomeStorageKey(userId));
  return v === '1';
}

export async function setWelcomeDismissedForUser(userId: string): Promise<void> {
  await AsyncStorage.setItem(welcomeStorageKey(userId), '1');
}
