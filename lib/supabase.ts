import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const isWeb = Platform.OS === 'web';
const hasLocalStorage =
  isWeb && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (hasLocalStorage) return window.localStorage.getItem(key);
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (hasLocalStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // native / SSR'da sessizce yoksay
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (hasLocalStorage) {
      window.localStorage.removeItem(key);
      return;
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // native / SSR'da yoksay
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage,
    // PKCE code_verifier bellekte tutulursa (persistSession: false) tarayıcı dönüşünde sık kaybolur; AsyncStorage şart.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: isWeb,
    // Mobil / Expo: implicit (#access_token) hash'i deep link ile sık kaybolur; PKCE ?code= güvenilir.
    flowType: 'pkce',
  },
});
