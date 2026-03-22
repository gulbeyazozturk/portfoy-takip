import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = '@omnifolio_app_lock_enabled';

type AppLockContextValue = {
  loaded: boolean;
  /** Kullanıcı ayarı: uygulama kilidi açık */
  appLockEnabled: boolean;
  /** Cihazda Face ID / Touch ID / biyometrik kayıtlı mı */
  biometricSupported: boolean;
  setAppLockEnabled: (next: boolean) => Promise<void>;
  refreshBiometricSupport: () => Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);

  const refreshBiometricSupport = useCallback(async () => {
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricSupported(has && enrolled);
    } catch {
      setBiometricSupported(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled) {
          setAppLockEnabledState(raw === '1');
        }
        await refreshBiometricSupport();
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshBiometricSupport]);

  const setAppLockEnabled = useCallback(async (next: boolean) => {
    setAppLockEnabledState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* yoksay */
    }
    if (!next) {
      await refreshBiometricSupport();
    }
  }, [refreshBiometricSupport]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      loaded,
      appLockEnabled,
      biometricSupported,
      setAppLockEnabled,
      refreshBiometricSupport,
    }),
    [loaded, appLockEnabled, biometricSupported, setAppLockEnabled, refreshBiometricSupport],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error('useAppLock must be used within AppLockProvider');
  }
  return ctx;
}
