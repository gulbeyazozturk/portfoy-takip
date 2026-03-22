import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';

import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth';
import { useTranslation } from 'react-i18next';

const APP_VERSION = '1.0.0';
// GitHub Pages: Repo → Settings → Pages → Source: main branch, /docs → https://<user>.github.io/portfoy-takip/privacy-policy.html
const PRIVACY_POLICY_URL = 'https://hozturk907.github.io/portfoy-takip/privacy-policy.html';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut();
      router.replace('/auth');
    } catch (e: any) {
      Alert.alert(t('settings.signOutError'), e?.message ?? t('settings.signOutErrorBody'));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container} lightColor="#000000" darkColor="#000000">
        <View style={styles.center}>
          <ThemedText type="subtitle">{t('settings.title')}</ThemedText>
          <ThemedText style={styles.version}>{t('settings.version', { v: APP_VERSION })}</ThemedText>
          <View style={styles.langRow}>
            <ThemedText style={styles.langLabel}>{t('settings.language')}</ThemedText>
            <LanguageToggle compact />
          </View>
          {PRIVACY_POLICY_URL ? (
            <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              <ThemedText style={styles.link}>{t('settings.privacy')}</ThemedText>
            </Pressable>
          ) : (
            <ThemedText style={styles.muted}>{t('settings.privacyStore')}</ThemedText>
          )}
          <Pressable style={styles.signOutBtn} onPress={handleSignOut} disabled={signingOut}>
            {signingOut ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.signOutText}>{t('settings.signOut')}</ThemedText>
            )}
          </Pressable>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  langLabel: { color: '#d1d5db', fontSize: 14 },
  version: { color: '#9ca3af', marginTop: 4 },
  link: { color: '#60a5fa', textDecorationLine: 'underline', marginTop: 8 },
  muted: { color: '#6b7280', fontSize: 13, marginTop: 8 },
  signOutBtn: {
    marginTop: 12,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  signOutText: { color: '#fff', fontWeight: '700' },
});

