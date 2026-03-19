import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth';

const APP_VERSION = '1.0.0';
// GitHub Pages: Repo → Settings → Pages → Source: main branch, /docs → https://<user>.github.io/portfoy-takip/privacy-policy.html
const PRIVACY_POLICY_URL = 'https://hozturk907.github.io/portfoy-takip/privacy-policy.html';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut();
      router.replace('/auth');
    } catch (e: any) {
      Alert.alert('Çıkış hatası', e?.message ?? 'Çıkış yapılırken bir hata oluştu.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container} lightColor="#000000" darkColor="#000000">
        <View style={styles.center}>
          <ThemedText type="subtitle">Ayarlar</ThemedText>
          <ThemedText style={styles.version}>Sürüm {APP_VERSION}</ThemedText>
          {PRIVACY_POLICY_URL ? (
            <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              <ThemedText style={styles.link}>Gizlilik politikası</ThemedText>
            </Pressable>
          ) : (
            <ThemedText style={styles.muted}>Gizlilik politikası mağaza sayfasında yer alır.</ThemedText>
          )}
          <Pressable style={styles.signOutBtn} onPress={handleSignOut} disabled={signingOut}>
            {signingOut ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.signOutText}>Çıkış Yap</ThemedText>
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
  },
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

