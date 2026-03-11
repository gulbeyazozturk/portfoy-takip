import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { usePortfolio } from '@/context/portfolio';
import { useSelectedCategories } from '@/context/selected-categories';
import { UltraDarkDonutChart } from '@/components/ultra-dark-donut-chart';
import { supabase } from '@/lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BG_DARK = '#000000';
const SURFACE = '#111111';
const PRIMARY = '#00e677';
const ACCENT_BLUE = '#2979FF';
const MUTED = '#a1a1aa';
const WHITE = '#FFFFFF';
const BUTTON_BG = '#3F4250';
const BORDER = 'rgba(255,255,255,0.05)';

const DEFAULT_ALLOCATION = [
  { label: 'Fon', value: 40.6, color: '#00C2F2' },
  { label: 'Emtia', value: 24.4, color: '#F9A000' },
  { label: 'ABD', value: 18.0, color: '#C60021' },
  { label: 'Kripto', value: 9.6, color: '#F6465D' },
  { label: 'BIST', value: 6.9, color: '#A64CEB' },
  { label: 'Döviz', value: 0.6, color: '#2EB135' },
];

const CATEGORY_COLORS: Record<string, string> = {
  fon: '#00C2F2',
  emtia: '#F9A000',
  yurtdisi: '#C60021',
  kripto: '#F6465D',
  bist: '#A64CEB',
  doviz: '#2EB135',
};

const ASSET_ICONS: Record<string, { icon: string; bg: string; color: string }> = {
  default: { icon: 'ellipse-outline', bg: 'rgba(148,163,184,0.2)', color: '#94A3B8' },
  BTC: { icon: 'cash', bg: 'rgba(249,115,22,0.2)', color: '#f97316' },
  ETH: { icon: 'analytics', bg: 'rgba(59,130,246,0.2)', color: '#3b82f6' },
  SOL: { icon: 'flash', bg: 'rgba(168,85,247,0.2)', color: '#a855f7' },
  ADA: { icon: 'diamond-outline', bg: 'rgba(99,102,241,0.2)', color: '#6366f1' },
  XRP: { icon: 'flash-outline', bg: 'rgba(34,197,94,0.2)', color: '#22c55e' },
  DOT: { icon: 'ellipse-outline', bg: 'rgba(234,88,12,0.2)', color: '#ea580c' },
};

const TIMEFRAMES = ['1H', '1D', '1W', '1M', 'YTD', 'ALL'] as const;

function Accordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.accordion}>
      <TouchableOpacity style={styles.accordionSummary} onPress={onToggle} activeOpacity={0.8}>
        <Text style={styles.accordionTitle}>{title}</Text>
        <Ionicons
          name="chevron-down"
          size={22}
          color={MUTED}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>
      {open && <View style={styles.accordionBody}>{children}</View>}
    </View>
  );
}

const CHART_W = 400;
const CHART_H = 120;

function PerformanceChart({
  series,
  isPositive,
}: {
  series: number[];
  isPositive: boolean;
}) {
  if (!series.length) return null;
  const vals = series;
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;
  const padding = range * 0.1;
  const vMin = minVal - padding;
  const vMax = maxVal + padding;
  const vRange = vMax - vMin || 1;
  const toY = (v: number) => CHART_H - 20 - ((v - vMin) / vRange) * (CHART_H - 40);
  const lineColor = isPositive ? '#22c55e' : '#EF4444';
  let dLine = '';
  vals.forEach((v, idx) => {
    const x = vals.length === 1 ? CHART_W / 2 : (CHART_W * idx) / (vals.length - 1);
    const y = toY(v);
    dLine += idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  const dFill = `${dLine} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;
  return (
    <View style={styles.chartArea}>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="perfChartGrad" x1="0%" x2="0%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <Stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={dFill} fill="url(#perfChartGrad)" />
        <Path d={dLine} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

type CategoryRow = { id: string; name: string; sort_order: number };
type AssetRow = {
  id: string;
  name: string;
  symbol: string;
  category_id: string;
  current_price: number | null;
  change_24h_pct?: number | null;
};
type HoldingRow = {
  id: string;
  quantity: number;
  avg_price: number | null;
  created_at: string;
  asset: AssetRow | AssetRow[] | null;
};

function normalizeAsset(asset: HoldingRow['asset']): AssetRow | null {
  if (!asset) return null;
  if (Array.isArray(asset)) return asset[0] ?? null;
  return asset;
}

export default function PortfolioScreen() {
  const router = useRouter();
  const { portfolioId } = usePortfolio();
  const { toggle: toggleCategory, isSelected: isCategorySelected } = useSelectedCategories();
  const [allocationOpen, setAllocationOpen] = useState(true);
  const [performanceOpen, setPerformanceOpen] = useState(true);
  const [activeTimeframe, setActiveTimeframe] = useState<(typeof TIMEFRAMES)[number]>('1H');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('categories')
      .select('id, name, sort_order')
      .order('sort_order', { ascending: true });
    if (e) {
      setError(e.message);
      return;
    }
    setCategories((data as CategoryRow[]) ?? []);
  }, []);

  const fetchHoldings = useCallback(async () => {
    if (!portfolioId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('holdings')
      .select(
        'id, quantity, avg_price, created_at, asset:assets(id, name, symbol, category_id, current_price, change_24h_pct)'
      )
      .eq('portfolio_id', portfolioId);
    if (e) {
      setError(e.message);
      setHoldings([]);
    } else {
      setHoldings((data as unknown as HoldingRow[]) ?? []);
    }
    setLoading(false);
  }, [portfolioId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  useFocusEffect(
    useCallback(() => {
      if (portfolioId) fetchHoldings();
    }, [portfolioId, fetchHoldings])
  );

  const allocationData = useMemo(() => {
    const withAsset = holdings.map((h) => ({ ...h, asset: normalizeAsset(h.asset) })).filter((h) => h.asset);
    if (withAsset.length === 0) return [];
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const h of withAsset) {
      const cat = (h.asset as AssetRow).category_id;
      const price = (h.asset as AssetRow).current_price ?? h.avg_price ?? 0;
      const value = h.quantity * (Number(price) || 0);
      byCategory[cat] = (byCategory[cat] ?? 0) + value;
      total += value;
    }
    if (total === 0 || !Number.isFinite(total)) return [];
    const catNames: Record<string, string> = {};
    categories.forEach((c) => { catNames[c.id] = c.name; });
    const out = Object.entries(byCategory)
      .map(([id, value]) => ({
        label: catNames[id] ?? id,
        value: Math.round((value / total) * 10000) / 100,
        color: CATEGORY_COLORS[id] ?? '#666',
      }))
      .filter((d) => d.value > 0);
    return out;
  }, [holdings, categories]);

  const filteredHoldings = useMemo(() => {
    const selected = categories.filter((c) => isCategorySelected(c.id)).map((c) => c.id);
    if (selected.length === 0) return holdings;
    return holdings.filter((h) => {
      const asset = normalizeAsset(h.asset);
      return asset ? selected.includes(asset.category_id) : false;
    });
  }, [holdings, categories, isCategorySelected]);

  const performanceValues = useMemo(() => {
    const withAsset = holdings.map((h) => ({ ...h, asset: normalizeAsset(h.asset) })).filter((h) => h.asset);
    let totalValueTL = 0;
    let costBasisTL = 0;
    let hasAnyCost = false;
    for (const h of withAsset) {
      const price = (h.asset as AssetRow).current_price ?? h.avg_price ?? 0;
      const cost = h.avg_price != null && h.avg_price > 0 ? h.avg_price : price;
      const value = h.quantity * (Number(price) || 0);
      const costVal = h.quantity * (Number(cost) || 0);
      totalValueTL += value;
      costBasisTL += costVal;
      if (h.avg_price != null && h.avg_price > 0) hasAnyCost = true;
    }
    const changeAmount = totalValueTL - costBasisTL;
    const changePct =
      costBasisTL > 0 ? Math.round((changeAmount / costBasisTL) * 10000) / 100 : null;
    return {
      totalValueTL,
      costBasisTL,
      changeAmount,
      changePct,
      hasAnyCost,
    };
  }, [holdings]);

  const performanceSeries = useMemo(() => {
    if (!holdings.length) return [];
    const now = Date.now();
    const createdTimes = holdings
      .map((h) => new Date(h.created_at).getTime())
      .filter((t) => Number.isFinite(t));
    const firstCreated = createdTimes.length ? Math.min(...createdTimes) : now;
    const totalNow = performanceValues.totalValueTL;
    const costNow = performanceValues.costBasisTL;

    const makeZeroToNow = (startMs: number) => {
      const points = 20;
      const out: number[] = [];
      for (let i = 0; i < points; i++) {
        const t = startMs + ((now - startMs) * i) / (points - 1);
        if (t < firstCreated) {
          out.push(0);
        } else {
          out.push(totalNow);
        }
      }
      return out;
    };

    switch (activeTimeframe) {
      case '1H':
      case '1D':
        return [costNow || totalNow, totalNow];
      case '1W': {
        const start = now - 7 * 24 * 60 * 60 * 1000;
        return makeZeroToNow(start);
      }
      case '1M': {
        const start = now - 30 * 24 * 60 * 60 * 1000;
        return makeZeroToNow(start);
      }
      case 'YTD': {
        const d = new Date();
        const start = new Date(d.getFullYear(), 0, 1).getTime();
        return makeZeroToNow(start);
      }
      case 'ALL':
      default: {
        const start = Math.min(firstCreated - 7 * 24 * 60 * 60 * 1000, now);
        return makeZeroToNow(start);
      }
    }
  }, [holdings, performanceValues.totalValueTL, performanceValues.costBasisTL, activeTimeframe]);

  const toggleAllocation = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAllocationOpen((o) => !o);
  };
  const togglePerformance = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPerformanceOpen((o) => !o);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="menu" size={24} color={WHITE} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Portfolio</Text>
          <TouchableOpacity hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="notifications-outline" size={24} color={WHITE} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {loading && !holdings.length ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={ACCENT_BLUE} />
              <Text style={styles.loadingText}>Portföy yükleniyor…</Text>
            </View>
          ) : null}
          {/* Accordion 1: Asset Allocation */}
          <Accordion title="Asset Allocation" open={allocationOpen} onToggle={toggleAllocation}>
            <View style={styles.allocationBody}>
              <View style={styles.donutWrap}>
                <UltraDarkDonutChart
                  data={allocationData}
                  size={224}
                  strokeWidth={24}
                  showLabels
                />
                <TouchableOpacity activeOpacity={0.85} style={styles.donutCenterBtn}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={WHITE} />
                </TouchableOpacity>
              </View>
            </View>
          </Accordion>

          {/* Accordion 2: Performance Trend */}
          <Accordion title="Performance Trend" open={performanceOpen} onToggle={togglePerformance}>
            <View style={styles.performanceBody}>
              <View style={styles.performanceTop}>
                <View>
                  <Text style={styles.totalLabel}>Total Value</Text>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalValue}>
                      {performanceValues.totalValueTL.toLocaleString('tr-TR', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </Text>
                    <Text style={styles.totalCurrency}>TL</Text>
                    <Ionicons name="sync-outline" size={14} color={MUTED} style={{ marginLeft: 4 }} />
                  </View>
                  {performanceValues.costBasisTL > 0 && performanceValues.changePct != null && (
                    <View style={styles.trendRow}>
                      <Text
                        style={
                          performanceValues.changeAmount >= 0 ? styles.trendPositive : styles.trendNegative
                        }>
                        {performanceValues.changeAmount >= 0 ? '+' : ''}
                        {performanceValues.changeAmount.toLocaleString('tr-TR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                      <View
                        style={[
                          styles.trendBadge,
                          performanceValues.changeAmount >= 0 && styles.trendBadgePositive,
                        ]}>
                        <Text
                          style={[
                            styles.trendBadgeText,
                            performanceValues.changeAmount >= 0 && styles.trendBadgeTextPositive,
                          ]}>
                          {performanceValues.changeAmount >= 0 ? '+' : ''}
                          {performanceValues.changePct.toFixed(2).replace('.', ',')}%
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
                <TouchableOpacity style={styles.insightsBtn}>
                  <Ionicons name="sparkles" size={16} color={ACCENT_BLUE} />
                  <Text style={styles.insightsBtnText}>Insights</Text>
                </TouchableOpacity>
              </View>
              <PerformanceChart
                series={performanceSeries}
                isPositive={performanceValues.changeAmount >= 0}
              />
              <View style={styles.timeframeRow}>
                {TIMEFRAMES.map((tf) => (
                  <TouchableOpacity
                    key={tf}
                    onPress={() => setActiveTimeframe(tf)}
                    style={[styles.timeframeBtn, activeTimeframe === tf && styles.timeframeBtnActive]}>
                    <Text
                      style={[
                        styles.timeframeBtnText,
                        activeTimeframe === tf && styles.timeframeBtnTextActive,
                      ]}>
                      {tf}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Accordion>

          {/* Filter row */}
          <View style={styles.filterRow}>
            <TouchableOpacity style={styles.filterBtn}>
              <Text style={styles.filterBtnText}>Highest holdings</Text>
              <Ionicons name="chevron-down" size={16} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterBtn}>
              <Text style={styles.filterBtnText}>24 Hours</Text>
              <Ionicons name="chevron-down" size={16} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* Category pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}>
            {categories.map((c) => {
              const isActive = isCategorySelected(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => toggleCategory(c.id)}
                  style={[styles.categoryPill, isActive && styles.categoryPillActive]}>
                  <Text style={[styles.categoryPillText, isActive && styles.categoryPillTextActive]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Asset list */}
          <View style={styles.assetList}>
            {filteredHoldings.length === 0 && !loading ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Henüz varlık yok. + ile ekleyebilirsiniz.</Text>
              </View>
            ) : (
              filteredHoldings.map((h) => {
                const asset = normalizeAsset(h.asset);
                if (!asset) return null;
                const currentPrice = asset.current_price ?? h.avg_price ?? 0;
                const value = h.quantity * currentPrice;
                // Sadece günlük (24s) artış/düşüş; piyasa verisi yoksa — göster.
                const changePct = asset.change_24h_pct ?? null;
                const valueCurrency =
                  asset.category_id === 'bist' || asset.category_id === 'kripto' || asset.category_id === 'doviz'
                    ? 'TL'
                    : 'USD';
                const iconStyle = ASSET_ICONS[asset.symbol] ?? ASSET_ICONS.default;
                return (
                  <Pressable
                    key={h.id}
                    style={({ pressed }) => [styles.assetRow, pressed && styles.assetRowPressed]}
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/asset-entry',
                        params: {
                          holdingId: h.id,
                          assetId: asset.id,
                          name: asset.name,
                          symbol: asset.symbol,
                          price:
                            asset.current_price != null ? String(asset.current_price) : h.avg_price != null ? String(h.avg_price) : '',
                          quantity: String(h.quantity),
                          avgPrice: h.avg_price != null ? String(h.avg_price) : '',
                        },
                      })
                    }>
                    <View style={styles.assetLeft}>
                      <View style={[styles.assetIcon, { backgroundColor: iconStyle.bg }]}>
                        <Ionicons name={iconStyle.icon as any} size={24} color={iconStyle.color} />
                      </View>
                      <View>
                        <Text style={styles.assetName}>{asset.name}</Text>
                        <Text style={styles.assetAmount}>
                          {h.quantity} {asset.symbol}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.assetRight}>
                      <Text style={styles.assetValue}>
                        {value.toLocaleString('tr-TR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        {valueCurrency}
                      </Text>
                      <Text
                        style={[
                          styles.assetChange,
                          changePct != null && changePct >= 0
                            ? styles.assetChangePositive
                            : styles.assetChangeNegative,
                        ]}>
                        {changePct == null ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2).replace('.', ',')}%`}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
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
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: WHITE },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  errorWrap: { padding: 16, marginBottom: 8, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 12 },
  errorText: { color: '#fca5a5', fontSize: 14 },
  loadingWrap: { padding: 32, alignItems: 'center', gap: 12 },
  loadingText: { color: MUTED, fontSize: 14 },
  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyText: { color: MUTED, fontSize: 14 },
  accordion: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: 'hidden',
  },
  accordionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  accordionTitle: { fontSize: 16, fontWeight: '600', color: WHITE },
  accordionBody: { paddingHorizontal: 24, paddingBottom: 24 },
  allocationBody: { alignItems: 'center', paddingTop: 8 },
  donutWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 336,
    minHeight: 336,
  },
  donutCenterBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: '45%' },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  performanceBody: { paddingTop: 8 },
  performanceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  totalLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 4, fontWeight: '500' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline' },
  totalValue: { fontSize: 28, fontWeight: '700', color: WHITE, fontVariant: ['tabular-nums'] },
  totalCurrency: { fontSize: 14, color: '#94A3B8', marginLeft: 8, fontWeight: '500' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  trendNegative: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  trendPositive: { fontSize: 14, fontWeight: '600', color: '#22c55e' },
  trendBadge: { backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  trendBadgePositive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  trendBadgeText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
  trendBadgeTextPositive: { color: '#22c55e' },
  insightsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
  },
  insightsBtnText: { fontSize: 12, fontWeight: '600', color: '#e2e8f0' },
  chartArea: { width: '100%', height: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: SURFACE },
  timeframeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    flexWrap: 'wrap',
    gap: 8,
  },
  timeframeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  timeframeBtnActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  timeframeBtnText: { fontSize: 12, fontWeight: '500', color: MUTED },
  timeframeBtnTextActive: { fontSize: 12, fontWeight: '700', color: WHITE },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: SURFACE,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterBtnText: { fontSize: 14, fontWeight: '500', color: WHITE },
  pillsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 8, marginBottom: 8 },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: BUTTON_BG,
  },
  categoryPillActive: { backgroundColor: ACCENT_BLUE },
  categoryPillText: { fontSize: 12, fontWeight: '600', color: '#AAB0C4' },
  categoryPillTextActive: { fontSize: 12, fontWeight: '600', color: WHITE },
  assetList: { marginTop: 8 },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  assetRowPressed: {
    opacity: 0.7,
  },
  assetLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  assetIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  assetName: { fontSize: 16, fontWeight: '600', color: WHITE },
  assetAmount: { fontSize: 12, color: '#A1A1AA', marginTop: 2 },
  assetRight: { alignItems: 'flex-end' },
  assetValue: { fontSize: 16, fontWeight: '500', color: WHITE, fontVariant: ['tabular-nums'] },
  assetChange: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  assetChangePositive: { color: PRIMARY },
  assetChangeNegative: { color: '#f87171' },
  bottomSpacer: { height: 120 },
});
