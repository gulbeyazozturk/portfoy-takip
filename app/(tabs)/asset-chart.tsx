import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabScreenRoot } from '@/components/tab-screen-root';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { kriptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import { formatDisplayMoney, formatDisplayMoneyFlexible, type DisplayCurrency } from '@/lib/display-currency';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';
import { supabase } from '@/lib/supabase';

const CHART_W = 300;
const CHART_H = 165;
const PRIMARY = '#89acff';
const CHART_GREEN = Brand.chartPositive;
const CHART_RED = Brand.chartNegative;
const ON_SURFACE_MUTED = '#ababab';
const TIMEFRAMES = ['1D', '1W', '1M', '1Y', '5Y'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function timeframeMs(tf: Timeframe): number {
  switch (tf) {
    case '1D': return 86_400_000;
    case '1W': return 7 * 86_400_000;
    case '1M': return 30 * 86_400_000;
    case '1Y': return 365 * 86_400_000;
    case '5Y': return 5 * 365 * 86_400_000;
  }
}

function PriceChart({
  series,
  isPositive,
  selectedIdx,
  onSelect,
  numberLocale,
  currency,
}: {
  series: number[];
  isPositive: boolean;
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
  numberLocale: string;
  currency: DisplayCurrency;
}) {
  const [chartWidth, setChartWidth] = useState(0);
  if (series.length < 2) return null;

  const vals = series;
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;
  const padding = range * 0.1;
  const vMin = minVal - padding;
  const vMax = maxVal + padding;
  const vRange = vMax - vMin || 1;
  const toY = (v: number) => CHART_H - ((v - vMin) / vRange) * CHART_H;
  const lineColor = isPositive ? CHART_GREEN : CHART_RED;

  let dLine = '';
  vals.forEach((v, idx) => {
    const x = (CHART_W * idx) / (vals.length - 1);
    const y = toY(v);
    dLine += idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  const dFill = `${dLine} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;
  const midVal = (minVal + maxVal) / 2;
  const gridVals = [maxVal, midVal, minVal];

  const fmtLabel = (v: number) => formatDisplayMoneyFlexible(v, currency, numberLocale);

  const handleTouch = (e: any) => {
    if (chartWidth <= 0 || vals.length < 2) return;
    const x = e.nativeEvent.locationX;
    const idx = Math.round((x / chartWidth) * (vals.length - 1));
    onSelect(Math.max(0, Math.min(vals.length - 1, idx)));
  };

  const selX = selectedIdx != null ? (CHART_W * selectedIdx) / (vals.length - 1) : 0;
  const selY = selectedIdx != null ? toY(vals[selectedIdx]) : 0;

  return (
    <View style={styles.chartWrap}>
      <View
        style={styles.svgWrap}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => onSelect(null)}
      >
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="priceGrad2" x1="0%" x2="0%" y1="0%" y2="100%">
              <Stop offset="0%" stopColor={lineColor} stopOpacity="0.35" />
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
          <Path d={dFill} fill="url(#priceGrad2)" />
          <Path d={dLine} fill="none" stroke={lineColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          {selectedIdx != null && (
            <Path d={`M ${selX} 0 L ${selX} ${CHART_H}`} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
          )}
        </Svg>
        {selectedIdx != null && chartWidth > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: (selectedIdx / (vals.length - 1)) * chartWidth - 6,
              top: selY - 6,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: lineColor,
              borderWidth: 2,
              borderColor: '#ffffff',
            }}
          />
        )}
      </View>
      <View style={styles.labelCol}>
        {gridVals.map((gv, i) => (
          <ThemedText key={i} style={styles.labelText}>{fmtLabel(gv)}</ThemedText>
        ))}
      </View>
    </View>
  );
}

export default function AssetChartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    assetId?: string;
    categoryId?: string;
    symbol?: string;
    name?: string;
    price?: string;
    spotCurrency?: string;
    holdingId?: string;
    returnTo?: string;
    entryReturnTo?: string;
    entryReturnCategoryId?: string;
    entryReturnLabel?: string;
    entryQuantity?: string;
    entryAvgPrice?: string;
  }>();
  const assetId = firstParam(params.assetId) ?? '';
  const categoryId = firstParam(params.categoryId) ?? '';
  const symbol = firstParam(params.symbol) ?? '';
  const name = firstParam(params.name) ?? '';
  const routeSpotCurrency = firstParam(params.spotCurrency) ?? null;
  const holdingId = firstParam(params.holdingId) ?? '';
  const routePrice = Number(firstParam(params.price) ?? 0) || 0;
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1D');
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [livePrice, setLivePrice] = useState(routePrice);
  const [spotCurrency, setSpotCurrency] = useState<string | null>(routeSpotCurrency);
  const [usdTry, setUsdTry] = useState(1);
  const [holdingCreatedAt, setHoldingCreatedAt] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    if (firstParam(params.returnTo) === '/(tabs)/asset-entry') {
      router.replace({
        pathname: '/(tabs)/asset-entry',
        params: {
          returnTo: firstParam(params.entryReturnTo) ?? '',
          returnCategoryId: firstParam(params.entryReturnCategoryId) ?? '',
          returnLabel: firstParam(params.entryReturnLabel) ?? '',
          holdingId: firstParam(params.holdingId) ?? '',
          assetId: firstParam(params.assetId) ?? '',
          name: firstParam(params.name) ?? '',
          symbol: firstParam(params.symbol) ?? '',
          categoryId: firstParam(params.categoryId) ?? '',
          price: firstParam(params.price) ?? '',
          spotCurrency: firstParam(params.spotCurrency) ?? '',
          quantity: firstParam(params.entryQuantity) ?? '',
          avgPrice: firstParam(params.entryAvgPrice) ?? '',
        },
      });
      return;
    }
    router.back();
  }, [params, router]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack]),
  );

  const numberLocale = 'tr-TR';
  const currentPrice = useMemo(() => {
    if (categoryId !== 'kripto' || usdTry <= 0) return livePrice;
    return kriptoStoredUnitToUsd(livePrice, usdTry, spotCurrency);
  }, [categoryId, livePrice, usdTry, spotCurrency]);

  useEffect(() => {
    if (!holdingId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('holdings').select('created_at').eq('id', holdingId).maybeSingle();
      if (!cancelled) setHoldingCreatedAt(data?.created_at ?? null);
    })();
    return () => { cancelled = true; };
  }, [holdingId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('assets')
        .select('current_price, currency')
        .eq('id', assetId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.currency) setSpotCurrency(String(data.currency));
      if (data?.current_price != null && Number(data.current_price) > 0) setLivePrice(Number(data.current_price));
      const { data: usd } = await supabase
        .from('assets')
        .select('current_price')
        .eq('category_id', 'doviz')
        .eq('symbol', 'USD')
        .maybeSingle();
      if (!cancelled && usd?.current_price != null && Number(usd.current_price) > 0) {
        setUsdTry(Number(usd.current_price));
      }
    })();
    return () => { cancelled = true; };
  }, [assetId]);

  useEffect(() => {
    if (!assetId || currentPrice <= 0 || categoryId === 'mevduat') return;
    let cancelled = false;
    (async () => {
      setLoadingChart(true);
      setSelectedIdx(null);
      const tfFrom = new Date(Date.now() - timeframeMs(activeTimeframe));
      const holdStart = holdingCreatedAt ? new Date(holdingCreatedAt) : null;
      const historyFromMs = holdStart != null ? Math.max(holdStart.getTime(), tfFrom.getTime()) : tfFrom.getTime();
      const { data, error } = await supabase
        .from('price_history')
        .select('price')
        .eq('asset_id', assetId)
        .gte('recorded_at', new Date(historyFromMs).toISOString())
        .order('recorded_at', { ascending: true });
      if (cancelled) return;
      const prices = !error && data ? data.map((d) => Number(d.price)) : [];
      if (categoryId === 'kripto' && usdTry > 0 && currentPrice > 0) {
        for (let i = 0; i < prices.length; i++) {
          const p = prices[i];
          prices[i] = p <= 0 ? p : kriptoStoredUnitToUsd(p, usdTry, spotCurrency, currentPrice);
        }
      }
      if (currentPrice > 0) {
        if (prices.length === 0) prices.push(currentPrice * 0.998, currentPrice);
        else prices.push(currentPrice);
      }
      setPriceHistory(prices.length >= 2 ? prices : []);
      setLoadingChart(false);
    })();
    return () => { cancelled = true; };
  }, [assetId, activeTimeframe, currentPrice, categoryId, holdingCreatedAt, usdTry, spotCurrency]);

  const chartFirst = priceHistory[0] ?? currentPrice;
  const chartLast = selectedIdx != null && priceHistory[selectedIdx] != null ? priceHistory[selectedIdx] : currentPrice;
  const isPositive = chartLast >= chartFirst;
  const pct = chartFirst > 0 ? ((chartLast - chartFirst) / chartFirst) * 100 : 0;
  const displayCurrency: DisplayCurrency = isUsdNativeCategory(categoryId) ? 'USD' : 'TL';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <TabScreenRoot style={styles.flex}>
        <ThemedView style={styles.container} lightColor="#000000" darkColor="#000000">
          <View style={styles.header}>
            <Pressable onPress={handleBack} hitSlop={12} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={22} color={PRIMARY} />
            </Pressable>
            <ThemedText style={styles.headerTitle}>Grafik</ThemedText>
            <View style={styles.headerSpacer} />
          </View>

        <View style={styles.hero}>
          <ThemedText style={styles.symbol}>{(symbol || '—').toUpperCase()}</ThemedText>
          <ThemedText style={styles.name} numberOfLines={2}>{name}</ThemedText>
          <ThemedText style={styles.price}>
            {currentPrice > 0
              ? formatDisplayMoney(currentPrice, displayCurrency, numberLocale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '—'}
          </ThemedText>
          <ThemedText style={[styles.pct, { color: pct >= 0 ? CHART_GREEN : CHART_RED }]}>
            {pct >= 0 ? '+' : ''}{pct.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
          </ThemedText>
        </View>

        {loadingChart ? (
          <ActivityIndicator style={{ marginTop: 36 }} color={PRIMARY} />
        ) : (
          <PriceChart
            series={priceHistory}
            isPositive={isPositive}
            selectedIdx={selectedIdx}
            onSelect={setSelectedIdx}
            numberLocale={numberLocale}
            currency={displayCurrency}
          />
        )}

        <View style={styles.tfRow}>
          {TIMEFRAMES.map((tf) => (
            <Pressable key={tf} style={[styles.tfPill, activeTimeframe === tf && styles.tfPillActive]} onPress={() => setActiveTimeframe(tf)}>
              <ThemedText style={[styles.tfPillText, activeTimeframe === tf && styles.tfPillTextActive]}>{tf}</ThemedText>
            </Pressable>
          ))}
        </View>
        </ThemedView>
      </TabScreenRoot>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  headerSpacer: { width: 44, height: 44 },
  hero: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
  symbol: { color: '#fff', fontSize: 18, fontWeight: '700' },
  name: { color: ON_SURFACE_MUTED, fontSize: 13, textAlign: 'center', marginTop: 2 },
  price: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 8 },
  pct: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  chartWrap: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, marginBottom: 14 },
  svgWrap: { flex: 1 },
  labelCol: { width: 56, justifyContent: 'space-between', paddingVertical: 2, alignItems: 'flex-end', paddingLeft: 8 },
  labelText: { fontSize: 10, color: ON_SURFACE_MUTED },
  tfRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  tfPill: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    backgroundColor: '#131313',
  },
  tfPillActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  tfPillText: { color: ON_SURFACE_MUTED, fontSize: 12, fontWeight: '700' },
  tfPillTextActive: { color: '#000' },
});
