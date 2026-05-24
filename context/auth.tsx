import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { createAppleSignInNonce } from '@/lib/apple-sign-in-nonce';
import { parseAuthCallbackParams } from '@/lib/auth-callback-params';
import { mapAuthErrorMessage } from '@/lib/auth-error-map';
import i18n from '@/lib/i18n';
import {
  getOAuthRedirectUrl,
  openPreparedOAuthSession,
  prepareOAuthSignInUrl,
} from '@/lib/oauth-native-sign-in';
import { waitForSupabaseSessionAfterBrowser } from '@/lib/oauth-session-wait';
import { syncPushTokenForUser } from '@/lib/push-token-sync';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

/** Şifre sıfırlama e-postasındaki link; Supabase Redirect URLs’e de ekleyin (örn. omnifolio://reset-password). */
function getPasswordRecoveryRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/reset-password`;
  }
  const devOverride = __DEV__ ? (process.env.EXPO_PUBLIC_PASSWORD_RESET_REDIRECT_URL ?? '').trim() : '';
  if (devOverride && Platform.OS !== 'web') {
    return devOverride;
  }
  return Linking.createURL('reset-password');
}

function isPasswordRecoveryPath(url: string | null): boolean {
  if (!url) return false;
  // Legacy / farklı template'lerden gelebilen path adlarını da kabul et.
  return /(reset-password|update-password|password-reset|resetPassword)/i.test(url);
}

type SocialSignInResult = { error: string | null; hasSession: boolean };

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  passwordRecoveryPending: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null; hasSession: boolean }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<SocialSignInResult>;
  /** iOS: önceden hazırlanmış URL ile tarayıcıyı hemen aç (kullanıcı jesti). */
  signInWithGooglePrepared: (prepared: { url: string; redirectTo: string }) => Promise<SocialSignInResult>;
  prepareGoogleOAuth: () => Promise<{ prepared: { url: string; redirectTo: string } | null; error: string | null }>;
  signInWithApple: () => Promise<SocialSignInResult>;
  completePasswordRecoveryFlow: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);

  const handleRecoveryUrl = useCallback(async (url: string | null) => {
    if (!url || !isPasswordRecoveryPath(url)) return;
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

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    void syncPushTokenForUser(uid);
  }, [session?.user?.id]);

  const completePasswordRecoveryFlow = useCallback(() => {
    setPasswordRecoveryPending(false);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getOAuthRedirectUrl() },
    });
    return { error: error ? mapAuthErrorMessage(error.message) : null };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: mapAuthErrorMessage(error.message), hasSession: false };

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
    return { error: error ? mapAuthErrorMessage(error.message) : null };
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google' | 'apple'): Promise<SocialSignInResult> => {
    if (Platform.OS === 'web') {
      const redirectTo = getOAuthRedirectUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return { error: mapAuthErrorMessage(error.message), hasSession: false };
      if (data?.url && typeof window !== 'undefined') {
        window.location.assign(data.url);
        return { error: null, hasSession: false };
      }
      return { error: i18n.t('errors.oauthStart'), hasSession: false };
    }

    const { prepared, error } = await prepareOAuthSignInUrl(provider);
    if (error || !prepared) {
      return { error: error ?? i18n.t('errors.oauthStart'), hasSession: false };
    }
    return openPreparedOAuthSession(prepared);
  }, []);

  const signInWithGoogle = useCallback(() => signInWithOAuth('google'), [signInWithOAuth]);

  const signInWithGooglePrepared = useCallback(
    (prepared: { url: string; redirectTo: string }) => openPreparedOAuthSession(prepared),
    [],
  );

  const prepareGoogleOAuth = useCallback(() => prepareOAuthSignInUrl('google'), []);

  const signInWithApple = useCallback(async (): Promise<SocialSignInResult> => {
    if (Platform.OS !== 'ios') {
      return signInWithOAuth('apple');
    }

    try {
      const { rawNonce, hashedNonce } = await createAppleSignInNonce();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        return { error: i18n.t('errors.appleToken'), hasSession: false };
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) {
        return { error: mapAuthErrorMessage(error.message), hasSession: false };
      }

      if (credential.fullName) {
        const parts: string[] = [];
        if (credential.fullName.givenName) parts.push(credential.fullName.givenName);
        if (credential.fullName.middleName) parts.push(credential.fullName.middleName);
        if (credential.fullName.familyName) parts.push(credential.fullName.familyName);
        const fullName = parts.join(' ').trim();
        if (fullName) {
          void supabase.auth.updateUser({
            data: {
              full_name: fullName,
              given_name: credential.fullName.givenName ?? undefined,
              family_name: credential.fullName.familyName ?? undefined,
            },
          });
        }
      }

      const hasSession = !!data.session;
      if (hasSession) return { error: null, hasSession: true };

      const waited = await waitForSupabaseSessionAfterBrowser(90);
      return { error: null, hasSession: waited };
    } catch (e: unknown) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
      if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
        return { error: i18n.t('errors.oauthCancelled'), hasSession: false };
      }
      const msg = e instanceof Error ? e.message : i18n.t('errors.appleNativeFailed');
      return { error: mapAuthErrorMessage(msg), hasSession: false };
    }
  }, []);

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
      signInWithGooglePrepared,
      prepareGoogleOAuth,
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
      signInWithGooglePrepared,
      prepareGoogleOAuth,
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
