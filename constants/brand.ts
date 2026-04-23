/**
 * Omnifolio tek marka çizgisi (mavi aile).
 * Ana portföy / home vurgusu ile aynı hat; tab bar, tema tint ve auth aksanı buradan beslenir.
 */
export const Brand = {
  /** Ana vurgu — `app/(tabs)/home.tsx` ile aynı */
  primary: '#89acff',
  /** Açık chip / metin kontrastı (koyu yüzey üzerinde) */
  onPrimary: '#002b6a',
  /** Dolu buton (koyu arka plan üzerinde) */
  primarySolid: '#5c7fd9',
  /** primarySolid üzerinde metin */
  onPrimarySolid: '#ffffff',
  primaryMuted: 'rgba(137,172,255,0.14)',
  primaryBorder: 'rgba(137,172,255,0.45)',
  /** Açık tema arka planında link / tint */
  tintOnLight: '#4a67c4',
  /** Bilgi kutusu ve bilgi metni (yeşil yerine marka tonu) */
  infoText: '#aac8ff',
  infoBoxBorder: 'rgba(137,172,255,0.45)',
  infoBoxBg: 'rgba(137,172,255,0.12)',
  infoBoxText: '#d4e2ff',
  /** Wordmark: iki ton aynı hue */
  wordmarkLight: '#b8cffc',
  /** Koyu arka planda pozitif % (yeşil yerine soğuk ton) */
  chartPositive: '#8ec5ff',
} as const;
