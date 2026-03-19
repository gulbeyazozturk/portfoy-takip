import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();
const APP_REDIRECT_URL =
  Constants.appOwnership === 'expo'
    ? Linking.createURL('auth/callback')
    : 'portfoytakip://auth/callback';

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

    // Uygulama her açıldığında kullanıcıyı logoff başlat.
    supabase.auth.signOut({ scope: 'local' }).finally(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setLoading(false);
      });
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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: APP_REDIRECT_URL, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: error?.message ?? 'OAuth başlatılamadı.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, APP_REDIRECT_URL);
    if (result.type !== 'success' || !result.url) {
      return { error: 'Giriş tamamlanamadı veya iptal edildi.' };
    }

    const params = parseUrlParams(result.url);
    const access_token = params.access_token;
    const refresh_token = params.refresh_token;

    if (!access_token || !refresh_token) {
      return { error: 'Oturum bilgisi alınamadı.' };
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
