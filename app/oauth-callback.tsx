import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * OAuth dönüşü için rota. Native tarafta web-browser oturumu tamamlanır;
 * web tarafta ise URL'deki code güvenli şekilde session'a çevrilir.
 */
export default function OAuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    (async () => {
      WebBrowser.maybeCompleteAuthSession();

      if (typeof window !== 'undefined') {
        const code = new URL(window.location.href).searchParams.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      router.replace(data.session ? '/' : '/auth');
    })();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <ActivityIndicator color="#60a5fa" />
    </View>
  );
}
