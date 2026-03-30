import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { useAppLock } from '@/context/app-lock';

/** Expo Go’da Face ID host uygulamasına bağlı değildir; zaman aşımı sonrası tekrar denemeye izin verir. */
const AUTH_PROMPT_TIMEOUT_MS = 90_000;

type Props = {
  children: React.ReactNode;
};

/**
 * Oturum açıkken: ayar açıksa ve biyometrik varsa, arka plandan dönüşte ve ilk açılışta doğrulama ister.
 */
export function AppLockGate({ children }: Props) {
  const { t } = useTranslation();
  const { loaded, appLockEnabled, biometricSupported, setAppLockEnabled } = useAppLock();
  const [unlocked, setUnlocked] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const unlockedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  /** Aynı anda iki authenticateAsync iOS’ta üst üste binip parola / garip akış çıkarabiliyor. */
  const authSessionRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (authSessionRef.current) return authSessionRef.current;

    const session = (async () => {
      setAuthBusy(true);
      try {
        /**
         * Expo Go’da Face ID çoğu cihazda çalışmaz; yalnızca biyometrik + disableDeviceFallback
         * doğrulama penceresi hiç açılmadan başarısız dönebiliyor. Standalone / mağaza build’inde
         * yalnız Face ID / Touch ID kullanılır.
         */
        const isExpoGo = Constants.appOwnership === 'expo';
        const disableDeviceFallback = !isExpoGo;
        const fallbackLabel =
          Platform.OS === 'ios' && disableDeviceFallback ? '' : t('appLock.fallbackLabel');

        const authPromise = LocalAuthentication.authenticateAsync({
          promptMessage: t('appLock.promptMessage'),
          cancelLabel: t('appLock.cancelLabel'),
          disableDeviceFallback,
          fallbackLabel,
        });

        const result = await Promise.race([
          authPromise,
          new Promise<{ success: false }>((resolve) =>
            setTimeout(() => resolve({ success: false }), AUTH_PROMPT_TIMEOUT_MS),
          ),
        ]);

        return result.success === true;
      } catch {
        return false;
      } finally {
        authSessionRef.current = null;
        setAuthBusy(false);
      }
    })();

    authSessionRef.current = session;
    return session;
  }, [t]);

  const tryUnlock = useCallback(async () => {
    const ok = await authenticate();
    if (ok) setUnlocked(true);
  }, [authenticate]);

  /** İlk yükleme veya ayar / biyometrik durumu değişince */
  useEffect(() => {
    if (!loaded) return;

    if (!appLockEnabled || !biometricSupported) {
      setUnlocked(true);
      return;
    }

    let cancelled = false;
    setUnlocked(false);
    void (async () => {
      const ok = await authenticate();
      if (!cancelled && ok) setUnlocked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [loaded, appLockEnabled, biometricSupported, authenticate]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (!appLockEnabled || !biometricSupported) return;

      if (next === 'background' || next === 'inactive') {
        setUnlocked(false);
        return;
      }

      if (next === 'active' && (prev === 'background' || prev === 'inactive')) {
        if (!unlockedRef.current) {
          void tryUnlock();
        }
      }
    });
    return () => sub.remove();
  }, [appLockEnabled, biometricSupported, tryUnlock]);

  if (!loaded) {
    return (
      <View style={styles.blocker}>
        <ActivityIndicator color="#60a5fa" size="large" />
      </View>
    );
  }

  if (!appLockEnabled || !biometricSupported) {
    return <>{children}</>;
  }

  if (!unlocked) {
    return (
      <View style={styles.blocker}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('appLock.title')}
        </ThemedText>
        <ThemedText style={styles.sub}>{t('appLock.subtitle')}</ThemedText>
        <Pressable
          style={({ pressed }) => [styles.btn, (pressed || authBusy) && styles.btnPressed]}
          onPress={() => void tryUnlock()}
          disabled={authBusy}
          accessibilityState={{ busy: authBusy }}>
          {authBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.btnText}>{t('appLock.unlock')}</ThemedText>
          )}
        </Pressable>
        <Pressable
          style={styles.disableWrap}
          onPress={() =>
            Alert.alert(t('appLock.disableTitle'), t('appLock.disableBody'), [
              { text: t('appLock.cancelLabel'), style: 'cancel' },
              {
                text: t('appLock.disableConfirm'),
                style: 'destructive',
                onPress: () => void setAppLockEnabled(false),
              },
            ])
          }>
          <ThemedText style={styles.disableLink}>{t('appLock.disableLock')}</ThemedText>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  blocker: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  title: { color: '#f9fafb', textAlign: 'center', marginBottom: 8 },
  sub: { color: '#9ca3af', textAlign: 'center', marginBottom: 24, fontSize: 14 },
  btn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
    minWidth: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disableWrap: { marginTop: 20 },
  disableLink: { color: '#6b7280', fontSize: 14, textDecorationLine: 'underline' },
});
