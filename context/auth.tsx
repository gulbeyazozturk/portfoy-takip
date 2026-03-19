import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();
// app/oauth-callback.tsx ile aynı yol — Supabase Redirect URLs’e Metro’da log’lanan tam adresi ekleyin.
const APP_REDIRECT_URL = Linking.createURL('oauth-callback');

function getOAuthRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/oauth-callback`;
  }
  return APP_REDIRECT_URL;
}

if (__DEV__) {
  // Supabase Dashboard → Authentication → URL Configuration → Redirect URLs içine bu adresi aynen ekleyin.
  console.log('[auth] OAuth redirectTo (Expo/Supabase):', APP_REDIRECT_URL);
}

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null; hasSession: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function parseUrlParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const [, hash = ''] = url.split('#');
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';

  const all = [query, hash].filter(Boolean).join('&');
  all.split('&').forEach((entry) => {
    const [k, v] = entry.split('=');
    if (!k) return;
    out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  });
  return out;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: APP_REDIRECT_URL },
    });
    return { error: error?.message ?? null };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message, hasSession: false };

    const { data } = await supabase.auth.getSession();
    const hasSession = !!data.session;
    return {
      error: hasSession ? null : 'Giriş tamamlanamadı. Lütfen tekrar dene.',
      hasSession,
    };
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google' | 'apple') => {
    const redirectTo = getOAuthRedirectUrl();

    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      return { error: error?.message ?? null };
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: error?.message ?? 'OAuth başlatılamadı.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, APP_REDIRECT_URL);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { error: 'Giriş iptal edildi.' };
    }
    if (result.type !== 'success' || !result.url) {
      if (__DEV__) console.warn('[auth] openAuthSessionAsync:', result.type, result);
      return { error: 'Giriş tamamlanamadı. Metro konsoldaki redirect URL’yi Supabase’e ekleyip tekrar deneyin.' };
    }

    const params = parseUrlParams(result.url);

    if (params.error) {
      const raw = params.error_description ?? params.error;
      return { error: raw.replace(/\+/g, ' ') };
    }

    // PKCE (önerilen): ?code=...
    if (params.code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
      if (exchangeError && __DEV__) console.warn('[auth] exchangeCodeForSession:', exchangeError);
      if (exchangeError?.message?.toLowerCase().includes('code verifier')) {
        return {
          error:
            'Oturum anahtarı eşleşmedi. Uygulamayı tam kapatıp tekrar açın, sonra Google’ı yeniden deneyin.',
        };
      }
      return { error: exchangeError?.message ?? null };
    }

    // Eski implicit akış: #access_token=...
    const access_token = params.access_token;
    const refresh_token = params.refresh_token;
    if (!access_token || !refresh_token) {
      return {
        error:
          'Oturum bilgisi alınamadı. Supabase’te Redirect URLs listesinde bu adres olmalı: ' + redirectTo,
      };
    }

    const { error: setSessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    return { error: setSessionError?.message ?? null };
  }, []);

  const signInWithGoogle = useCallback(() => signInWithOAuth('google'), [signInWithOAuth]);
  const signInWithApple = useCallback(() => signInWithOAuth('apple'), [signInWithOAuth]);

  const signOut = useCallback(async () => {
    setSession(null);
    setLoading(false);
    // Local sign-out is enough to clear persisted auth
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      // If local signout fails, try global fallback.
      await supabase.auth.signOut();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      signUpWithEmail,
      signInWithEmail,
      signInWithGoogle,
      signInWithApple,
      signOut,
    }),
    [loading, session, signUpWithEmail, signInWithEmail, signInWithGoogle, signInWithApple, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
