import AsyncStorage from '@react-native-async-storage/async-storage';

export const USD_TRY_CACHE_STORAGE_KEY = 'omnifolio_last_usd_try_v1';

/** `kriptoStoredUnitToUsd` ile uyum: anlamlı TRY/USD kuru (gerçek kur ~30+). */
export const MIN_VALID_USD_TRY_RATE = 5;

export async function readCachedUsdTryRate(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(USD_TRY_CACHE_STORAGE_KEY);
    const n = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > MIN_VALID_USD_TRY_RATE) return n;
  } catch {
    /* ignore */
  }
  return null;
}

export async function persistUsdTryRate(rate: number): Promise<void> {
  if (!Number.isFinite(rate) || rate <= MIN_VALID_USD_TRY_RATE) return;
  try {
    await AsyncStorage.setItem(USD_TRY_CACHE_STORAGE_KEY, String(rate));
  } catch {
    /* ignore */
  }
}
