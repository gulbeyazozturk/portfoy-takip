import React from 'react';
import { Linking, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const APP_VERSION = '1.0.0';
// GitHub Pages: Repo → Settings → Pages → Source: main branch, /docs → https://<user>.github.io/portfoy-takip/privacy-policy.html
const PRIVACY_POLICY_URL = 'https://hozturk907.github.io/portfoy-takip/privacy-policy.html';

export default function SettingsScreen() {
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
});

