import '@/lib/native-webcrypto-polyfill';
import '@/lib/i18n';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLockGate } from '@/components/app-lock-gate';
import { MissingSupabaseConfigScreen } from '@/components/missing-supabase-config';
import { AppLockProvider } from '@/context/app-lock';
import { AuthProvider, useAuth } from '@/context/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PortfolioProvider } from '@/context/portfolio';
import { SelectedCategoriesProvider } from '@/context/selected-categories';
import { isSupabaseConfigured } from '@/lib/supabase';
import { isWelcomeDismissedForUser } from '@/lib/welcome-dismissed';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <MissingSupabaseConfigScreen />
          <StatusBar style="light" />
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <AppLockProvider>
            <PortfolioProvider>
              <SelectedCategoriesProvider>
                <RootNavigator />
              </SelectedCategoriesProvider>
            </PortfolioProvider>
          </AppLockProvider>
        </AuthProvider>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { loading, session, passwordRecoveryPending } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color="#89acff" />
      </View>
    );
  }

  if (session && passwordRecoveryPending) {
    return (
      <Stack>
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="update-password" options={{ headerShown: false }} />
        <Stack.Screen name="password-reset" options={{ headerShown: false }} />
        <Stack.Screen name="resetPassword" options={{ headerShown: false }} />
      </Stack>
    );
  }

  if (!session) {
    return (
      <Stack>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="oauth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="update-password" options={{ headerShown: false }} />
        <Stack.Screen name="password-reset" options={{ headerShown: false }} />
        <Stack.Screen name="resetPassword" options={{ headerShown: false }} />
      </Stack>
    );
  }

  return <AuthenticatedAppStack />;
}

type WelcomeGate = 'loading' | 'show' | 'skip';

/**
 * Oturum açık: önce tek seferlik hoş geldin (kullanıcı başına), sonra kilit + ana stack.
 */
function AuthenticatedAppStack() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [gate, setGate] = useState<WelcomeGate>('loading');

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setGate('skip');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const dismissed = await isWelcomeDismissedForUser(uid);
        if (!cancelled) setGate(dismissed ? 'skip' : 'show');
      } catch {
        if (!cancelled) setGate('skip');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  if (gate === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color="#89acff" />
      </View>
    );
  }

  return (
    <AppLockGate>
      <Stack initialRouteName={gate === 'show' ? 'welcome' : '(tabs)'}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="bulk-upload"
          options={{ headerShown: false, title: t('layout.bulkUploadTitle') }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: t('layout.modalTitle') }} />
      </Stack>
    </AppLockGate>
  );
}
