import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { parseAuthCallbackParams } from '@/lib/auth-callback-params';
import i18n from '@/lib/i18n';
import { waitForSupabaseSessionAfterBrowser } from '@/lib/oauth-session-wait';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * OAuth redirect — asla modül yüklemede sabitleme: Expo Go’da Metro IP/port sonradan gelir;
 * eski URL Supabase’e giderse geri dönüş kırılır.
 * app/oauth-callback.tsx ile aynı path; Supabase Redirect URLs’e bu tam string(ler)i ekleyin.
 *
 * __DEV__ + native: `EXPO_PUBLIC_OAUTH_REDIRECT_URL` tanımlıysa (tünel / manuel) onu kullan —
 * Supabase LAN IP’li exp:// adreslerini reddedebilir (github.com/supabase/auth/issues/2039).
 */
function getOAuthRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/oauth-callback`;
  }
  const devOverride = __DEV__ ? (process.env.EXPO_PUBLIC_OAUTH_REDIRECT_URL ?? '').trim() : '';
  if (devOverride && Platform.OS !== 'web') {
    return devOverride;
  }

  return Linking.createURL('oauth-callback');
}

/** Şifre sıfırlama e-postasındaki link; Supabase Redirect URLs’e de ekleyin (örn. omnifolio://reset-password). */
function getPasswordRecoveryRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/reset-password`;
  }
  return Linking.createURL('reset-password');
}

function isPasswordRecoveryPath(url: string | null): boolean {
  if (!url) return false;
  // Legacy / farklı template'lerden gelebilen path adlarını da kabul et.
  return /(reset-password|update-password|password-reset|resetPassword)/i.test(url);
}

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  passwordRecoveryPending: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null; hasSession: boolean }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<{ error: string | null }>;
  completePasswordRecoveryFlow: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapAuthSignInError(message: string): string {
  const normalized = (message || '').toLowerCase();
  if (normalized.includes('invalid login credentials')) {
    return i18n.t('auth.invalidCredentials');
  }
  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);

  const handleRecoveryUrl = useCallback(async (url: string | null) => {
    if (!isPasswordRecoveryPath(url)) return;
    const params = parseAuthCallbackParams(url);
    if (params.code) {
      setPasswordRecoveryPending(true);
      await supabase.auth.exchangeCodeForSession(params.code);
      return;
    }
    const access_token = params.access_token;
    const refresh_token = params.refresh_token;
    /** reset-password link path’inde token’lar recovery içindir. */
    if (access_token && refresh_token) {
      setPasswordRecoveryPending(true);
      await supabase.auth.setSession({ access_token, refresh_token });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        await handleRecoveryUrl(await Linking.getInitialURL());
      } catch {
        /* invalid recovery link */
      }
      if (!mounted) return;
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    })();

    const subLink = Linking.addEventListener('url', ({ url }) => {
      void handleRecoveryUrl(url);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryPending(true);
      }
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subLink.remove();
      sub.subscription.unsubscribe();
    };
  }, [handleRecoveryUrl]);

  const completePasswordRecoveryFlow = useCallback(() => {
    setPasswordRecoveryPending(false);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getOAuthRedirectUrl() },
    });
    return { error: error?.message ?? null };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: mapAuthSignInError(error.message), hasSession: false };

    const { data } = await supabase.auth.getSession();
    const hasSession = !!data.session;
    return {
      error: hasSession ? null : i18n.t('errors.signInIncomplete'),
      hasSession,
    };
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const redirectTo = getPasswordRecoveryRedirectUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    return { error: error?.message ?? null };
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google' | 'apple') => {
    const redirectTo = getOAuthRedirectUrl();

    if (Platform.OS === 'web') {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return { error: error.message ?? null };
      if (data?.url && typeof window !== 'undefined') {
        window.location.assign(data.url);
        return { error: null };
      }
      return { error: i18n.t('errors.oauthStart') };
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: error?.message ?? i18n.t('errors.oauthStart') };

    let result: WebBrowser.WebBrowserAuthSessionResult;
    try {
      result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch {
      return { error: i18n.t('errors.oauthIncomplete') };
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      let { data: afterDismiss } = await supabase.auth.getSession();
      if (!afterDismiss.session) {
        const waited = await waitForSupabaseSessionAfterBrowser();
        if (waited) {
          afterDismiss = (await supabase.auth.getSession()).data;
        }
      }
      if (afterDismiss.session) return { error: null };
      return { error: i18n.t('errors.oauthCancelled') };
    }
    if (result.type !== 'success' || !result.url) {
      let { data: afterBad } = await supabase.auth.getSession();
      if (!afterBad.session) {
        const waited = await waitForSupabaseSessionAfterBrowser();
        if (waited) afterBad = (await supabase.auth.getSession()).data;
      }
      if (afterBad.session) return { error: null };
      return { error: i18n.t('errors.oauthIncomplete') };
    }

    let params: Record<string, string>;
    try {
      params = parseAuthCallbackParams(result.url);
    } catch {
      return { error: i18n.t('errors.oauthIncomplete') };
    }

    if (params.error) {
      const raw = params.error_description ?? params.error;
      return { error: raw.replace(/\+/g, ' ') };
    }

    try {
      if (params.code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
        if (!exchangeError) {
          return { error: null };
        }
        if (exchangeError.message?.toLowerCase().includes('code verifier')) {
          return {
            error: i18n.t('errors.pkceMismatch'),
          };
        }
        const { data: postEx } = await supabase.auth.getSession();
        if (postEx.session) return { error: null };
        const waited = await waitForSupabaseSessionAfterBrowser(45);
        if (waited) {
          const { data: late } = await supabase.auth.getSession();
          if (late.session) return { error: null };
        }
        return { error: exchangeError.message ?? null };
      }

      {
        const { data: sid } = await supabase.auth.getSession();
        if (sid.session) return { error: null };
        const ok = await waitForSupabaseSessionAfterBrowser();
        if (ok && (await supabase.auth.getSession()).data.session) {
          return { error: null };
        }
      }

      const access_token = params.access_token;
      const refresh_token = params.refresh_token;
      if (!access_token || !refresh_token) {
        return {
          error: i18n.t('errors.sessionParams', { url: redirectTo }),
        };
      }

      const { error: setSessionError } = await supabase.auth.setSession({ access_token, refresh_token });
      return { error: setSessionError?.message ?? null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: msg || i18n.t('errors.oauthIncomplete') };
    }
  }, []);

  const signInWithGoogle = useCallback(() => signInWithOAuth('google'), [signInWithOAuth]);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS === 'ios') {
      const available = await AppleAuthentication.isAvailableAsync();
      if (available) {
        try {
          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          });

          if (!credential.identityToken) {
            return { error: i18n.t('errors.appleToken') };
          }

          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken,
          });

          return { error: error?.message ?? null };
        } catch (e: unknown) {
          const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
          if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
            return { error: i18n.t('errors.oauthCancelled') };
          }
          const msg = e instanceof Error ? e.message : i18n.t('errors.appleNativeFailed');
          return { error: msg };
        }
      }
    }

    return signInWithOAuth('apple');
  }, [signInWithOAuth]);

  const signOut = useCallback(async () => {
    setPasswordRecoveryPending(false);
    setSession(null);
    setLoading(false);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      await supabase.auth.signOut();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      passwordRecoveryPending,
      signUpWithEmail,
      signInWithEmail,
      requestPasswordReset,
      signInWithGoogle,
      signInWithApple,
      completePasswordRecoveryFlow,
      signOut,
    }),
    [
      loading,
      session,
      passwordRecoveryPending,
      signUpWithEmail,
      signInWithEmail,
      requestPasswordReset,
      signInWithGoogle,
      signInWithApple,
      completePasswordRecoveryFlow,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
