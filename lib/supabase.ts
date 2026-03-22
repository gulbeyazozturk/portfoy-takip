import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/** EAS/mağaza build'de .env gitmediği için boş kalabilir; UI'da ayrı ekran gösterilir. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** createClient boş URL ile senkron hata verebilir; yalnızca yapılandırma ekranı dışında kullanılmaz. */
const PLACEHOLDER_URL = 'https://configuration-required.supabase.co';
const PLACEHOLDER_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder-not-used';

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

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : PLACEHOLDER_URL,
  isSupabaseConfigured ? supabaseAnonKey : PLACEHOLDER_KEY,
  {
    auth: {
      storage: safeStorage,
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: isWeb && isSupabaseConfigured,
      flowType: 'pkce',
    },
  },
);
