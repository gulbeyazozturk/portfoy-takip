import { supabase } from '@/lib/supabase';

/**
 * Tarayıcı sheet dismiss olduktan sonra PKCE exchange / AsyncStorage birkaç kare gecikebilir.
 * setTimeout kullanmadan rAF ile sınırlı bekleme (Google OAuth yarışı).
 */
export async function waitForSupabaseSessionAfterBrowser(maxFrames = 180): Promise<boolean> {
  for (let i = 0; i < maxFrames; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  return false;
}

/**
 * Google OAuth: exchange tamamlanınca önce SIGNED_IN gelir, getSession biraz gecikebilir.
 * Dinleyici + rAF ile bekleme (setTimeout yok).
 */
export function waitForSignedInAfterOAuth(maxFrames = 180): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!settled && session && event === 'SIGNED_IN') {
        settled = true;
        sub.subscription.unsubscribe();
        resolve(true);
      }
    });

    let frames = 0;
    const tick = (): void => {
      if (settled) return;
      frames += 1;
      if (frames >= maxFrames) {
        settled = true;
        sub.subscription.unsubscribe();
        resolve(false);
        return;
      }
      void supabase.auth.getSession().then(({ data }) => {
        if (settled) return;
        if (data.session) {
          settled = true;
          sub.subscription.unsubscribe();
          resolve(true);
          return;
        }
        requestAnimationFrame(tick);
      });
    };
    requestAnimationFrame(tick);
  });
}
