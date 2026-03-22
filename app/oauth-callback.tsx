import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';

function codeFromParsedQuery(q: Linking.ParsedURL['queryParams']): string | null {
  if (!q) return null;
  const raw = q.code;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return null;
}

function extractCodeFromUrlString(url: string | null | undefined): string | null {
  if (!url || !url.includes('code=')) return null;
  try {
    return codeFromParsedQuery(Linking.parse(url).queryParams);
  } catch {
    return null;
  }
}

/**
 * OAuth deep link dönüşü. openAuthSessionAsync zaten code'u işlemiş olabilir;
 * aynı code iki kez exchange edilmemeli (yarış / çökme riski).
 *
 * Sıcak başlatmada getInitialURL eski/boş kalabildiği için useLinkingURL + url dinleyicisi şart (Google).
 */
export default function OAuthCallbackScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const linkingUrl = Linking.useLinkingURL();
  const latestCodeRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let navigated = false;

    const navigateOnce = (href: '/(tabs)' | '/auth') => {
      if (cancelled || navigated) return;
      navigated = true;
      router.replace(href);
    };

    async function finishOAuth(code: string | null) {
      WebBrowser.maybeCompleteAuthSession();

      const effectiveCode = code ?? latestCodeRef.current;

      const { data: existing } = await supabase.auth.getSession();
      if (cancelled) return;
      if (existing.session) {
        // #region agent log
        fetch('http://127.0.0.1:7329/ingest/53538a73-b612-479d-b80d-75820501e1ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d02655'},body:JSON.stringify({sessionId:'d02655',runId:'google-oauth',hypothesisId:'G1',location:'oauth-callback.tsx:existingSession',message:'already signed in',data:{},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        navigateOnce('/(tabs)');
        return;
      }

      // #region agent log
      fetch('http://127.0.0.1:7329/ingest/53538a73-b612-479d-b80d-75820501e1ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d02655'},body:JSON.stringify({sessionId:'d02655',runId:'google-oauth',hypothesisId:'G2',location:'oauth-callback.tsx:exchange',message:'oauth callback path',data:{hasCode:!!effectiveCode,linkingUrlLen:linkingUrl?.length??0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      if (effectiveCode) {
        try {
          await supabase.auth.exchangeCodeForSession(effectiveCode);
          // #region agent log
          fetch('http://127.0.0.1:7329/ingest/53538a73-b612-479d-b80d-75820501e1ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d02655'},body:JSON.stringify({sessionId:'d02655',runId:'google-oauth',hypothesisId:'G2',location:'oauth-callback.tsx:afterExchange',message:'exchange ok',data:{},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
        } catch (e) {
          // #region agent log
          fetch('http://127.0.0.1:7329/ingest/53538a73-b612-479d-b80d-75820501e1ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d02655'},body:JSON.stringify({sessionId:'d02655',runId:'google-oauth',hypothesisId:'G2',location:'oauth-callback.tsx:exchangeErr',message:'exchange failed (may be duplicate)',data:{err:String(e instanceof Error?e.message:e)},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      // #region agent log
      fetch('http://127.0.0.1:7329/ingest/53538a73-b612-479d-b80d-75820501e1ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d02655'},body:JSON.stringify({sessionId:'d02655',runId:'google-oauth',hypothesisId:'G1',location:'oauth-callback.tsx:nav',message:'replace route',data:{hasSession:!!data.session,target:data.session?'/(tabs)':'/auth'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      navigateOnce(data.session ? '/(tabs)' : '/auth');
    }

    const sub = Linking.addEventListener('url', ({ url }) => {
      const c = extractCodeFromUrlString(url);
      if (c) {
        latestCodeRef.current = c;
        void finishOAuth(c);
      }
    });

    void (async () => {
      let code: string | null = null;
      const p = params.code;
      if (typeof p === 'string') code = p;
      else if (Array.isArray(p) && p[0]) code = p[0];

      if (!code && typeof window !== 'undefined') {
        code = new URL(window.location.href).searchParams.get('code');
      }

      if (!code) code = extractCodeFromUrlString(linkingUrl);

      if (!code) {
        try {
          const parsed = await Linking.parseInitialURLAsync();
          code = codeFromParsedQuery(parsed.queryParams);
        } catch {
          /* yoksay */
        }
      }

      if (!code) code = latestCodeRef.current;

      await finishOAuth(code);
    })();

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [linkingUrl, params.code, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', gap: 12 }}>
      <ActivityIndicator color="#60a5fa" />
      <Text style={{ color: '#9ca3af', fontSize: 14 }}>{t('oauth.loading')}</Text>
    </View>
  );
}
