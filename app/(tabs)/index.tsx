import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { categoryDisplayLabel } from '@/lib/category-display';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

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

// Not: Döviz için ülke bayrakları icon_url üzerinden geliyor.

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
  mevduat: '#FFD700',
};

const ASSET_ICONS: Record<string, { icon: string; bg: string; color: string }> = {
  default: { icon: 'ellipse-outline', bg: 'rgba(148,163,184,0.2)', color: '#94A3B8' },
  // Kripto
  BTC: { icon: 'cash', bg: 'rgba(249,115,22,0.2)', color: '#f97316' },
  ETH: { icon: 'analytics', bg: 'rgba(59,130,246,0.2)', color: '#3b82f6' },
  SOL: { icon: 'flash', bg: 'rgba(168,85,247,0.2)', color: '#a855f7' },
  ADA: { icon: 'diamond-outline', bg: 'rgba(99,102,241,0.2)', color: '#6366f1' },
  XRP: { icon: 'flash-outline', bg: 'rgba(34,197,94,0.2)', color: '#22c55e' },
  DOT: { icon: 'ellipse-outline', bg: 'rgba(234,88,12,0.2)', color: '#ea580c' },
  // Emtia: Ionicons cube, metale göre renk
  XAU: { icon: 'cube', bg: 'rgba(250,204,21,0.4)', color: '#facc15' }, // altın
  XAG: { icon: 'cube', bg: 'rgba(148,163,184,0.4)', color: '#e5e7eb' }, // gümüş
  XPT: { icon: 'cube', bg: 'rgba(156,163,175,0.4)', color: '#d1d5db' }, // platin
  XPD: { icon: 'cube', bg: 'rgba(129,140,248,0.4)', color: '#a5b4fc' }, // paladyum
  // Diğer emtia / kategoriler için fallback
  emtia: { icon: 'cube-outline', bg: 'rgba(250,204,21,0.28)', color: '#facc15' },
  // BIST: basit grafik ikonu
  bist: { icon: 'stats-chart', bg: 'rgba(56,189,248,0.3)', color: '#38bdf8' },
  mevduat: { icon: 'wallet-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  VADESIZ: { icon: 'wallet-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  VADELI: { icon: 'time-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  BES: { icon: 'shield-checkmark-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  KASA: { icon: 'lock-closed-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  DIGER: { icon: 'ellipsis-horizontal-circle-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
};

const TIMEFRAMES = ['1D', '1W', '1M', '1Y', '5Y'] as const;

type SortMode = 'todayTopGainers' | 'todayTopLosers' | 'highestValue' | 'lowestValue' | 'alphaAZ' | 'alphaZA';

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
  icon_url?: string | null;
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
  const a = Array.isArray(asset) ? asset[0] ?? null : asset;
  if (a) a.symbol = a.symbol.replace(/^M\d+_/, '');
  return a;
}

export default function PortfolioScreen() {
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'tr-TR';
  const sortCollator = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'tr';

  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const router = useRouter();
  const { portfolioId } = usePortfolio();
  const { toggle: toggleCategory, isSelected: isCategorySelected } = useSelectedCategories();
  const [allocationOpen, setAllocationOpen] = useState(true);
  const [performanceOpen, setPerformanceOpen] = useState(true);
  const [activeTimeframe, setActiveTimeframe] = useState<(typeof TIMEFRAMES)[number]>('1D');
  const [sortMode, setSortMode] = useState<SortMode>('todayTopGainers');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [summaryMode, setSummaryMode] = useState<'daily' | 'total'>('daily');
  const [isSummaryMenuOpen, setIsSummaryMenuOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [usdTry, setUsdTry] = useState<number>(1);
  const [perfCurrency, setPerfCurrency] = useState<'TL' | 'USD'>('TL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsdRate = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('assets')
        .select('current_price')
        .eq('category_id', 'doviz')
        .eq('symbol', 'USD')
        .maybeSingle();
      if (data?.current_price) setUsdTry(Number(data.current_price));
    } catch (_) {
      // ignore - keep previous rate
    }
  }, []);

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
        'id, quantity, avg_price, created_at, asset:assets(id, name, symbol, category_id, current_price, change_24h_pct, icon_url)'
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
    fetchUsdRate();
  }, [fetchCategories, fetchUsdRate]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  useFocusEffect(
    useCallback(() => {
      if (portfolioId) {
        fetchHoldings();
        fetchUsdRate();
      }
    }, [portfolioId, fetchHoldings, fetchUsdRate])
  );

  const sortOptions = useMemo(
    () =>
      [
        { id: 'todayTopGainers' as const, label: t('portfolio.sortTodayGainers') },
        { id: 'todayTopLosers' as const, label: t('portfolio.sortTodayLosers') },
        { id: 'highestValue' as const, label: t('portfolio.sortHighestValue') },
        { id: 'lowestValue' as const, label: t('portfolio.sortLowestValue') },
        { id: 'alphaAZ' as const, label: t('portfolio.sortAlphaAZ') },
        { id: 'alphaZA' as const, label: t('portfolio.sortAlphaZA') },
      ] satisfies { id: SortMode; label: string }[],
    [t],
  );

  const sortLabel = useMemo(
    () => sortOptions.find((o) => o.id === sortMode)?.label ?? sortOptions[0].label,
    [sortOptions, sortMode],
  );

  const allocationData = useMemo(() => {
    const withAsset = holdings.map((h) => ({ ...h, asset: normalizeAsset(h.asset) })).filter((h) => h.asset);
    if (withAsset.length === 0) return [];
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const h of withAsset) {
      const asset = h.asset as AssetRow;
      const cat = asset.category_id;
      const price = asset.current_price ?? h.avg_price ?? 0;
      const rate = cat === 'yurtdisi' ? usdTry : 1;
      const value = h.quantity * (Number(price) || 0) * rate;
      byCategory[cat] = (byCategory[cat] ?? 0) + value;
      total += value;
    }
    if (total === 0 || !Number.isFinite(total)) return [];
    const catNames: Record<string, string> = {};
    categories.forEach((c) => {
      catNames[c.id] = categoryDisplayLabel(c.id, c.name, t);
    });
    const out = Object.entries(byCategory)
      .map(([id, value]) => ({
        label: catNames[id] ?? id,
        value: Math.round((value / total) * 10000) / 100,
        color: CATEGORY_COLORS[id] ?? '#666',
      }))
      .filter((d) => d.value > 0);
    return out;
  }, [holdings, categories, usdTry, t]);

  const filteredHoldings = useMemo(() => {
    const selected = categories.filter((c) => isCategorySelected(c.id)).map((c) => c.id);
    const base =
      selected.length === 0
        ? holdings
        : holdings.filter((h) => {
            const asset = normalizeAsset(h.asset);
            return asset ? selected.includes(asset.category_id) : false;
          });

    const sorted = [...base];

    sorted.sort((a, b) => {
      const assetA = normalizeAsset(a.asset);
      const assetB = normalizeAsset(b.asset);

      const priceA = (assetA?.current_price ?? a.avg_price ?? 0) || 0;
      const priceB = (assetB?.current_price ?? b.avg_price ?? 0) || 0;
      const valueA = a.quantity * Number(priceA || 0);
      const valueB = b.quantity * Number(priceB || 0);

      const changeA = assetA?.change_24h_pct;
      const changeB = assetB?.change_24h_pct;

      switch (sortMode) {
        case 'todayTopGainers': {
          const ca = changeA ?? -Infinity;
          const cb = changeB ?? -Infinity;
          return cb - ca;
        }
        case 'todayTopLosers': {
          const ca = changeA ?? Infinity;
          const cb = changeB ?? Infinity;
          return ca - cb;
        }
        case 'highestValue':
          return (valueB || 0) - (valueA || 0);
        case 'lowestValue':
          return (valueA || 0) - (valueB || 0);
        case 'alphaAZ':
          return (assetA?.symbol ?? '').localeCompare(assetB?.symbol ?? '', sortCollator);
        case 'alphaZA':
          return (assetB?.symbol ?? '').localeCompare(assetA?.symbol ?? '', sortCollator);
        default:
          return 0;
      }
    });

    return sorted;
  }, [holdings, categories, isCategorySelected, sortMode, sortCollator]);

  const summaryData = useMemo(() => {
    let totalUSD = 0;
    let totalTL = 0;
    let dailyAmtUSD = 0;
    let dailyAmtTL = 0;
    let costUSD = 0;
    let costTL = 0;
    let hasUSD = false;
    let hasTL = false;

    for (const h of filteredHoldings) {
      const asset = normalizeAsset(h.asset);
      if (!asset) continue;
      const price = asset.current_price ?? h.avg_price ?? 0;
      const value = h.quantity * (Number(price) || 0);
      const pct = asset.change_24h_pct ?? 0;
      const prevValue = pct !== 0 ? value / (1 + pct / 100) : value;
      const daily = value - prevValue;
      const cost = h.avg_price != null
        ? h.quantity * (Number(h.avg_price) || 0)
        : prevValue;
      const isUSD = asset.category_id === 'yurtdisi';
      if (isUSD) {
        totalUSD += value;
        dailyAmtUSD += daily;
        costUSD += cost;
        hasUSD = true;
      } else {
        totalTL += value;
        dailyAmtTL += daily;
        costTL += cost;
        hasTL = true;
      }
    }

    const dailyPctUSD = totalUSD - dailyAmtUSD > 0 ? (dailyAmtUSD / (totalUSD - dailyAmtUSD)) * 100 : 0;
    const dailyPctTL = totalTL - dailyAmtTL > 0 ? (dailyAmtTL / (totalTL - dailyAmtTL)) * 100 : 0;

    const totalAmtUSD = totalUSD - costUSD;
    const totalAmtTL = totalTL - costTL;
    const totalPctUSD = costUSD > 0 ? (totalAmtUSD / costUSD) * 100 : 0;
    const totalPctTL = costTL > 0 ? (totalAmtTL / costTL) * 100 : 0;

    return {
      totalUSD, totalTL, hasUSD, hasTL,
      dailyAmtUSD, dailyAmtTL, dailyPctUSD, dailyPctTL,
      totalAmtUSD, totalAmtTL, totalPctUSD, totalPctTL,
    };
  }, [filteredHoldings]);

  const performanceValues = useMemo(() => {
    const withAsset = holdings.map((h) => ({ ...h, asset: normalizeAsset(h.asset) })).filter((h) => h.asset);
    let totalValueTL = 0;
    let costBasisTL = 0;
    let totalValueUSD = 0;
    let costBasisUSD = 0;
    let dailyChangeTL = 0;
    let dailyChangeUSD = 0;
    let hasAnyCost = false;
    const safeRate = usdTry > 0 ? usdTry : 1;
    for (const h of withAsset) {
      const asset = h.asset as AssetRow;
      const price = asset.current_price ?? h.avg_price ?? 0;
      const cost = h.avg_price != null && h.avg_price > 0 ? h.avg_price : price;
      const isUSD = asset.category_id === 'yurtdisi';
      const rateTL = isUSD ? safeRate : 1;
      const rateUSD = isUSD ? 1 : 1 / safeRate;
      const value = h.quantity * (Number(price) || 0);
      const costVal = h.quantity * (Number(cost) || 0);
      totalValueTL += value * rateTL;
      costBasisTL += costVal * rateTL;
      totalValueUSD += value * rateUSD;
      costBasisUSD += costVal * rateUSD;
      if (h.avg_price != null && h.avg_price > 0) hasAnyCost = true;
      const pct24 = asset.change_24h_pct ?? 0;
      if (pct24 !== 0) {
        const prevValue = value / (1 + pct24 / 100);
        dailyChangeTL += (value - prevValue) * rateTL;
        dailyChangeUSD += (value - prevValue) * rateUSD;
      }
    }

    const totalChangeAmtTL = totalValueTL - costBasisTL;
    const totalChangePctTL = costBasisTL > 0 ? Math.round((totalChangeAmtTL / costBasisTL) * 10000) / 100 : null;
    const totalChangeAmtUSD = totalValueUSD - costBasisUSD;
    const totalChangePctUSD = costBasisUSD > 0 ? Math.round((totalChangeAmtUSD / costBasisUSD) * 10000) / 100 : null;

    const dailyPctTL = (totalValueTL - dailyChangeTL) > 0
      ? Math.round((dailyChangeTL / (totalValueTL - dailyChangeTL)) * 10000) / 100 : 0;
    const dailyPctUSD = (totalValueUSD - dailyChangeUSD) > 0
      ? Math.round((dailyChangeUSD / (totalValueUSD - dailyChangeUSD)) * 10000) / 100 : 0;

    return {
      totalValueTL, costBasisTL, totalValueUSD, costBasisUSD,
      totalChangeAmtTL, totalChangePctTL, totalChangeAmtUSD, totalChangePctUSD,
      dailyChangeTL, dailyPctTL, dailyChangeUSD, dailyPctUSD,
      hasAnyCost,
    };
  }, [holdings, usdTry]);

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
      case '1Y': {
        const start = now - 365 * 24 * 60 * 60 * 1000;
        return makeZeroToNow(start);
      }
      case '5Y':
      default: {
        const start = now - 5 * 365 * 24 * 60 * 60 * 1000;
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
          <Text style={styles.headerTitle}>{t('portfolio.headerTitle')}</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {loading && !holdings.length ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={ACCENT_BLUE} />
              <Text style={styles.loadingText}>{t('portfolio.loading')}</Text>
            </View>
          ) : null}
          {/* Accordion 1: Asset Allocation */}
          <Accordion title={t('portfolio.allocation')} open={allocationOpen} onToggle={toggleAllocation}>
            <View style={styles.allocationBody}>
              <View style={styles.donutWrap}>
                <UltraDarkDonutChart
                  data={allocationData}
                  size={224}
                  strokeWidth={24}
                  showLabels
                />
              </View>
            </View>
          </Accordion>

          {/* Accordion 2: Performance Trend */}
          <Accordion title={t('portfolio.performance')} open={performanceOpen} onToggle={togglePerformance}>
            <View style={styles.performanceBody}>
              <View style={styles.performanceTop}>
                <View>
                  <Text style={styles.totalLabel}>{t('portfolio.totalValueLabel')}</Text>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalValue}>
                      {(perfCurrency === 'TL' ? performanceValues.totalValueTL : performanceValues.totalValueUSD).toLocaleString(
                        perfCurrency === 'USD' ? 'en-US' : numberLocale,
                        {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: perfCurrency === 'USD' ? 2 : 0,
                        },
                      )}
                    </Text>
                    <View style={styles.currencyToggle}>
                      <Pressable onPress={() => setPerfCurrency('TL')} style={[styles.currencyBtn, perfCurrency === 'TL' && styles.currencyBtnActive]}>
                        <Text style={[styles.currencyBtnText, perfCurrency === 'TL' && styles.currencyBtnTextActive]}>TL</Text>
                      </Pressable>
                      <Pressable onPress={() => setPerfCurrency('USD')} style={[styles.currencyBtn, perfCurrency === 'USD' && styles.currencyBtnActive]}>
                        <Text style={[styles.currencyBtnText, perfCurrency === 'USD' && styles.currencyBtnTextActive]}>USD</Text>
                      </Pressable>
                    </View>
                  </View>
                  {(() => {
                    const isDaily = activeTimeframe === '1D';
                    const amt = isDaily
                      ? (perfCurrency === 'TL' ? performanceValues.dailyChangeTL : performanceValues.dailyChangeUSD)
                      : (perfCurrency === 'TL' ? performanceValues.totalChangeAmtTL : performanceValues.totalChangeAmtUSD);
                    const pct = isDaily
                      ? (perfCurrency === 'TL' ? performanceValues.dailyPctTL : performanceValues.dailyPctUSD)
                      : (perfCurrency === 'TL' ? performanceValues.totalChangePctTL : performanceValues.totalChangePctUSD);
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
              <PerformanceChart
                series={performanceSeries}
                isPositive={performanceValues.totalChangeAmtTL >= 0}
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
            <View>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => setIsSortMenuOpen((o) => !o)}
                activeOpacity={0.85}>
                <Text style={styles.filterBtnText}>{sortLabel}</Text>
                <Ionicons
                  name={isSortMenuOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={MUTED}
                />
              </TouchableOpacity>
              {isSortMenuOpen && (
                <View style={styles.filterMenu}>
                  {sortOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={styles.filterMenuItem}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSortMode(opt.id);
                        setIsSortMenuOpen(false);
                      }}>
                      <Text
                        style={[
                          styles.filterMenuItemText,
                          opt.id === sortMode && styles.filterMenuItemTextActive,
                        ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Category pills + summary mode combo */}
          <View style={styles.pillsContainer}>
            <View style={styles.pillsRow}>
              {categories
                .filter((c) => ['yurtdisi', 'bist', 'doviz', 'emtia'].includes(c.id))
                .map((c) => {
                const isActive = isCategorySelected(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => toggleCategory(c.id)}
                    style={[styles.categoryPill, isActive && styles.categoryPillActive]}>
                    <Text style={[styles.categoryPillText, isActive && styles.categoryPillTextActive]}>
                      {categoryDisplayLabel(c.id, c.name, t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.pillsRow}>
              {categories
                .filter((c) => ['fon', 'kripto', 'mevduat'].includes(c.id))
                .map((c) => {
                const isActive = isCategorySelected(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => toggleCategory(c.id)}
                    style={[styles.categoryPill, isActive && styles.categoryPillActive]}>
                    <Text style={[styles.categoryPillText, isActive && styles.categoryPillTextActive]}>
                      {categoryDisplayLabel(c.id, c.name, t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.summaryComboWrap}>
              <TouchableOpacity
                style={styles.summaryCombo}
                onPress={() => setIsSummaryMenuOpen((o) => !o)}
                activeOpacity={0.85}>
                <Text style={styles.summaryComboText}>
                  {summaryMode === 'daily' ? t('portfolio.daily') : t('portfolio.total')}
                </Text>
                <Ionicons
                  name={isSummaryMenuOpen ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={MUTED}
                />
              </TouchableOpacity>
              {isSummaryMenuOpen && (
                <View style={styles.summaryMenu}>
                  <TouchableOpacity
                    style={styles.summaryMenuItem}
                    onPress={() => { setSummaryMode('daily'); setIsSummaryMenuOpen(false); }}>
                    <Text style={[styles.summaryMenuItemText, summaryMode === 'daily' && styles.summaryMenuItemTextActive]}>
                      {t('portfolio.daily')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.summaryMenuItem}
                    onPress={() => { setSummaryMode('total'); setIsSummaryMenuOpen(false); }}>
                    <Text style={[styles.summaryMenuItemText, summaryMode === 'total' && styles.summaryMenuItemTextActive]}>
                      {t('portfolio.total')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Summary totals */}
          {(summaryData.hasUSD || summaryData.hasTL) && (() => {
            const amtUSD = summaryMode === 'daily' ? summaryData.dailyAmtUSD : summaryData.totalAmtUSD;
            const pctUSD = summaryMode === 'daily' ? summaryData.dailyPctUSD : summaryData.totalPctUSD;
            const amtTL = summaryMode === 'daily' ? summaryData.dailyAmtTL : summaryData.totalAmtTL;
            const pctTL = summaryMode === 'daily' ? summaryData.dailyPctTL : summaryData.totalPctTL;
            return (
              <View style={styles.summaryCard}>
                {summaryData.hasUSD && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryValue}>
                      ${summaryData.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.summaryChange, amtUSD >= 0 ? styles.summaryChangePositive : styles.summaryChangeNegative]}>
                      {amtUSD >= 0 ? '+' : '-'}${Math.abs(amtUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {' '}(
                      {pctUSD >= 0 ? '+' : ''}
                      {pctUSD.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)
                    </Text>
                  </View>
                )}
                {summaryData.hasTL && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryValue}>
                      {summaryData.totalTL.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                    </Text>
                    <Text style={[styles.summaryChange, amtTL >= 0 ? styles.summaryChangePositive : styles.summaryChangeNegative]}>
                      {amtTL >= 0 ? '+' : ''}
                      {amtTL.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      {' '}(
                      {pctTL >= 0 ? '+' : ''}
                      {pctTL.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Asset list */}
          <View style={styles.assetList}>
            {filteredHoldings.length === 0 && !loading ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>{t('portfolio.emptyHoldings')}</Text>
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
                  asset.category_id === 'yurtdisi'
                    ? 'USD'
                    : 'TL';
                const listAmountUnit =
                  asset.category_id === 'mevduat'
                    ? 'TL'
                    : asset.category_id === 'doviz'
                      ? asset.symbol
                      : asset.category_id === 'emtia'
                        ? ['XAU', 'XAG', 'XPT', 'XPD'].includes(asset.symbol)
                          ? asset.symbol
                          : (() => {
                              const s = (asset.symbol ?? '').toUpperCase();
                              if ((s.includes('22_AYAR') && s.includes('BILEZIK')) || s.includes('14_AYAR') || s.includes('18_AYAR'))
                                return t('portfolio.unitGram');
                              return t('portfolio.unitPiece');
                            })()
                        : asset.symbol;
                const quantityFormatted = Number(h.quantity).toLocaleString(numberLocale, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 4,
                });
                const iconStyle =
                  ASSET_ICONS[asset.symbol] ??
                  ASSET_ICONS[asset.category_id] ??
                  ASSET_ICONS.default;
                return (
                  <Pressable
                    key={h.id}
                    style={({ pressed }) => [styles.assetRow, pressed && styles.assetRowPressed]}
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/asset-entry',
                        params: {
                          returnTo: '/(tabs)/index',
                          holdingId: h.id,
                          assetId: asset.id,
                          name: asset.name,
                          symbol: asset.symbol,
                          categoryId: asset.category_id,
                          price:
                            asset.current_price != null ? String(asset.current_price) : h.avg_price != null ? String(h.avg_price) : '',
                          quantity: String(h.quantity),
                          avgPrice: h.avg_price != null ? String(h.avg_price) : '',
                        },
                      })
                    }>
                    <View style={styles.assetLeft}>
                      <View style={[styles.assetIcon, { backgroundColor: iconStyle.bg }]}>
                        {asset.category_id === 'doviz' && asset.icon_url ? (
                          <Image
                            source={{ uri: asset.icon_url }}
                            style={styles.assetIconImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <Ionicons name={iconStyle.icon as any} size={24} color={iconStyle.color} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.assetName}>{asset.symbol}</Text>
                        <Text style={styles.assetAmount} numberOfLines={1}>
                          {quantityFormatted} · {asset.name}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.assetRight}>
                      <Text style={styles.assetValue}>
                        {value.toLocaleString(valueCurrency === 'USD' ? 'en-US' : numberLocale, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        {valueCurrency}
                      </Text>
                      {(() => {
                        const costPrice = h.avg_price != null ? Number(h.avg_price) : null;
                        const totalPctFromCost = costPrice != null && costPrice > 0
                          ? ((currentPrice - costPrice) / costPrice) * 100
                          : null;
                        // Some categories (especially funds) may not have change_24h_pct.
                        // Fallback to cost-based performance so the UI does not show "—".
                        const dailyPct = changePct ?? totalPctFromCost ?? 0;
                        const totalPct = costPrice != null && costPrice > 0
                          ? ((currentPrice - costPrice) / costPrice) * 100
                          : dailyPct;
                        const displayPct = summaryMode === 'daily' ? dailyPct : totalPct;
                        const unitPrice = currentPrice;
                        const priceFormatted = valueCurrency === 'USD'
                          ? `$${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : `${unitPrice.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
                        return (
                          <View style={styles.assetChangeRow}>
                            <Text style={styles.assetUnitPrice}>{priceFormatted}</Text>
                            <Text
                              style={[
                                styles.assetChange,
                                displayPct == null
                                  ? styles.assetChangeNeutral
                                  : displayPct >= 0
                                    ? styles.assetChangePositive
                                    : styles.assetChangeNegative,
                              ]}>
                              {displayPct == null
                                ? '—'
                                : `${displayPct >= 0 ? '+' : ''}${displayPct.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
                            </Text>
                          </View>
                        );
                      })()}
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
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
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
    /** UltraDarkDonutChart canvas ~ size+160 (etiket payı); 336 kesiyordu. */
    minWidth: 392,
    minHeight: 392,
    overflow: 'visible',
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
  currencyToggle: { flexDirection: 'row', marginLeft: 10, gap: 2, alignSelf: 'center' },
  currencyBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' },
  currencyBtnActive: { backgroundColor: ACCENT_BLUE },
  currencyBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  currencyBtnTextActive: { color: '#FFFFFF' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  trendNegative: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  trendPositive: { fontSize: 14, fontWeight: '600', color: '#22c55e' },
  trendBadge: { backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  trendBadgePositive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  trendBadgeText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
  trendBadgeTextPositive: { color: '#22c55e' },
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
  timeframeBtnActive: { backgroundColor: ACCENT_BLUE },
  timeframeBtnText: { fontSize: 12, fontWeight: '500', color: MUTED },
  timeframeBtnTextActive: { fontSize: 12, fontWeight: '700', color: WHITE },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  filterMenu: {
    marginTop: 6,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  filterMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterMenuItemText: { fontSize: 13, color: MUTED },
  filterMenuItemTextActive: { fontSize: 13, fontWeight: '600', color: WHITE },
  pillsContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: 8,
    zIndex: 5,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: BUTTON_BG,
  },
  categoryPillActive: { backgroundColor: ACCENT_BLUE },
  categoryPillText: { fontSize: 12, fontWeight: '600', color: '#AAB0C4' },
  categoryPillTextActive: { fontSize: 12, fontWeight: '600', color: WHITE },
  summaryComboWrap: {
    position: 'relative',
    marginRight: 8,
    marginTop: 8,
    alignSelf: 'flex-end',
    zIndex: 10,
  },
  summaryCombo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: BUTTON_BG,
  },
  summaryComboText: {
    fontSize: 12,
    fontWeight: '600',
    color: WHITE,
  },
  summaryMenu: {
    position: 'absolute',
    top: 38,
    right: 0,
    backgroundColor: SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    zIndex: 20,
    minWidth: 100,
    elevation: 10,
  },
  summaryMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  summaryMenuItemText: { fontSize: 13, color: MUTED },
  summaryMenuItemTextActive: { fontWeight: '600', color: WHITE },
  summaryCard: {
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: WHITE,
    fontVariant: ['tabular-nums'] as any,
  },
  summaryChange: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
  },
  summaryChangePositive: { color: '#22c55e' },
  summaryChangeNegative: { color: '#f87171' },
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
  assetIconImage: { width: 32, height: 32, borderRadius: 16 },
  assetName: { fontSize: 16, fontWeight: '600', color: WHITE },
  assetAmount: { fontSize: 12, color: '#A1A1AA', marginTop: 2 },
  assetRight: { alignItems: 'flex-end' },
  assetValue: { fontSize: 16, fontWeight: '500', color: WHITE, fontVariant: ['tabular-nums'] },
  assetChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  assetUnitPrice: { fontSize: 11, fontWeight: '500', color: MUTED, fontVariant: ['tabular-nums'] as any },
  assetChange: { fontSize: 12, fontWeight: '500' },
  assetChangePositive: { color: PRIMARY },
  assetChangeNegative: { color: '#f87171' },
  assetChangeNeutral: { color: '#9ca3af' },
  bottomSpacer: { height: 120 },
});
