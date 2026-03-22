import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { setAppLanguage } from '@/lib/i18n';

type Lang = 'tr' | 'en';

export function LanguageToggle({ compact }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const lng: Lang = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'tr';

  const pick = async (next: Lang) => {
    await setAppLanguage(next);
  };

  return (
    <View style={[styles.row, compact && styles.rowCompact]} accessibilityRole="toolbar">
      <Pressable
        onPress={() => pick('tr')}
        style={[styles.flag, lng === 'tr' && styles.flagActive]}
        accessibilityRole="button"
        accessibilityLabel="Türkçe"
        accessibilityState={{ selected: lng === 'tr' }}>
        <Text style={styles.flagEmoji}>🇹🇷</Text>
      </Pressable>
      <Pressable
        onPress={() => pick('en')}
        style={[styles.flag, lng === 'en' && styles.flagActive]}
        accessibilityRole="button"
        accessibilityLabel="English"
        accessibilityState={{ selected: lng === 'en' }}>
        <Text style={styles.flagEmoji}>🇬🇧</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowCompact: {
    gap: 4,
  },
  flag: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  flagActive: {
    borderColor: '#00e677',
    backgroundColor: 'rgba(0,230,119,0.12)',
  },
  flagEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
});
