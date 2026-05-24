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
 * Google / Apple OAuth: exchange tamamlanınca önce SIGNED_IN gelir, getSession biraz gecikebilir.
 * Dinleyici + rAF ile bekleme (setTimeout yok).
 */
const GET_SESSION_TIMEOUT_MS = 4_000;

function getSessionWithTimeout(): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(false);
    }, GET_SESSION_TIMEOUT_MS);

    void supabase.auth.getSession().then(({ data }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(!!data.session);
    });
  });
}

export function waitForSignedInAfterOAuth(maxFrames = 180): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      sub.subscription.unsubscribe();
      resolve(ok);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === 'SIGNED_IN') {
        finish(true);
      }
    });

    let frames = 0;
    const tick = (): void => {
      if (settled) return;
      frames += 1;
      if (frames >= maxFrames) {
        finish(false);
        return;
      }
      void getSessionWithTimeout().then((hasSession) => {
        if (settled) return;
        if (hasSession) {
          finish(true);
          return;
        }
        requestAnimationFrame(tick);
      });
    };
    requestAnimationFrame(tick);
  });
}
