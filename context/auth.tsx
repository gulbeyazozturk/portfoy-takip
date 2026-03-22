import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import i18n from '@/lib/i18n';
import { waitForSupabaseSessionAfterBrowser } from '@/lib/oauth-session-wait';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

/** Expo Go LAN: exp://192.168.x.x/... — Supabase sunucusu özel IP içeren redirect’leri reddedebilir (auth#2039). */
const EXPO_REDIRECT_HAS_PRIVATE_HOST = /\/\/(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.0\.0\.1)(?::|\/)/;

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
    console.log('[Omnifolio OAuth] redirectTo (EXPO_PUBLIC_OAUTH_REDIRECT_URL):', devOverride);
    return devOverride;
  }

  const url = Linking.createURL('oauth-callback');
  if (
    __DEV__ &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    EXPO_REDIRECT_HAS_PRIVATE_HOST.test(url)
  ) {
    console.warn(
      '[Omnifolio OAuth] Expo Go (LAN) redirect’inde yerel ağ IP’si var; Supabase bu adresi sunucuda reddedebilir. Çözüm: `.env` içinde `EXPO_PUBLIC_OAUTH_REDIRECT_URL` = Metro’daki tünel/exp adresi (aynısını Supabase Redirect URLs’e ekleyin), veya `npx expo start --tunnel`, veya TestFlight/dev build. Ref: https://github.com/supabase/auth/issues/2039',
    );
  }
  return url;
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

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseUrlParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const [, hash = ''] = url.split('#');
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';

  const all = [query, hash].filter(Boolean).join('&');
  all.split('&').forEach((entry) => {
    if (!entry) return;
    const eq = entry.indexOf('=');
    const k = eq >= 0 ? entry.slice(0, eq) : entry;
    const v = eq >= 0 ? entry.slice(eq + 1) : '';
    if (!k) return;
    out[safeDecode(k)] = safeDecode(v);
  });
  return out;
}

/** exp:// / custom scheme dönüşleri için Linking.parse + manuel parse birleşimi. */
function parseOAuthReturnUrl(url: string): Record<string, string> {
  const out = parseUrlParams(url);
  try {
    const parsed = Linking.parse(url);
    if (parsed.queryParams) {
      for (const [k, v] of Object.entries(parsed.queryParams)) {
        if (v == null) continue;
        const raw = Array.isArray(v) ? v[0] : v;
        if (raw == null) continue;
        out[k] = typeof raw === 'string' ? safeDecode(raw) : safeDecode(String(raw));
      }
    }
  } catch {
    /* parseUrlParams yeterli */
  }
  return out;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
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
      options: { emailRedirectTo: getOAuthRedirectUrl() },
    });
    return { error: error?.message ?? null };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message, hasSession: false };

    const { data } = await supabase.auth.getSession();
    const hasSession = !!data.session;
    return {
      error: hasSession ? null : i18n.t('errors.signInIncomplete'),
      hasSession,
    };
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google' | 'apple') => {
    const redirectTo = getOAuthRedirectUrl();
    if (__DEV__) {
      // Metro konsolunda gerçek string — Supabase Redirect URLs ile karşılaştır.
      console.log('[Omnifolio OAuth] redirectTo:', redirectTo);
    }

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
    if (error || !data?.url) return { error: error?.message ?? i18n.t('errors.oauthStart') };

    let result: WebBrowser.WebBrowserAuthSessionResult;
    try {
      /** İkinci argüman redirectTo ile birebir aynı olmalı (iOS/Android session eşleşmesi). */
      result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch {
      return { error: i18n.t('errors.oauthIncomplete') };
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      /** Deep link + PKCE exchange auth sheet kapanırken birkaç kare gecikebilir (Google). */
      let { data: afterDismiss } = await supabase.auth.getSession();
      if (!afterDismiss.session) {
        const waited = await waitForSupabaseSessionAfterBrowser();
        if (waited) {
          afterDismiss = (await supabase.auth.getSession()).data;
        }
      }
      // #region agent log
      fetch('http://127.0.0.1:7329/ingest/53538a73-b612-479d-b80d-75820501e1ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d02655'},body:JSON.stringify({sessionId:'d02655',runId:'google-oauth2',hypothesisId:'G4',location:'auth.tsx:dismiss',message:'auth session after dismiss',data:{provider,hasSession:!!afterDismiss.session},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (afterDismiss.session) return { error: null };
      return { error: i18n.t('errors.oauthCancelled') };
    }
    if (result.type !== 'success' || !result.url) {
      let { data: afterBad } = await supabase.auth.getSession();
      if (!afterBad.session) {
        const waited = await waitForSupabaseSessionAfterBrowser();
        if (waited) afterBad = (await supabase.auth.getSession()).data;
      }
      // #region agent log
      fetch('http://127.0.0.1:7329/ingest/53538a73-b612-479d-b80d-75820501e1ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d02655'},body:JSON.stringify({sessionId:'d02655',runId:'google-oauth2',hypothesisId:'G4',location:'auth.tsx:noResultUrl',message:'non-success but check session',data:{provider,type:result.type,hasSession:!!afterBad.session},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (afterBad.session) return { error: null };
      return { error: i18n.t('errors.oauthIncomplete') };
    }

    // #region agent log
    fetch('http://127.0.0.1:7329/ingest/53538a73-b612-479d-b80d-75820501e1ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d02655'},body:JSON.stringify({sessionId:'d02655',runId:'pre-fix',hypothesisId:'H3',location:'auth.tsx:openAuthSession',message:'browser session success',data:{provider,urlLen:result.url.length,hasHash:result.url.includes('#'),hasQueryCode:result.url.includes('code=')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    let params: Record<string, string>;
    try {
      params = parseOAuthReturnUrl(result.url);
    } catch {
      return { error: i18n.t('errors.oauthIncomplete') };
    }

    if (params.error) {
      const raw = params.error_description ?? params.error;
      return { error: raw.replace(/\+/g, ' ') };
    }

    try {
      // PKCE (önerilen): ?code=...
      if (params.code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
        // #region agent log
        fetch('http://127.0.0.1:7329/ingest/53538a73-b612-479d-b80d-75820501e1ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d02655'},body:JSON.stringify({sessionId:'d02655',runId:'google-oauth2',hypothesisId:'H3',location:'auth.tsx:afterExchange',message:'in-app exchange result',data:{provider,hasErr:!!exchangeError},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (!exchangeError) {
          return { error: null };
        }
        if (exchangeError.message?.toLowerCase().includes('code verifier')) {
          return {
            error: i18n.t('errors.pkceMismatch'),
          };
        }
        /** oauth-callback veya ikinci çağrı aynı code’u tüketmiş olabilir; oturum varsa başarı say. */
        const { data: postEx } = await supabase.auth.getSession();
        if (postEx.session) return { error: null };
        const waited = await waitForSupabaseSessionAfterBrowser(45);
        if (waited) {
          const { data: late } = await supabase.auth.getSession();
          if (late.session) return { error: null };
        }
        return { error: exchangeError.message ?? null };
      }

      /** success URL’de code görünmüyorsa (bazı scheme şekilleri) deep link zaten exchange etmiş olabilir. */
      {
        const { data: sid } = await supabase.auth.getSession();
        if (sid.session) return { error: null };
        const ok = await waitForSupabaseSessionAfterBrowser();
        if (ok && (await supabase.auth.getSession()).data.session) {
          return { error: null };
        }
      }

      // Eski implicit akış: #access_token=...
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

  /**
   * iOS: Native Sign in with Apple + Supabase signInWithIdToken (OAuth deep link/PKCE sorunlarını önler).
   * Diğer platformlar veya native kullanılamıyorsa web OAuth’a düşer.
   */
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
          /** Sessizce web OAuth’a düşmek aynı anda iki akış / yarışa yol açabiliyor; hatayı göster. */
          const msg = e instanceof Error ? e.message : i18n.t('errors.appleNativeFailed');
          return { error: msg };
        }
      }
    }

    return signInWithOAuth('apple');
  }, [signInWithOAuth]);

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
