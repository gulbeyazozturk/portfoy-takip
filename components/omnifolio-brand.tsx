import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

const ACCENT_A = '#38bdf8';
const ACCENT_B = '#00e677';

/** Ana ekran / splash ile aynı kaynak — `app.json` içindeki `expo.icon` ile eşleşir. */
const APP_ICON = require('@/assets/images/icon.png');

/**
 * Omnifolio marka bloğu — giriş ve splash benzeri ekranlarda kullanılır.
 */
export function OmnifolioBrand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const size = compact ? 52 : 72;

  return (
    <View style={styles.wrap}>
      <View style={[styles.markWrap, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image source={APP_ICON} style={[styles.appIcon, { width: size, height: size, borderRadius: size / 2 }]} resizeMode="cover" accessibilityLabel="Omnifolio" />
      </View>

      <View style={styles.wordmarkRow}>
        <Text style={[styles.wordmark, styles.wordmarkOmni]}>Omni</Text>
        <Text style={[styles.wordmark, styles.wordmarkFolio]}>folio</Text>
      </View>

      {!compact ? <Text style={styles.tagline}>{t('brand.tagline')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  markWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
  },
  appIcon: {
    backgroundColor: 'transparent',
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmark: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  wordmarkOmni: {
    color: ACCENT_A,
  },
  wordmarkFolio: {
    color: ACCENT_B,
  },
  tagline: {
    marginTop: 10,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    fontWeight: '500',
  },
});
