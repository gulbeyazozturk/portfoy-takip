import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
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

function MiniAreaChart() {
  return (
    <View style={styles.chartArea}>
      <Svg width="100%" height={120} viewBox="0 0 400 150" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="chartGrad" x1="0%" x2="0%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor="#EF4444" stopOpacity="0.2" />
            <Stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path
          d="M0,50 Q50,45 100,60 T200,80 T300,110 T400,120 L400,150 L0,150 Z"
          fill="url(#chartGrad)"
        />
        <Path
          d="M0,50 Q50,45 100,60 T200,80 T300,110 T400,120"
          fill="none"
          stroke="#EF4444"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

type CategoryRow = { id: string; name: string; sort_order: number };
type AssetRow = { id: string; name: string; symbol: string; category_id: string; current_price: number | null };
type HoldingRow = { id: string; quantity: number; avg_price: number | null; asset: AssetRow | AssetRow[] | null };

function normalizeAsset(asset: HoldingRow['asset']): AssetRow | null {
  if (!asset) return null;
  if (Array.isArray(asset)) return asset[0] ?? null;
  return asset;
}

export default function PortfolioScreen() {
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
      .select('id, quantity, avg_price, asset:assets(id, name, symbol, category_id, current_price)')
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
    if (withAsset.length === 0) return DEFAULT_ALLOCATION;
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const h of withAsset) {
      const cat = (h.asset as AssetRow).category_id;
      const price = (h.asset as AssetRow).current_price ?? h.avg_price ?? 0;
      const value = h.quantity * price;
      byCategory[cat] = (byCategory[cat] ?? 0) + value;
      total += value;
    }
    if (total === 0) return DEFAULT_ALLOCATION;
    const catNames: Record<string, string> = {};
    categories.forEach((c) => { catNames[c.id] = c.name; });
    const out = Object.entries(byCategory).map(([id, value]) => ({
      label: catNames[id] ?? id,
      value: Math.round((value / total) * 1000) / 10,
      color: CATEGORY_COLORS[id] ?? '#666',
    }));
    return out.length ? out : DEFAULT_ALLOCATION;
  }, [holdings, categories]);

  const filteredHoldings = useMemo(() => {
    const selected = categories.filter((c) => isCategorySelected(c.id)).map((c) => c.id);
    if (selected.length === 0) return holdings;
    return holdings.filter((h) => {
      const asset = normalizeAsset(h.asset);
      return asset ? selected.includes(asset.category_id) : false;
    });
  }, [holdings, categories, isCategorySelected]);

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
          showsVerticalScrollIndicator={false}>
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
                  showLabels={false}
                />
                <TouchableOpacity activeOpacity={0.85} style={styles.donutCenterBtn}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={WHITE} />
                </TouchableOpacity>
              </View>
              <View style={styles.legendGrid}>
                {allocationData.map((item) => (
                  <View key={item.label} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendText}>
                      {item.value}% {item.label}
                    </Text>
                  </View>
                ))}
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
                    <Text style={styles.totalValue}>210.181</Text>
                    <Text style={styles.totalCurrency}>USD</Text>
                    <Ionicons name="sync-outline" size={14} color={MUTED} style={{ marginLeft: 4 }} />
                  </View>
                  <View style={styles.trendRow}>
                    <Text style={styles.trendNegative}>-389,39</Text>
                    <View style={styles.trendBadge}>
                      <Text style={styles.trendBadgeText}>-0,18%</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.insightsBtn}>
                  <Ionicons name="sparkles" size={16} color={ACCENT_BLUE} />
                  <Text style={styles.insightsBtnText}>Insights</Text>
                </TouchableOpacity>
              </View>
              <MiniAreaChart />
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
                const changePct =
                  h.avg_price && h.avg_price > 0
                    ? ((currentPrice - h.avg_price) / h.avg_price) * 100
                    : null;
                const iconStyle = ASSET_ICONS[asset.symbol] ?? ASSET_ICONS.default;
                return (
                  <View key={h.id} style={styles.assetRow}>
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
                        {asset.category_id === 'bist' ? 'TL' : 'USD'}
                      </Text>
                      <Text
                        style={[
                          styles.assetChange,
                          changePct != null && changePct >= 0
                            ? styles.assetChangePositive
                            : styles.assetChangeNegative,
                        ]}>
                        {changePct == null ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`}
                      </Text>
                    </View>
                  </View>
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
  trendBadge: { backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  trendBadgeText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
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
