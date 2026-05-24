import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { parseAuthCallbackParams } from '@/lib/auth-callback-params';
import { mapAuthErrorMessage } from '@/lib/auth-error-map';
import i18n from '@/lib/i18n';
import { waitForSupabaseSessionAfterBrowser } from '@/lib/oauth-session-wait';
import { supabase } from '@/lib/supabase';

export type OAuthProvider = 'google' | 'apple';

export type OAuthPrepared = {
  url: string;
  redirectTo: string;
};

export type SocialSignInResult = { error: string | null; hasSession: boolean };

/** OAuth redirect — `context/auth.tsx` ile aynı mantık. */
export function getOAuthRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/oauth-callback`;
  }
  const devOverride = __DEV__ ? (process.env.EXPO_PUBLIC_OAUTH_REDIRECT_URL ?? '').trim() : '';
  if (devOverride && Platform.OS !== 'web') {
    return devOverride;
  }
  return Linking.createURL('oauth-callback');
}

/** iOS: tarayıcıyı açmadan önce URL hazırla (kullanıcı jesti + hızlı açılış). */
export async function prepareOAuthSignInUrl(
  provider: OAuthProvider,
): Promise<{ prepared: OAuthPrepared | null; error: string | null }> {
  const redirectTo = getOAuthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    return {
      prepared: null,
      error: error ? mapAuthErrorMessage(error.message) : i18n.t('errors.oauthStart'),
    };
  }
  return { prepared: { url: data.url, redirectTo }, error: null };
}

const sessionFromStorage = async (): Promise<boolean> => {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
};

/** `openAuthSessionAsync` sonucunu oturuma çevir. */
export async function processOAuthBrowserResult(
  result: WebBrowser.WebBrowserAuthSessionResult,
  redirectTo: string,
): Promise<SocialSignInResult> {
  if (result.type === 'cancel' || result.type === 'dismiss') {
    let hasSession = await sessionFromStorage();
    if (!hasSession) {
      const waited = await waitForSupabaseSessionAfterBrowser();
      if (waited) hasSession = await sessionFromStorage();
    }
    if (hasSession) return { error: null, hasSession: true };
    return { error: i18n.t('errors.oauthCancelled'), hasSession: false };
  }
  if (result.type !== 'success' || !result.url) {
    let hasSession = await sessionFromStorage();
    if (!hasSession) {
      const waited = await waitForSupabaseSessionAfterBrowser();
      if (waited) hasSession = await sessionFromStorage();
    }
    if (hasSession) return { error: null, hasSession: true };
    return { error: i18n.t('errors.oauthIncomplete'), hasSession: false };
  }

  let params: Record<string, string>;
  try {
    params = parseAuthCallbackParams(result.url);
  } catch {
    return { error: i18n.t('errors.oauthIncomplete'), hasSession: false };
  }

  if (params.error) {
    const raw = params.error_description ?? params.error;
    return { error: mapAuthErrorMessage(raw.replace(/\+/g, ' ')), hasSession: false };
  }

  try {
    if (params.code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
      if (!exchangeError) {
        return { error: null, hasSession: await sessionFromStorage() };
      }
      if (exchangeError.message?.toLowerCase().includes('code verifier')) {
        return { error: i18n.t('errors.pkceMismatch'), hasSession: false };
      }
      if (await sessionFromStorage()) return { error: null, hasSession: true };
      const waited = await waitForSupabaseSessionAfterBrowser(45);
      if (waited && (await sessionFromStorage())) {
        return { error: null, hasSession: true };
      }
      return { error: mapAuthErrorMessage(exchangeError.message), hasSession: false };
    }

    if (await sessionFromStorage()) return { error: null, hasSession: true };
    const ok = await waitForSupabaseSessionAfterBrowser();
    if (ok && (await sessionFromStorage())) {
      return { error: null, hasSession: true };
    }

    const access_token = params.access_token;
    const refresh_token = params.refresh_token;
    if (!access_token || !refresh_token) {
      return { error: i18n.t('errors.sessionParams', { url: redirectTo }), hasSession: false };
    }

    const { error: setSessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (setSessionError) {
      return { error: mapAuthErrorMessage(setSessionError.message), hasSession: false };
    }
    return { error: null, hasSession: await sessionFromStorage() };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: mapAuthErrorMessage(msg || i18n.t('errors.oauthIncomplete')), hasSession: false };
  }
}

/** Hazır URL ile OAuth — tarayıcıyı mümkün olan en kısa yolda aç. */
export async function openPreparedOAuthSession(prepared: OAuthPrepared): Promise<SocialSignInResult> {
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(prepared.url, prepared.redirectTo);
  } catch {
    return { error: i18n.t('errors.oauthIncomplete'), hasSession: false };
  }
  return processOAuthBrowserResult(result, prepared.redirectTo);
}
