import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const ACCENT_A = '#38bdf8';
const ACCENT_B = '#00e677';

/**
 * Omnifolio marka bloğu — giriş ve splash benzeri ekranlarda kullanılır.
 */
export function OmnifolioBrand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const size = compact ? 52 : 72;
  const vb = 64;
  const r = 26;
  const innerR = 15;

  return (
    <View style={styles.wrap}>
      <View style={[styles.markWrap, { width: size, height: size, borderRadius: size / 2 }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`}>
          <Defs>
            <LinearGradient id="omniBrandRing" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={ACCENT_A} />
              <Stop offset="1" stopColor={ACCENT_B} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={vb / 2}
            cy={vb / 2}
            r={r}
            stroke="url(#omniBrandRing)"
            strokeWidth={3.5}
            fill="none"
          />
          <Circle cx={vb / 2} cy={vb / 2} r={innerR} fill="rgba(0,230,119,0.12)" />
          <Circle
            cx={vb / 2}
            cy={vb / 2}
            r={innerR}
            stroke="url(#omniBrandRing)"
            strokeWidth={1.5}
            fill="none"
            opacity={0.85}
          />
        </Svg>
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
    backgroundColor: 'rgba(56,189,248,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.2)',
    marginBottom: 14,
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
