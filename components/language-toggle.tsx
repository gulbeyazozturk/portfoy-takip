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

/** Portföy / ana sayfa kategori hapları ile aynı vurgu. */
const PRIMARY = '#89acff';
const SURFACE_HIGH = '#1f1f1f';

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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(72,72,72,0.35)',
    backgroundColor: SURFACE_HIGH,
  },
  flagActive: {
    borderColor: PRIMARY,
    backgroundColor: PRIMARY,
  },
  flagEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
});
