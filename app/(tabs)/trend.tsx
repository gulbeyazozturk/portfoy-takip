import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Brand } from '@/constants/brand';
import { PortfolioPickerModal } from '@/components/portfolio-picker-modal';
import type { HoldingRow } from '@/hooks/use-portfolio-core-data';
import { normalizeAsset, usePortfolioCoreData } from '@/hooks/use-portfolio-core-data';
import { useMinuteTick } from '@/hooks/use-minute-tick';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { usePortfolioHistorySeries } from '@/hooks/use-portfolio-history-series';
import { categoryDisplayLabel } from '@/lib/category-display';
import type { PortfolioHistoryTf } from '@/lib/portfolio-history-math';
import { MIN_VALID_USD_TRY_RATE } from '@/lib/usdtry-cache';
import { isHoldingMarketPriceReady } from '@/lib/portfolio-holdings';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';
import {
  computePortfolioPerformanceValues,
  type PortfolioPerformanceValues,
} from '@/lib/portfolio-performance';

const BG_DARK = '#000000';
const SURFACE = '#111111';
/** Portföy / ana sayfa ile aynı palet */
const PRIMARY = '#89acff';
const ON_PRIMARY = '#002b6a';
const SURFACE_CONTAINER = '#191919';
const ON_SURFACE_VARIANT = '#ababab';
const MUTED = '#a1a1aa';
const WHITE = '#FFFFFF';
const BORDER = 'rgba(255,255,255,0.05)';

const TIMEFRAMES = ['1D', '1W', '1M', '1Y', '5Y'] as const;

const TREND_CATEGORY_ORDER = ['yurtdisi', 'bist', 'doviz', 'emtia', 'fon', 'kripto', 'mevduat'] as const;

const CHART_W = 400;

function fmtPortfolioAxis(
  v: number,
  currency: 'TL' | 'USD',
  numberLocale: string,
): string {
  const abs = Math.abs(v);
  let maxDec = 2;
  if (abs > 0 && abs < 0.01) maxDec = 10;
  else if (abs >= 0.01 && abs < 1) maxDec = 6;
  else if (abs >= 1 && abs < 10) maxDec = 4;
  const loc = currency === 'USD' ? 'en-US' : numberLocale;
  const formatted = abs.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: maxDec });
  const trimmed = formatted.replace(/0+$/, '').replace(/[,.]$/, '');
  const core = v < 0 ? `-${trimmed}` : trimmed;
  if (currency === 'USD') return `$${core}`;
  return `${core} TL`;
}

/** Varlık girişi (asset-entry) PriceChart ile aynı dokunma davranışı: sürükleyince nokta, bırakınca seçim kalkar. */
function TrendInteractiveChart({
  values,
  dates,
  isPositive,
  currency,
  numberLocale,
  selectedIdx,
  onSelect,
  chartHeight,
}: {
  values: number[];
  dates: Date[];
  isPositive: boolean;
  currency: 'TL' | 'USD';
  numberLocale: string;
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
  chartHeight: number;
}) {
  const [chartWidth, setChartWidth] = useState(0);

  if (values.length < 2 || dates.length !== values.length) return null;

  const vals = values;
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;
  const padding = range * 0.1;
  const vMin = minVal - padding;
  const vMax = maxVal + padding;
  const vRange = vMax - vMin || 1;
  const toY = (v: number) => chartHeight - ((v - vMin) / vRange) * chartHeight;
  const lineColor = isPositive ? Brand.chartPositive : Brand.chartNegative;

  let dLine = '';
  vals.forEach((v, idx) => {
    const x = (CHART_W * idx) / (vals.length - 1);
    const y = toY(v);
    dLine += idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  const dFill = `${dLine} L ${CHART_W} ${chartHeight} L 0 ${chartHeight} Z`;

  const midVal = (minVal + maxVal) / 2;
  const gridVals = [maxVal, midVal, minVal];

  const handleTouch = (e: { nativeEvent: { locationX: number } }) => {
    if (chartWidth <= 0 || vals.length < 2) return;
    const x = e.nativeEvent.locationX;
    const idx = Math.round((x / chartWidth) * (vals.length - 1));
    onSelect(Math.max(0, Math.min(vals.length - 1, idx)));
  };

  const selX = selectedIdx != null ? (CHART_W * selectedIdx) / (vals.length - 1) : 0;
  const selY = selectedIdx != null ? toY(vals[selectedIdx]) : 0;

  return (
    <View style={styles.chartWrapper}>
      <View
        style={styles.chartSvgWrap}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => onSelect(null)}>
        <Svg
          width="100%"
          height={chartHeight}
          viewBox={`0 0 ${CHART_W} ${chartHeight}`}
          preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="trendChartGradFill" x1="0%" x2="0%" y1="0%" y2="100%">
              <Stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
              <Stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {gridVals.map((gv, i) => {
            const y = toY(gv);
            return (
              <Path
                key={i}
                d={`M 0 ${y} L ${CHART_W} ${y}`}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            );
          })}
          <Path d={dFill} fill="url(#trendChartGradFill)" />
          <Path
            d={dLine}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {selectedIdx != null && (
            <Path d={`M ${selX} 0 L ${selX} ${chartHeight}`} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
          )}
        </Svg>
        {selectedIdx != null && chartWidth > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.chartDot,
              {
                left: (selectedIdx / (vals.length - 1)) * chartWidth - 6,
                top: selY - 6,
                backgroundColor: lineColor,
              },
            ]}
          />
        )}
      </View>
      <View style={styles.chartLabelCol}>
        {gridVals.map((gv, i) => (
          <Text key={i} style={styles.chartLabelText}>
            {fmtPortfolioAxis(gv, currency, numberLocale)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function TrendScreen() {
  const { t, i18n } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const layout = useScreenLayout();
  const numberLocale = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'tr-TR';
  const [fontsLoaded] = useFonts({ Manrope_800ExtraBold });
  const fontHead800 = fontsLoaded ? 'Manrope_800ExtraBold' : undefined;
  const [portfolioPickerOpen, setPortfolioPickerOpen] = useState(false);
  const [activeTimeframe, setActiveTimeframe] = useState<(typeof TIMEFRAMES)[number]>('1D');
  const [perfCurrency, setPerfCurrency] = useState<'TL' | 'USD'>('TL');
  const [chartSelectedIdx, setChartSelectedIdx] = useState<number | null>(null);
  const [chartCategoryId, setChartCategoryId] = useState<string | null>(null);
  const minuteTick = useMinuteTick();

  const {
    categories,
    holdings,
    usdTry,
    loading,
    error,
    portfolioId,
    portfolios,
    selectPortfolio,
    currentPortfolioName,
  } = usePortfolioCoreData();

  const lastPerfRef = useRef<{
    portfolioId: string | null;
    cacheKey: string;
    values: PortfolioPerformanceValues | null;
  }>({ portfolioId: null, cacheKey: '', values: null });

  const perfCacheKey = chartCategoryId ?? 'all';

  useEffect(() => {
    lastPerfRef.current = { portfolioId: portfolioId ?? null, cacheKey: '', values: null };
  }, [portfolioId]);

  const trendCategories = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    for (const id of TREND_CATEGORY_ORDER) {
      const c = categories.find((x) => x.id === id);
      if (c) list.push(c);
    }
    return list;
  }, [categories]);

  const filteredHoldings = useMemo((): HoldingRow[] => {
    return holdings.filter((h) => {
      const a = normalizeAsset(h.asset);
      if (!a) return false;
      if (!chartCategoryId) return true;
      return a.category_id === chartCategoryId;
    });
  }, [holdings, chartCategoryId]);

  const performanceValues = useMemo(() => {
    const safeRate = usdTry > MIN_VALID_USD_TRY_RATE ? usdTry : 1;
    const live = computePortfolioPerformanceValues(filteredHoldings, safeRate, { now: new Date() });
    const needsFx = filteredHoldings.some((h) => {
      const a = normalizeAsset(h.asset);
      return a != null && isUsdNativeCategory(a.category_id);
    });
    if (needsFx && !(usdTry > MIN_VALID_USD_TRY_RATE)) {
      const cached = lastPerfRef.current;
      if (
        cached.portfolioId === portfolioId &&
        cached.cacheKey === perfCacheKey &&
        cached.values
      ) {
        return cached.values;
      }
      return live;
    }
    const valuationOk = filteredHoldings.every((h) => isHoldingMarketPriceReady(h, safeRate));
    const canCommit =
      valuationOk && (filteredHoldings.length === 0 || live.totalValueTL > 0);
    if (canCommit) {
      lastPerfRef.current = {
        portfolioId: portfolioId ?? null,
        cacheKey: perfCacheKey,
        values: live,
      };
      return live;
    }
    const cached = lastPerfRef.current;
    if (
      cached.portfolioId === portfolioId &&
      cached.cacheKey === perfCacheKey &&
      cached.values
    ) {
      return cached.values;
    }
    return live;
  }, [filteredHoldings, usdTry, minuteTick, portfolioId, perfCacheKey]);

  const historySeries = usePortfolioHistorySeries(
    filteredHoldings,
    usdTry,
    activeTimeframe as PortfolioHistoryTf,
    perfCurrency,
    portfolioId ?? null,
  );

  const performanceSeries = historySeries;

  useEffect(() => {
    setChartSelectedIdx(null);
  }, [activeTimeframe, perfCurrency, portfolioId, chartCategoryId]);

  const chartPositive = useMemo(() => {
    const vals = performanceSeries.values;
    if (vals.length >= 2) {
      const last = vals[vals.length - 1];
      const first = vals[0];
      return last >= first;
    }
    return perfCurrency === 'TL'
      ? performanceValues.totalChangeAmtTL >= 0
      : performanceValues.totalChangeAmtUSD >= 0;
  }, [performanceSeries.values, perfCurrency, performanceValues]);

  const chartPointHint = useMemo(() => {
    if (chartSelectedIdx == null) return null;
    const v = performanceSeries.values[chartSelectedIdx];
    const d = performanceSeries.dates[chartSelectedIdx];
    if (v == null || d == null) return null;
    const dateOpts: Intl.DateTimeFormatOptions =
      activeTimeframe === '1D'
        ? {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }
        : {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          };
    return {
      dateLine: d.toLocaleString(numberLocale, dateOpts),
      valueLine: fmtPortfolioAxis(v, perfCurrency, numberLocale),
    };
  }, [
    chartSelectedIdx,
    performanceSeries.values,
    performanceSeries.dates,
    numberLocale,
    perfCurrency,
    activeTimeframe,
  ]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.header, { paddingVertical: layout.headerPaddingVertical }]}>
          <Pressable
            style={styles.headerTitleBtn}
            onPress={() => portfolios.length > 0 && setPortfolioPickerOpen(true)}
            disabled={portfolios.length === 0}
            accessibilityRole="button"
            accessibilityLabel={t('portfolio.pickPortfolio')}>
            <Text
              style={[
                styles.headerPortfolioTitle,
                { fontFamily: fontHead800, fontSize: layout.headerTitleFontSize },
              ]}
              numberOfLines={2}>
              {currentPortfolioName || t('portfolio.headerTitle')}
            </Text>
          </Pressable>
        </View>

        <PortfolioPickerModal
          visible={portfolioPickerOpen}
          onClose={() => setPortfolioPickerOpen(false)}
          portfolios={portfolios}
          selectedId={portfolioId}
          onSelect={(id) => {
            void selectPortfolio(id);
          }}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled>
          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {loading && !holdings.length ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={PRIMARY} />
              <Text style={styles.loadingText}>{t('portfolio.loading')}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { padding: layout.sectionPadding, paddingBottom: layout.isCompact ? 6 : 8 }]}>
              {t('portfolio.performance')}
            </Text>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={[styles.categoryScroll, { width: Math.max(0, windowWidth - 32) }]}
              contentContainerStyle={styles.categoryScrollContent}>
              <TouchableOpacity
                onPress={() => setChartCategoryId(null)}
                activeOpacity={0.85}
                style={[styles.categoryPill, chartCategoryId == null && styles.categoryPillActive]}>
                <Text
                  style={[
                    styles.categoryPillText,
                    chartCategoryId == null && styles.categoryPillTextActive,
                  ]}>
                  {t('portfolio.allAssets')}
                </Text>
              </TouchableOpacity>
              {trendCategories.map((c) => {
                const active = chartCategoryId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setChartCategoryId(active ? null : c.id)}
                    activeOpacity={0.85}
                    style={[styles.categoryPill, active && styles.categoryPillActive]}>
                    <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>
                      {categoryDisplayLabel(c.id, c.name, t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={[styles.performanceBody, { padding: layout.sectionPadding, paddingTop: layout.isCompact ? 8 : 12 }]}>
              <View style={styles.performanceTop}>
                <View>
                  <Text style={styles.totalLabel}>{t('portfolio.totalValueLabel')}</Text>
                  <Text style={[styles.totalValue, { fontSize: layout.trendTotalValueFontSize }]}>
                    {(perfCurrency === 'TL' ? performanceValues.totalValueTL : performanceValues.totalValueUSD).toLocaleString(
                      perfCurrency === 'USD' ? 'en-US' : numberLocale,
                      {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: perfCurrency === 'USD' ? 2 : 0,
                      },
                    )}
                  </Text>
                  <View style={styles.currencyPill}>
                    <Pressable
                      onPress={() => setPerfCurrency('TL')}
                      style={[styles.currencyPillBtn, perfCurrency === 'TL' && styles.currencyPillBtnOn]}>
                      <Text
                        style={[
                          styles.currencyPillText,
                          perfCurrency === 'TL' && styles.currencyPillTextOn,
                        ]}>
                        {t('home.currencyTL')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPerfCurrency('USD')}
                      style={[styles.currencyPillBtn, perfCurrency === 'USD' && styles.currencyPillBtnOn]}>
                      <Text
                        style={[
                          styles.currencyPillText,
                          perfCurrency === 'USD' && styles.currencyPillTextOn,
                        ]}>
                        {t('home.currencyUSD')}
                      </Text>
                    </Pressable>
                  </View>
                  {(() => {
                    const isDaily = activeTimeframe === '1D';
                    const amt = isDaily
                      ? perfCurrency === 'TL'
                        ? performanceValues.dailyChangeTL
                        : performanceValues.dailyChangeUSD
                      : perfCurrency === 'TL'
                        ? performanceValues.totalChangeAmtTL
                        : performanceValues.totalChangeAmtUSD;
                    const pct = isDaily
                      ? perfCurrency === 'TL'
                        ? performanceValues.dailyPctTL
                        : performanceValues.dailyPctUSD
                      : perfCurrency === 'TL'
                        ? performanceValues.totalChangePctTL
                        : performanceValues.totalChangePctUSD;
                    if (pct == null) return null;
                    return (
                      <View style={styles.trendRow}>
                        <Text style={amt >= 0 ? styles.trendPositive : styles.trendNegative}>
                          {amt >= 0 ? '+' : ''}
                          {amt.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                        <View style={[styles.trendBadge, amt >= 0 && styles.trendBadgePositive]}>
                          <Text style={[styles.trendBadgeText, amt >= 0 && styles.trendBadgeTextPositive]}>
                            {amt >= 0 ? '+' : ''}
                            {pct.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                          </Text>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              </View>
              {chartPointHint ? (
                <View style={styles.chartHintBox}>
                  <Text style={styles.chartHintDate}>{chartPointHint.dateLine}</Text>
                  <Text style={styles.chartHintValue}>{chartPointHint.valueLine}</Text>
                </View>
              ) : null}
              {historySeries.error ? (
                <Text style={styles.historyErrorText}>{historySeries.error}</Text>
              ) : null}
              <View style={styles.chartBlock}>
                {historySeries.loading && filteredHoldings.length > 0 ? (
                  <View style={styles.chartLoadingOverlay}>
                    <ActivityIndicator color={PRIMARY} />
                  </View>
                ) : null}
                <TrendInteractiveChart
                  values={performanceSeries.values}
                  dates={performanceSeries.dates}
                  isPositive={chartPositive}
                  currency={perfCurrency}
                  numberLocale={numberLocale}
                  selectedIdx={chartSelectedIdx}
                  onSelect={setChartSelectedIdx}
                  chartHeight={layout.chartHeight}
                />
              </View>
              <Text style={styles.chartFootnote}>{t('trend.historyExplainer')}</Text>
              <View style={styles.timeframeRow}>
                {TIMEFRAMES.map((tf) => (
                  <TouchableOpacity
                    key={tf}
                    onPress={() => setActiveTimeframe(tf)}
                    style={[styles.timeframeBtn, activeTimeframe === tf && styles.timeframeBtnActive]}>
                    <Text
                      style={[styles.timeframeBtnText, activeTimeframe === tf && styles.timeframeBtnTextActive]}>
                      {tf}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_DARK },
  safe: { flex: 1, backgroundColor: BG_DARK },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerTitleBtn: { maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 8 },
  headerPortfolioTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: PRIMARY,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  errorWrap: { padding: 16, marginBottom: 8, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 12 },
  errorText: { color: '#fca5a5', fontSize: 14 },
  loadingWrap: { padding: 32, alignItems: 'center', gap: 12 },
  loadingText: { color: MUTED, fontSize: 14 },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: WHITE, padding: 16, paddingBottom: 8 },
  categoryScroll: { flexGrow: 0, marginBottom: 4 },
  categoryScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 4,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: SURFACE_CONTAINER,
  },
  categoryPillActive: { backgroundColor: PRIMARY },
  categoryPillText: { fontSize: 12, fontWeight: '600', color: ON_SURFACE_VARIANT },
  categoryPillTextActive: { color: ON_PRIMARY },
  chartBlock: { position: 'relative' },
  chartLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 2,
  },
  historyErrorText: { color: '#fca5a5', fontSize: 12, marginBottom: 8, paddingHorizontal: 16 },
  chartFootnote: {
    fontSize: 10,
    color: MUTED,
    marginTop: 8,
    lineHeight: 14,
    paddingHorizontal: 16,
  },
  performanceBody: { padding: 16, paddingTop: 12 },
  performanceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  totalLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 4, fontWeight: '500' },
  totalValue: { fontSize: 28, fontWeight: '700', color: WHITE, fontVariant: ['tabular-nums'] },
  currencyPill: {
    flexDirection: 'row',
    marginTop: 22,
    padding: 4,
    borderRadius: 999,
    backgroundColor: SURFACE_CONTAINER,
    alignSelf: 'flex-start',
  },
  currencyPillBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  currencyPillBtnOn: { backgroundColor: PRIMARY },
  currencyPillText: { fontSize: 12, fontWeight: '700', color: ON_SURFACE_VARIANT },
  currencyPillTextOn: { color: ON_PRIMARY },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  trendPositive: { fontSize: 15, fontWeight: '600', color: Brand.chartPositive },
  trendNegative: { fontSize: 15, fontWeight: '600', color: Brand.chartNegative },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  trendBadgePositive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  trendBadgeText: { fontSize: 13, fontWeight: '600', color: Brand.chartNegative },
  trendBadgeTextPositive: { color: Brand.chartPositive },
  chartHintBox: {
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chartHintDate: { fontSize: 13, color: '#94A3B8', marginBottom: 4, fontWeight: '500' },
  chartHintValue: { fontSize: 17, fontWeight: '700', color: WHITE, fontVariant: ['tabular-nums'] },
  chartWrapper: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 8,
    marginHorizontal: -4,
  },
  chartSvgWrap: { flex: 1 },
  chartDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  chartLabelCol: {
    width: 78,
    justifyContent: 'space-between',
    paddingVertical: 2,
    alignItems: 'flex-end',
    paddingLeft: 6,
  },
  chartLabelText: { fontSize: 10, color: '#6b7280' },
  timeframeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  timeframeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  timeframeBtnActive: { backgroundColor: PRIMARY },
  timeframeBtnText: { fontSize: 13, fontWeight: '600', color: MUTED },
  timeframeBtnTextActive: { color: ON_PRIMARY },
  bottomSpacer: { height: 24 },
});
