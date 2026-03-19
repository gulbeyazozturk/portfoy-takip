import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePortfolio } from '@/context/portfolio';
import { supabase } from '@/lib/supabase';

const CHART_W = 400;
const CHART_H = 140;
const ACCENT_BLUE = '#3b82f6';
const TIMEFRAMES = ['1D', '1W', '1M', '1Y', '5Y'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const CATEGORY_LABELS: Record<string, string> = {
  yurtdisi: 'Yurtdışı',
  bist: 'BIST',
  doviz: 'Döviz',
  emtia: 'Emtia',
  fon: 'Fon',
  kripto: 'Kripto',
  mevduat: 'Mevduat',
};

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
  currPre,
  currSuf,
  selectedIdx,
  onSelect,
}: {
  series: number[];
  isPositive: boolean;
  currPre: string;
  currSuf: string;
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
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
  const lineColor = isPositive ? '#22c55e' : '#EF4444';

  let dLine = '';
  vals.forEach((v, idx) => {
    const x = (CHART_W * idx) / (vals.length - 1);
    const y = toY(v);
    dLine += idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  const dFill = `${dLine} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  const midVal = (minVal + maxVal) / 2;
  const gridVals = [maxVal, midVal, minVal];

  const fmtLabel = (v: number) => {
    const abs = Math.abs(v);
    let maxDec = 2;
    if (abs > 0 && abs < 0.01) maxDec = 10;
    else if (abs >= 0.01 && abs < 1) maxDec = 6;
    else if (abs >= 1 && abs < 10) maxDec = 4;
    const formatted = abs.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDec });
    const trimmed = formatted.replace(/0+$/, '').replace(/,$/, '');
    return `${currPre}${v < 0 ? `-${trimmed}` : trimmed}${currSuf}`;
  };

  const handleTouch = (e: any) => {
    if (chartWidth <= 0 || vals.length < 2) return;
    const x = e.nativeEvent.locationX;
    const idx = Math.round((x / chartWidth) * (vals.length - 1));
    onSelect(Math.max(0, Math.min(vals.length - 1, idx)));
  };

  const selX = selectedIdx != null ? (CHART_W * selectedIdx) / (vals.length - 1) : 0;
  const selY = selectedIdx != null ? toY(vals[selectedIdx]) : 0;

  return (
    <View style={chartStyles.wrapper}>
      <View
        style={chartStyles.svgWrap}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => onSelect(null)}
      >
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="priceGrad" x1="0%" x2="0%" y1="0%" y2="100%">
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
          <Path d={dFill} fill="url(#priceGrad)" />
          <Path
            d={dLine}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {selectedIdx != null && (
            <Path
              d={`M ${selX} 0 L ${selX} ${CHART_H}`}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1}
            />
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
      <View style={chartStyles.labelCol}>
        {gridVals.map((gv, i) => (
          <ThemedText key={i} style={chartStyles.labelText}>{fmtLabel(gv)}</ThemedText>
        ))}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  svgWrap: {
    flex: 1,
  },
  labelCol: {
    width: 75,
    justifyContent: 'space-between',
    paddingVertical: 2,
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  labelText: {
    fontSize: 10,
    color: '#6b7280',
  },
});

export default function AssetEntryScreen() {
  const router = useRouter();
  const { portfolioId } = usePortfolio();
  const params = useLocalSearchParams<{
    returnTo?: string;
    returnCategoryId?: string;
    returnLabel?: string;
    holdingId?: string;
    assetId?: string;
    name?: string;
    symbol?: string;
    categoryId?: string;
    price?: string;
    quantity?: string;
    avgPrice?: string;
  }>();

  const [holdingId, setHoldingId] = useState<string | undefined>(params.holdingId as string | undefined);
  const assetId = params.assetId as string | undefined;
  const name = params.name ?? 'Varlık';
  const symbol = params.symbol ?? '';
  const categoryId = params.categoryId as string | undefined;
  const returnTo = params.returnTo as string | undefined;
  const returnCategoryId = params.returnCategoryId as string | undefined;
  const returnLabel = params.returnLabel as string | undefined;
  const currentPrice = params.price ? Number(params.price) : 0;

  const handleBack = () => {
    if (returnTo === '/(tabs)/asset-list' && returnCategoryId != null) {
      router.replace({
        pathname: '/(tabs)/asset-list',
        params: { categoryId: returnCategoryId, label: returnLabel ?? '' },
      });
      return;
    }
    if (returnTo === '/(tabs)/index') {
      router.replace('/(tabs)');
      return;
    }
    router.back();
  };

  const amountUnitLabel = useMemo(() => {
    if (categoryId === 'mevduat') return 'TL';
    if (categoryId === 'doviz') return symbol || '—';
    if (categoryId === 'emtia') {
      if (['XAU', 'XAG', 'XPT', 'XPD'].includes(symbol)) return symbol;
      const s = (symbol ?? '').toUpperCase();
      if (s.includes('22_AYAR') && s.includes('BILEZIK')) return 'Gram';
      if (s.includes('14_AYAR') || s.includes('18_AYAR')) return 'Gram';
      return 'Adet';
    }
    return symbol || 'Adet';
  }, [categoryId, symbol]);

  const [amount, setAmount] = useState(() => (params.quantity as string | undefined) ?? '');
  const [unitPrice, setUnitPrice] = useState(() => (params.avgPrice as string | undefined) ?? '');
  const [saving, setSaving] = useState(false);

  type FormMode = 'add' | 'reduce' | 'delete';
  const [formMode, setFormMode] = useState<FormMode>('add');

  useFocusEffect(
    useCallback(() => {
      setFormMode('add');
      setInputWhole('');
      setInputDecimal('');
      setInputCost('');
    }, [])
  );
  const [inputWhole, setInputWhole] = useState('');
  const [inputDecimal, setInputDecimal] = useState('');
  const [inputCost, setInputCost] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1D');
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [chartDates, setChartDates] = useState<(Date | null)[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [change24hPct, setChange24hPct] = useState<number | null>(null);
  const [holdingCreatedAt, setHoldingCreatedAt] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const qty = parseFloat(amount?.replace(',', '.') || '0') || 0;
  const avgCost = unitPrice ? parseFloat(unitPrice.replace(',', '.')) || 0 : 0;

  useEffect(() => {
    setAmount((params.quantity as string | undefined) ?? '');
    setUnitPrice((params.avgPrice as string | undefined) ?? '');
  }, [params.quantity, params.avgPrice, assetId]);

  useEffect(() => {
    if (holdingId || !assetId) return;
    (async () => {
      const { data } = await supabase
        .from('holdings')
        .select('id, quantity, avg_price')
        .eq('asset_id', assetId)
        .maybeSingle();
      if (data) {
        setHoldingId(data.id);
        setAmount(String(data.quantity ?? ''));
        setUnitPrice(data.avg_price != null ? String(data.avg_price) : '');
      }
    })();
  }, [holdingId, assetId]);

  useEffect(() => {
    if (!assetId) return;
    (async () => {
      const { data } = await supabase
        .from('assets')
        .select('change_24h_pct')
        .eq('id', assetId)
        .single();
      if (data) {
        setChange24hPct(data.change_24h_pct != null ? Number(data.change_24h_pct) : null);
      }
    })();
  }, [assetId]);

  useEffect(() => {
    if (!holdingId) return;
    (async () => {
      const { data } = await supabase
        .from('holdings')
        .select('created_at')
        .eq('id', holdingId)
        .single();
      if (data) setHoldingCreatedAt(data.created_at);
    })();
  }, [holdingId]);

  useEffect(() => {
    if (!assetId || currentPrice <= 0 || categoryId === 'mevduat') return;
    let cancelled = false;
    (async () => {
      setLoadingChart(true);
      setSelectedIdx(null);

      const tfFrom = new Date(Date.now() - timeframeMs(activeTimeframe));
      const holdStart = holdingCreatedAt ? new Date(holdingCreatedAt) : null;

      const { data, error } = await supabase
        .from('price_history')
        .select('price, recorded_at')
        .eq('asset_id', assetId)
        .gte('recorded_at', holdStart ? holdStart.toISOString() : tfFrom.toISOString())
        .order('recorded_at', { ascending: true });

      if (cancelled) return;

      const historyPrices = !error && data ? data.map((d) => Number(d.price)) : [];
      const historyDates = !error && data ? data.map((d) => new Date(d.recorded_at)) : [];
      const entryPrice = holdingId && avgCost > 0 ? avgCost : currentPrice;

      let prices: number[] = [];
      let dates: (Date | null)[] = [];

      if (holdStart && holdStart > tfFrom) {
        const totalMs = Date.now() - tfFrom.getTime();
        const zeroMs = holdStart.getTime() - tfFrom.getTime();
        const zeroPortion = zeroMs / totalMs;
        const zeroPoints = Math.max(2, Math.round(zeroPortion * 20));

        for (let p = 0; p < zeroPoints; p++) {
          const t = new Date(tfFrom.getTime() + (p / Math.max(1, zeroPoints - 1)) * zeroMs);
          prices.push(0);
          dates.push(t);
        }

        prices.push(entryPrice);
        dates.push(holdStart);
        prices.push(...historyPrices);
        dates.push(...historyDates);
        if (currentPrice > 0) { prices.push(currentPrice); dates.push(new Date()); }
      } else {
        if (holdStart) { prices.push(entryPrice); dates.push(holdStart); }
        prices.push(...historyPrices);
        dates.push(...historyDates);
        if (currentPrice > 0) { prices.push(currentPrice); dates.push(new Date()); }
      }

      if (prices.length >= 2) {
        setPriceHistory(prices);
        setChartDates(dates);
      } else if (holdingId && avgCost > 0 && currentPrice > 0) {
        setPriceHistory([0, 0, avgCost, currentPrice]);
        setChartDates([tfFrom, holdStart ?? tfFrom, holdStart ?? tfFrom, new Date()]);
      } else if (currentPrice > 0) {
        setPriceHistory([currentPrice * 0.99, currentPrice]);
        setChartDates([tfFrom, new Date()]);
      } else {
        setPriceHistory([]);
        setChartDates([]);
      }

      setLoadingChart(false);
    })();
    return () => { cancelled = true; };
  }, [assetId, activeTimeframe, currentPrice, categoryId, holdingCreatedAt, holdingId, avgCost]);

  const inputQty = useMemo(() => {
    const w = parseInt(inputWhole || '0', 10) || 0;
    const d = inputDecimal ? parseFloat(`0.${inputDecimal}`) : 0;
    return w + d;
  }, [inputWhole, inputDecimal]);

  const navigateBack = () => {
    if (returnTo === '/(tabs)/asset-list' && returnCategoryId != null) {
      router.replace({
        pathname: '/(tabs)/asset-list',
        params: { categoryId: returnCategoryId, label: returnLabel ?? '', _t: Date.now().toString() },
      });
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleAdd = async () => {
    if (!assetId || !portfolioId) {
      Alert.alert('Hata', 'Portföy veya varlık bilgisi eksik.');
      return;
    }
    if (inputQty <= 0) {
      Alert.alert('Hata', 'Geçerli bir miktar girin.');
      return;
    }
    const cost = inputCost ? parseFloat(inputCost.replace(',', '.')) : null;
    setSaving(true);

    if (holdingId) {
      let newAvg: number | null = avgCost;
      if (cost != null && cost > 0) {
        newAvg = avgCost > 0
          ? (qty * avgCost + inputQty * cost) / (qty + inputQty)
          : cost;
      }
      const newQty = qty + inputQty;
      const { error } = await supabase
        .from('holdings')
        .update({ quantity: newQty, avg_price: newAvg })
        .eq('id', holdingId);
      setSaving(false);
      if (error) { Alert.alert('Hata', error.message); return; }
      setAmount(String(newQty));
      setUnitPrice(newAvg != null ? String(newAvg) : '');
    } else {
      const { data, error } = await supabase.from('holdings').insert({
        portfolio_id: portfolioId,
        asset_id: assetId,
        quantity: inputQty,
        avg_price: cost,
      }).select('id').single();
      setSaving(false);
      if (error) { Alert.alert('Hata', error.message); return; }
      if (data) setHoldingId(data.id);
      setAmount(String(inputQty));
      setUnitPrice(cost != null ? String(cost) : '');
    }
    setInputWhole('');
    setInputDecimal('');
    setInputCost('');
  };

  const handleReduce = async () => {
    if (!holdingId) return;
    if (inputQty <= 0) {
      Alert.alert('Hata', 'Geçerli bir miktar girin.');
      return;
    }
    if (inputQty > qty) {
      Alert.alert('Hata', `Mevcut adetten (${qty.toLocaleString('tr-TR')}) fazla çıkaramazsınız.`);
      return;
    }
    const newQty = qty - inputQty;
    setSaving(true);
    if (newQty <= 0) {
      const { error } = await supabase.from('holdings').delete().eq('id', holdingId);
      setSaving(false);
      if (error) { Alert.alert('Hata', error.message); return; }
      navigateBack();
    } else {
      const { error } = await supabase
        .from('holdings')
        .update({ quantity: newQty })
        .eq('id', holdingId);
      setSaving(false);
      if (error) { Alert.alert('Hata', error.message); return; }
      setAmount(String(newQty));
      setInputWhole('');
      setInputDecimal('');
    }
  };

  const handleDeleteConfirm = () => {
    if (!holdingId) return;
    setShowDeleteModal(true);
  };

  const performDelete = async () => {
    if (!holdingId) return;
    setSaving(true);
    const { error } = await supabase.from('holdings').delete().eq('id', holdingId);
    setSaving(false);
    if (error) {
      if (Platform.OS === 'web') {
        window.alert('Silme hatası: ' + error.message);
      } else {
        Alert.alert('Silme hatası', error.message);
      }
      return;
    }
    router.replace('/(tabs)');
  };

  const isUSD = categoryId === 'yurtdisi' || categoryId === 'kripto';
  const curr = isUSD ? '$' : '';
  const currSuffix = isUSD ? '' : ' TL';
  const marketValue = qty * currentPrice;
  const totalCost = qty * avgCost;
  const totalGainLoss = avgCost > 0 ? marketValue - totalCost : 0;
  const isPositive = totalGainLoss >= 0;

  const fmtVal = (v: number) => {
    const abs = Math.abs(v);
    let maxDec = 2;
    if (abs > 0 && abs < 0.01) maxDec = 10;
    else if (abs >= 0.01 && abs < 1) maxDec = 6;
    else if (abs >= 1 && abs < 10) maxDec = 4;
    const formatted = abs.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDec });
    const trimmed = formatted.replace(/0+$/, '').replace(/,$/, '');
    return v < 0 ? `-${trimmed}` : trimmed;
  };

  const showPriceSection = currentPrice > 0 && categoryId !== 'mevduat';

  const displayPrice = useMemo(() => {
    if (selectedIdx != null && priceHistory[selectedIdx] != null) {
      return priceHistory[selectedIdx];
    }
    return currentPrice;
  }, [selectedIdx, priceHistory, currentPrice]);

  const bigPriceText = `${curr}${fmtVal(displayPrice)}${currSuffix}`;

  const chartChange = useMemo(() => {
    if (priceHistory.length < 2) {
      if (activeTimeframe === '1D' && change24hPct != null) {
        const prevPrice = currentPrice / (1 + change24hPct / 100);
        return { amount: currentPrice - prevPrice, percentage: change24hPct };
      }
      return null;
    }

    const targetIdx = selectedIdx != null ? selectedIdx : priceHistory.length - 1;
    const targetPrice = priceHistory[targetIdx];
    const firstNonZero = priceHistory.find((p) => p > 0) ?? 0;

    if (firstNonZero <= 0) return null;
    const diff = targetPrice - firstNonZero;
    const pct = (diff / firstNonZero) * 100;
    return { amount: diff, percentage: pct };
  }, [priceHistory, selectedIdx, activeTimeframe, change24hPct, currentPrice]);

  const selectedDate = useMemo(() => {
    if (selectedIdx != null && chartDates[selectedIdx]) {
      return chartDates[selectedIdx]!.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
    return null;
  }, [selectedIdx, chartDates]);

  const isChartPositive = chartChange ? chartChange.amount >= 0 : true;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container} lightColor="#000000" darkColor="#000000">
        {/* Top bar: back arrow */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.8} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color="#f9fafb" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Hero: icon + symbol + name */}
          <View style={styles.heroSection}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="cube-outline" size={28} color="#60a5fa" />
            </View>
            <ThemedText type="subtitle" style={styles.heroSymbol}>{symbol || '—'}</ThemedText>
            <ThemedText style={styles.heroName} numberOfLines={2}>{name}</ThemedText>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <ThemedText style={styles.statLabel}>Sahip olunan</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.statValue}>{qty > 0 ? qty.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 10 }) : '—'}</ThemedText>
            </View>
            <View style={[styles.statItem, styles.statItemCenter]}>
              <ThemedText style={styles.statLabel}>Piyasa Değeri</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.statValue}>
                {qty > 0 ? `${curr}${fmtVal(marketValue)}${currSuffix}` : '—'}
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText style={styles.statLabel}>{isPositive ? 'Toplam Kazanç' : 'Toplam Kayıp'}</ThemedText>
              <ThemedText type="defaultSemiBold" style={[styles.statValue, avgCost > 0 && (isPositive ? styles.statPositive : styles.statNegative)]}>
                {avgCost > 0 ? `${totalGainLoss >= 0 ? '+' : ''}${curr}${fmtVal(totalGainLoss)}${currSuffix}` : '—'}
              </ThemedText>
            </View>
          </View>

          {/* Maliyet satırı */}
          <View style={styles.costRow}>
            <ThemedText style={styles.costLabel}>Maliyet Toplamı</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.costValue}>
              {avgCost > 0 ? `${curr}${fmtVal(totalCost)}${currSuffix}` : '—'}
            </ThemedText>
          </View>

          {/* Price + Chart section */}
          {showPriceSection && (
            <>
              <View style={styles.divider} />

              <View style={styles.priceSection}>
                <ThemedText style={styles.bigPrice}>{bigPriceText}</ThemedText>
                {chartChange && (
                  <View style={styles.changeRow}>
                    <ThemedText style={isChartPositive ? styles.changeTextPositive : styles.changeTextNegative}>
                      {isChartPositive ? '+' : ''}{curr}{fmtVal(Math.abs(chartChange.amount))}{currSuffix}
                    </ThemedText>
                    <View style={[styles.changeBadge, isChartPositive ? styles.changeBadgePos : styles.changeBadgeNeg]}>
                      <ThemedText style={isChartPositive ? styles.changeBadgeTextPos : styles.changeBadgeTextNeg}>
                        {isChartPositive ? '+' : ''}{chartChange.percentage.toFixed(2).replace('.', ',')}%
                      </ThemedText>
                    </View>
                  </View>
                )}
                {selectedDate ? (
                  <ThemedText style={styles.pointDate}>{selectedDate}</ThemedText>
                ) : (
                  <ThemedText style={styles.categoryBadge}>
                    {CATEGORY_LABELS[categoryId ?? ''] ?? categoryId}
                  </ThemedText>
                )}
              </View>

              {/* Timeframe buttons */}
              <View style={styles.tfRow}>
                {TIMEFRAMES.map((tf) => (
                  <Pressable
                    key={tf}
                    style={[styles.tfBtn, activeTimeframe === tf && styles.tfBtnActive]}
                    onPress={() => setActiveTimeframe(tf)}>
                    <ThemedText style={[styles.tfBtnText, activeTimeframe === tf && styles.tfBtnTextActive]}>
                      {tf}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              {/* Chart */}
              {loadingChart ? (
                <ActivityIndicator style={{ marginVertical: 24 }} color="#60a5fa" />
              ) : (
                <PriceChart
                  series={priceHistory}
                  isPositive={isChartPositive}
                  currPre={curr}
                  currSuf={currSuffix}
                  selectedIdx={selectedIdx}
                  onSelect={setSelectedIdx}
                />
              )}
            </>
          )}

          <View style={styles.divider} />

          {/* Mode buttons */}
          <View style={styles.modeRow}>
            {(['add', 'reduce', 'delete'] as FormMode[]).map((m) => {
              const label = m === 'add' ? 'EKLEME' : m === 'reduce' ? 'AZALTMA' : 'SİLME';
              const active = formMode === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.modeBtn,
                    active && (m === 'add' ? styles.modeBtnAdd : m === 'reduce' ? styles.modeBtnReduce : styles.modeBtnDelete),
                  ]}
                  activeOpacity={0.8}
                  onPress={() => { setFormMode(m); setInputWhole(''); setInputDecimal(''); setInputCost(''); }}>
                  <ThemedText style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>{label}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Form content per mode */}
          <View style={styles.formContainer}>
            {formMode === 'add' && (
              <>
                <ThemedText style={styles.splitLabel}>EKLENECEK ADET</ThemedText>
                <View style={styles.splitRow}>
                  <TextInput
                    style={styles.splitInputLeft}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#6b7280"
                    value={inputWhole}
                    onChangeText={(t) => setInputWhole(t.replace(/[^0-9]/g, ''))}
                  />
                  <ThemedText style={styles.splitComma}>,</ThemedText>
                  <TextInput
                    style={styles.splitInputRight}
                    keyboardType="number-pad"
                    placeholder="0000000000"
                    placeholderTextColor="#6b7280"
                    maxLength={10}
                    value={inputDecimal}
                    onChangeText={(t) => setInputDecimal(t.replace(/[^0-9]/g, ''))}
                  />
                </View>

                <ThemedText style={[styles.splitLabel, { marginTop: 12 }]}>BİRİM MALİYET (Opsiyonel)</ThemedText>
                <View style={styles.costInputWrapper}>
                  <TextInput
                    style={styles.costInput}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#6b7280"
                    value={inputCost}
                    onChangeText={setInputCost}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnAdd, saving && styles.actionBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleAdd}
                  disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.actionBtnText}>EKLE</ThemedText>
                  )}
                </TouchableOpacity>
              </>
            )}

            {formMode === 'reduce' && (
              <>
                <ThemedText style={styles.splitLabel}>ÇIKARILACAK ADET</ThemedText>
                <View style={styles.splitRow}>
                  <TextInput
                    style={styles.splitInputLeft}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#6b7280"
                    value={inputWhole}
                    onChangeText={(t) => setInputWhole(t.replace(/[^0-9]/g, ''))}
                  />
                  <ThemedText style={styles.splitComma}>,</ThemedText>
                  <TextInput
                    style={styles.splitInputRight}
                    keyboardType="number-pad"
                    placeholder="0000000000"
                    placeholderTextColor="#6b7280"
                    maxLength={10}
                    value={inputDecimal}
                    onChangeText={(t) => setInputDecimal(t.replace(/[^0-9]/g, ''))}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnReduce, saving && styles.actionBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleReduce}
                  disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.actionBtnText}>AZALT</ThemedText>
                  )}
                </TouchableOpacity>
              </>
            )}

            {formMode === 'delete' && holdingId && (
              <View style={styles.deleteSection}>
                <ThemedText style={styles.deleteWarning}>
                  Bu varlık portföyünüzden tamamen silinecektir.
                </ThemedText>
                <ThemedText style={styles.deleteInfo}>
                  Mevcut: {qty.toLocaleString('tr-TR', { maximumFractionDigits: 10 })} adet
                </ThemedText>
                <ThemedText style={styles.deleteInfo}>
                  Değer: {curr}{(qty * currentPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{currSuffix}
                </ThemedText>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDeleteFull, saving && styles.actionBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleDeleteConfirm}
                  disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.actionBtnText}>SİL</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {formMode === 'delete' && !holdingId && (
              <ThemedText style={styles.deleteWarning}>
                Bu varlık portföyünüze henüz eklenmemiş.
              </ThemedText>
            )}
          </View>
        </ScrollView>
      </ThemedView>

      {/* Delete confirmation modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="warning" size={32} color="#ef4444" />
            </View>
            <ThemedText style={styles.modalTitle}>Varlığı Sil</ThemedText>
            <ThemedText style={styles.modalMessage}>
              {qty.toLocaleString('tr-TR', { maximumFractionDigits: 10 })} adet{' '}
              <ThemedText style={styles.modalBold}>{symbol || name}</ThemedText>{' '}
              silinecek. Onaylıyor musun?
            </ThemedText>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                activeOpacity={0.8}
                onPress={() => setShowDeleteModal(false)}>
                <ThemedText style={styles.modalBtnCancelText}>Hayır</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnConfirm}
                activeOpacity={0.8}
                onPress={() => { setShowDeleteModal(false); performDelete(); }}>
                <ThemedText style={styles.modalBtnConfirmText}>Evet, Sil</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 16,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(96,165,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroSymbol: {
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '700',
  },
  heroName: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 32,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemCenter: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  statValue: {
    color: '#f9fafb',
    fontSize: 14,
  },
  statPositive: { color: '#22c55e' },
  statNegative: { color: '#ef4444' },
  costRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  costLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  costValue: {
    fontSize: 14,
    color: '#f9fafb',
  },

  /* ---- Price + Chart section ---- */
  priceSection: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 8,
  },
  bigPrice: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
    color: '#f9fafb',
    letterSpacing: -0.5,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  changeTextPositive: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
  changeTextNegative: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  changeBadgePos: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  changeBadgeNeg: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  changeBadgeTextPos: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22c55e',
  },
  changeBadgeTextNeg: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ef4444',
  },
  categoryBadge: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
  },
  pointDate: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 6,
  },
  tfRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tfBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tfBtnActive: {
    backgroundColor: ACCENT_BLUE,
  },
  tfBtnText: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '600',
  },
  tfBtnTextActive: {
    color: '#ffffff',
  },

  /* ---- Common ---- */
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16,
    marginVertical: 8,
  },

  /* ---- Mode Buttons ---- */
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  modeBtnAdd: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderColor: '#22c55e',
  },
  modeBtnReduce: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderColor: '#f59e0b',
  },
  modeBtnDelete: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: '#ef4444',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 0.5,
  },
  modeBtnTextActive: {
    color: '#ffffff',
  },

  /* ---- Form ---- */
  formContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  splitLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitInputLeft: {
    flex: 1,
    fontSize: 18,
    color: '#f9fafb',
    textAlign: 'right',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  splitComma: {
    fontSize: 22,
    color: '#9ca3af',
    marginHorizontal: 8,
    fontWeight: '700',
  },
  splitInputRight: {
    flex: 1,
    fontSize: 18,
    color: '#f9fafb',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  costInputWrapper: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  costInput: {
    fontSize: 18,
    color: '#f9fafb',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnAdd: {
    backgroundColor: '#22c55e',
    width: '16%',
    alignSelf: 'center',
  },
  actionBtnReduce: {
    backgroundColor: '#f59e0b',
    width: '16%',
    alignSelf: 'center',
  },
  actionBtnDeleteFull: {
    backgroundColor: '#ef4444',
    width: '16%',
    alignSelf: 'center',
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  deleteSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteWarning: {
    color: '#fbbf24',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  deleteInfo: {
    color: '#d1d5db',
    fontSize: 15,
    marginBottom: 4,
  },

  /* ---- Delete Modal ---- */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalBold: {
    fontWeight: '700',
    color: '#f9fafb',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
  },
  modalBtnCancelText: {
    color: '#d1d5db',
    fontWeight: '600',
    fontSize: 15,
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
