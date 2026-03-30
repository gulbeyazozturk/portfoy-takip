import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { type Href, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { PortfolioPickerModal } from '@/components/portfolio-picker-modal';
import { UltraDarkDonutChart } from '@/components/ultra-dark-donut-chart';
import { getSingleChartCategoryId, useSelectedCategories } from '@/context/selected-categories';
import type { AllocationBreakdownRow } from '@/hooks/use-portfolio-core-data';
import { usePortfolioCoreData } from '@/hooks/use-portfolio-core-data';
import { CATEGORY_CHART_COLORS } from '@/lib/category-chart-colors';

const BG = '#000000';
const SURFACE_LOW = '#131313';
const SURFACE_CARD = '#191919';
const MUTED = '#ababab';
const ON_SURFACE_VARIANT = '#ababab';
const WHITE = '#ffffff';
/** Portföy ekranı ile aynı vurgu (TL/USD hap + donut başlık). */
const PRIMARY = '#89acff';
const ON_PRIMARY = '#002b6a';

const SECONDARY_MINT = '#39FF14';
/** Portföy sekmesi `ERROR` ile aynı — düşüş / negatif %. */
const PCT_NEGATIVE = '#ff716c';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  bist: 'stats-chart',
  yurtdisi: 'globe-outline',
  doviz: 'cash-outline',
  emtia: 'cube-outline',
  fon: 'pie-chart-outline',
  kripto: 'logo-bitcoin',
  mevduat: 'wallet-outline',
};

/** Portföy sekmesi; `(tabs)` URL’de yok, `index` rotası `/` ile eşleşir. */
const PORTFOLIO_TAB_HREF = '/' as Href;

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const numberLocale = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'tr-TR';
  const [fontsLoaded] = useFonts({ Manrope_800ExtraBold });
  const fontHead800 = fontsLoaded ? 'Manrope_800ExtraBold' : undefined;
  const [portfolioPickerOpen, setPortfolioPickerOpen] = useState(false);
  const [valueCurrency, setValueCurrency] = useState<'TL' | 'USD'>('TL');
  const [valueScope, setValueScope] = useState<'daily' | 'all'>('daily');
  const { filter, selectAllCategories, setCategoryFromChart } = useSelectedCategories();

  /**
   * Oku + yatay kol (radialStep + horizontalLen ≈ 75px) tuval kenarından içeride kalmalı.
   * Dar ekranda küçük margin (ör. 48) etiketi viewBox dışına iter (“FON” → “F”, “% BIST” vb.).
   */
  const donutLabelMargin = windowWidth < 360 ? 84 : 78;
  const donutMaxCanvas = windowWidth - 40 - 16;
  const donutSize = Math.max(
    148,
    Math.min(200, donutMaxCanvas - 2 * donutLabelMargin),
  );

  const {
    allocationData,
    allocationBreakdown,
    portfolioMetrics,
    categoryPerformanceById,
    holdings,
    usdTry,
    loading,
    error,
    portfolioId,
    portfolios,
    selectPortfolio,
    currentPortfolioName,
  } = usePortfolioCoreData();

  const lastGridTapRef = useRef<{ at: number; categoryId: string } | null>(null);

  useEffect(() => {
    selectAllCategories();
  }, [portfolioId, selectAllCategories]);

  const chartHighlightCategoryId = getSingleChartCategoryId(filter);

  const clearHomeCategoryFilter = useCallback(() => {
    lastGridTapRef.current = null;
    setCategoryFromChart(null);
  }, [setCategoryFromChart]);

  const neonSlices = useMemo(
    () =>
      allocationData.map((s) => ({
        ...s,
        color: (s.categoryId && CATEGORY_CHART_COLORS[s.categoryId]) || s.color,
      })),
    [allocationData],
  );

  const mainTotal =
    valueCurrency === 'TL' ? portfolioMetrics.totalValueTL : portfolioMetrics.totalValueUSD;
  const heroPct =
    valueScope === 'daily'
      ? valueCurrency === 'TL'
        ? portfolioMetrics.dailyPctTL
        : portfolioMetrics.dailyPctUSD
      : valueCurrency === 'TL'
        ? portfolioMetrics.totalPctTL
        : portfolioMetrics.totalPctUSD;
  const pctPositive = heroPct >= 0;

  const fmtMoney = (n: number) =>
    valueCurrency === 'USD'
      ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      : `${n.toLocaleString(numberLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${t('home.currencyTL')}`;

  const fmtRowMoney = (tl: number, usd: number) =>
    valueCurrency === 'USD'
      ? `$${usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      : `${tl.toLocaleString(numberLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${t('home.currencyTL')}`;

  const pctStr = `${pctPositive ? '+' : ''}${heroPct.toLocaleString(numberLocale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;

  const handleGridCategoryPress = (row: AllocationBreakdownRow) => {
    const now = Date.now();
    const prev = lastGridTapRef.current;
    if (prev && prev.categoryId === row.categoryId && now - prev.at < 420) {
      lastGridTapRef.current = null;
      setCategoryFromChart(row.categoryId);
      router.navigate(PORTFOLIO_TAB_HREF);
      return;
    }
    lastGridTapRef.current = { at: now, categoryId: row.categoryId };
    const onlyThis =
      filter.kind === 'include' &&
      filter.ids.size === 1 &&
      filter.ids.has(row.categoryId);
    setCategoryFromChart(onlyThis ? null : row.categoryId);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading && !allocationData.length ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.loadingText}>{t('portfolio.loading')}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {/* Üst özet: tutar + %; alt satırda günlük/tümü ve TL/USD (aynı hap stili) */}
            <View style={styles.hero}>
              <Pressable
                onPress={clearHomeCategoryFilter}
                accessibilityRole="button"
                accessibilityLabel={t('home.clearCategoryHighlightA11y')}
                style={styles.heroTopRowPressable}>
                <View style={styles.heroTopRow}>
                  <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
                    {mainTotal > 0 ? fmtMoney(mainTotal) : valueCurrency === 'USD' ? '$0' : `0 ${t('home.currencyTL')}`}
                  </Text>
                  {mainTotal > 0 ? (
                    <Text style={[styles.heroPct, pctPositive ? styles.heroPctUp : styles.heroPctDown]}>{pctStr}</Text>
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.heroPillsRow}>
                <View style={[styles.currencyPill, styles.heroPill]}>
                  <Pressable
                    onPress={() => setValueScope('daily')}
                    style={[styles.currencyPillBtn, valueScope === 'daily' && styles.currencyPillBtnOn]}>
                    <Text
                      style={[
                        styles.currencyPillText,
                        valueScope === 'daily' && styles.currencyPillTextOn,
                      ]}>
                      {t('portfolio.daily')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setValueScope('all')}
                    style={[styles.currencyPillBtn, valueScope === 'all' && styles.currencyPillBtnOn]}>
                    <Text
                      style={[
                        styles.currencyPillText,
                        valueScope === 'all' && styles.currencyPillTextOn,
                      ]}>
                      {t('portfolio.scopeAll')}
                    </Text>
                  </Pressable>
                </View>
                <View style={[styles.currencyPill, styles.heroPill]}>
                  <Pressable
                    onPress={() => setValueCurrency('TL')}
                    style={[styles.currencyPillBtn, valueCurrency === 'TL' && styles.currencyPillBtnOn]}>
                    <Text
                      style={[
                        styles.currencyPillText,
                        valueCurrency === 'TL' && styles.currencyPillTextOn,
                      ]}>
                      {t('home.currencyTL')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setValueCurrency('USD')}
                    style={[styles.currencyPillBtn, valueCurrency === 'USD' && styles.currencyPillBtnOn]}>
                    <Text
                      style={[
                        styles.currencyPillText,
                        valueCurrency === 'USD' && styles.currencyPillTextOn,
                      ]}>
                      {t('home.currencyUSD')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Hero ile grafik arası: boş alan dokunması → vurgu kapanır (donut ile çakışmaz) */}
            <Pressable
              onPress={clearHomeCategoryFilter}
              style={styles.heroChartGap}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />

            {/* Bento: donut kartı */}
            <View style={[styles.bentoChart, Platform.OS === 'ios' && styles.bentoChartIos]}>
              <View style={styles.donutInner}>
                <UltraDarkDonutChart
                  data={neonSlices}
                  size={donutSize}
                  strokeWidth={22}
                  showLabels
                  labelMargin={donutLabelMargin}
                  segmentGlow
                  selectedCategoryId={chartHighlightCategoryId}
                  onSlicePress={(slice) => {
                    const id = slice.categoryId;
                    if (id == null) return;
                    setCategoryFromChart(chartHighlightCategoryId === id ? null : id);
                  }}
                  innerDiskFill="rgba(19,19,19,0.96)"
                  innerDiskStroke="rgba(255,255,255,0.06)"
                  centerContent={
                    <Pressable
                      style={styles.centerPicker}
                      onPress={() => portfolios.length > 0 && setPortfolioPickerOpen(true)}
                      disabled={portfolios.length === 0}
                      accessibilityRole="button"
                      accessibilityLabel={t('portfolio.pickPortfolio')}>
                      <Text
                        style={[styles.donutPortfolioTitle, { fontFamily: fontHead800 }]}
                        numberOfLines={3}>
                        {currentPortfolioName || t('portfolio.headerTitle')}
                      </Text>
                    </Pressable>
                  }
                />
              </View>
            </View>

            {/* İki sütun kategori kartları */}
            <View style={styles.grid}>
              {allocationBreakdown.length === 0 ? (
                <Text style={styles.noBreakdown}>{t('home.noBreakdown')}</Text>
              ) : (
                allocationBreakdown.map((row) => {
                  const neon = CATEGORY_CHART_COLORS[row.categoryId] ?? row.color;
                  const selected = filter.kind === 'include' && filter.ids.has(row.categoryId);
                  const dimmed = filter.kind === 'include' && !selected;
                  const perf = categoryPerformanceById[row.categoryId];
                  const isDaily = valueScope === 'daily';
                  const rowPct = perf
                    ? valueCurrency === 'TL'
                      ? isDaily
                        ? perf.dailyPctTL
                        : perf.totalPctTL
                      : isDaily
                        ? perf.dailyPctUSD
                        : perf.totalPctUSD
                    : 0;
                  const rowAmt = perf
                    ? valueCurrency === 'TL'
                      ? isDaily
                        ? perf.dailyChangeTL
                        : perf.totalChangeTL
                      : isDaily
                        ? perf.dailyChangeUSD
                        : perf.totalChangeUSD
                    : 0;
                  const dayPos = rowPct >= 0;
                  const dayPctStr = `${dayPos ? '+' : ''}${rowPct.toLocaleString(numberLocale, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}%`;
                  const dayAmtStr =
                    valueCurrency === 'USD'
                      ? `${rowAmt >= 0 ? '+' : '-'}${Math.abs(rowAmt).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}`
                      : `${rowAmt >= 0 ? '+' : ''}${rowAmt.toLocaleString(numberLocale, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}`;
                  const iconName = CATEGORY_ICONS[row.categoryId] ?? 'pricetag-outline';
                  return (
                    <Pressable
                      key={row.categoryId}
                      onPress={() => handleGridCategoryPress(row)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={row.label}
                      accessibilityHint={t('home.doubleTapOpenPortfolio')}
                      style={({ pressed }) => [
                        styles.gridCard,
                        { borderLeftColor: neon },
                        selected && [styles.gridCardSelected, { borderColor: neon, shadowColor: neon }],
                        dimmed && styles.gridCardDimmed,
                        pressed && styles.gridCardPressed,
                      ]}>
                      <View style={styles.gridCardTop}>
                        <View style={styles.gridTitleRow}>
                          <View style={[styles.gridIconWrap, { backgroundColor: `${neon}24` }]}>
                            <Ionicons name={iconName} size={17} color={neon} />
                          </View>
                          <Text style={styles.gridLabel} numberOfLines={1}>
                            {row.label.toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.gridDayBlock}>
                          <Text
                            style={[
                              styles.gridDayPct,
                              dayPos ? styles.gridDayPositive : styles.gridDayNegative,
                            ]}
                            numberOfLines={1}>
                            {dayPctStr}
                          </Text>
                          <Text
                            style={[
                              styles.gridDayAmt,
                              dayPos ? styles.gridDayPositive : styles.gridDayNegative,
                            ]}
                            numberOfLines={1}>
                            {dayAmtStr}
                            {valueCurrency === 'TL' ? ` ${t('home.currencyTL')}` : ' USD'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.gridAmount} numberOfLines={1}>
                        {fmtRowMoney(row.amountTL, row.amountUSD)}
                      </Text>
                      <Text style={[styles.gridPct, { color: neon }]}>{row.pct.toFixed(1)}%</Text>
                    </Pressable>
                  );
                })
              )}
            </View>

            {/* Kısa içerikte kalan boşluğa dokununca da vurgu kapanır */}
            <Pressable
              onPress={clearHomeCategoryFilter}
              style={styles.scrollBottomClear}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </ScrollView>
        )}
      </SafeAreaView>

      <PortfolioPickerModal
        visible={portfolioPickerOpen}
        onClose={() => setPortfolioPickerOpen(false)}
        portfolios={portfolios}
        selectedId={portfolioId}
        onSelect={(id) => {
          void selectPortfolio(id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 120,
  },
  errorWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 12,
  },
  errorText: { color: '#fca5a5', fontSize: 14 },
  loadingWrap: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: MUTED, fontSize: 14 },

  hero: {
    marginBottom: 22,
    paddingTop: 14,
    alignItems: 'center',
  },
  heroTopRowPressable: {
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    maxWidth: '100%',
    paddingHorizontal: 4,
  },
  heroPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 18,
    maxWidth: '100%',
    paddingHorizontal: 4,
  },
  heroPill: { marginTop: 0, alignSelf: 'center' },
  heroValue: {
    fontSize: 42,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  heroPct: { fontSize: 15, fontWeight: '700', flexShrink: 0 },
  heroPctUp: { color: SECONDARY_MINT },
  heroPctDown: { color: PCT_NEGATIVE },
  currencyPill: {
    flexDirection: 'row',
    flexShrink: 0,
    padding: 4,
    borderRadius: 999,
    backgroundColor: SURFACE_CARD,
  },
  currencyPillBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  currencyPillBtnOn: { backgroundColor: PRIMARY },
  currencyPillText: { fontSize: 12, fontWeight: '700', color: ON_SURFACE_VARIANT },
  currencyPillTextOn: { color: ON_PRIMARY },

  bentoChart: {
    backgroundColor: SURFACE_LOW,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(72,72,72,0.35)',
    alignItems: 'center',
    overflow: 'visible',
    ...Platform.select({
      android: { elevation: 14 },
      default: {},
    }),
  },
  bentoChartIos: {
    shadowColor: '#89acff',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
  },
  heroChartGap: {
    alignSelf: 'stretch',
    height: 14,
    marginTop: 4,
    marginBottom: 2,
  },
  scrollBottomClear: {
    flexGrow: 1,
    minHeight: 120,
  },
  donutInner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },

  centerPicker: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    maxWidth: 220,
  },
  /** Portföy sekmesi `headerPortfolioTitle` ile aynı ölçü/renk. */
  donutPortfolioTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: PRIMARY,
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 26,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    overflow: 'visible',
  },
  gridCard: {
    flexGrow: 1,
    flexBasis: '47%',
    maxWidth: '48%',
    backgroundColor: SURFACE_CARD,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    paddingLeft: 10,
    borderLeftWidth: 3,
    gap: 6,
  },
  gridCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  gridTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  gridIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridDayBlock: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '50%',
  },
  gridDayPct: {
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'] as any,
  },
  gridDayAmt: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'] as any,
  },
  gridDayPositive: { color: SECONDARY_MINT },
  gridDayNegative: { color: PCT_NEGATIVE },
  gridCardSelected: {
    transform: [{ scale: 1.04 }],
    zIndex: 3,
    borderLeftWidth: 4,
    borderWidth: 1,
    backgroundColor: '#1c1c22',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 16,
    ...Platform.select({
      android: { elevation: 14 },
      default: {},
    }),
  },
  gridCardDimmed: { opacity: 0.48 },
  gridCardPressed: { opacity: 0.9 },
  gridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1,
  },
  gridAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.3,
  },
  gridPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  noBreakdown: {
    width: '100%',
    textAlign: 'center',
    color: MUTED,
    fontSize: 14,
    paddingVertical: 24,
    lineHeight: 20,
  },
});
