import { Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Ionicons } from '@expo/vector-icons';
import { useScrollToTop } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PortfolioPickerModal } from '@/components/portfolio-picker-modal';
import { useSelectedCategories } from '@/context/selected-categories';
import {
  normalizeAsset,
  usePortfolioCoreData,
  type AssetRow,
  type HoldingRow,
} from '@/hooks/use-portfolio-core-data';
import { useMinuteTick } from '@/hooks/use-minute-tick';
import { kriptoStoredUnitToUsd, legacyCryptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import { resolveBistDisplayName } from '@/lib/bist-display-name';
import { Brand } from '@/constants/brand';
import { categoryDisplayLabel } from '@/lib/category-display';
import { effectiveChange24hPctForDisplay } from '@/lib/effective-change-24h';
import { dailyPrevValueFromChangePct, fonUnitNativeTry } from '@/lib/fon-price-guards';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';
import { useTranslation } from 'react-i18next';

const BG = '#000000';
const PRIMARY = Brand.primary;
const ON_PRIMARY = Brand.onPrimary;
const SURFACE_CONTAINER = '#191919';
const SURFACE_CONTAINER_HIGH = '#1f1f1f';
const ON_SURFACE = '#ffffff';
const ON_SURFACE_VARIANT = '#ababab';
const SECONDARY = Brand.chartPositive;
const ERROR = '#ff716c';
const OUTLINE_VARIANT = '#484848';
const MUTED_PCT = 'rgba(255,255,255,0.45)';

const CATEGORY_ORDER = ['yurtdisi', 'bist', 'doviz', 'emtia', 'fon', 'kripto', 'mevduat'] as const;

/** Tutarlar: kuruş yok, yukarı yuvarlı tam TL/USD. */
function formatPortfolioMoneyCeil(value: number, locale: string): string {
  if (!Number.isFinite(value)) return (0).toLocaleString(locale, { maximumFractionDigits: 0 });
  return Math.ceil(value).toLocaleString(locale, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

/**
 * Sıralama için günlük %: önce change_24h_pct; yoksa (FON vb.) liste satırıyla aynı şekilde maliyetten türetilir.
 * Eski mantıkta null hep -Infinity/Infinity sayılırdı → tüm çiftler eşit, sıra değişmezdi.
 */
function effectiveDailyPctForSort(h: HoldingRow, asset: AssetRow, usdTry: number, now: Date): number {
  const rawSpot =
    asset.category_id === 'fon'
      ? fonUnitNativeTry(asset.current_price, h.avg_price)
      : Number(asset.current_price ?? h.avg_price ?? 0);
  const currentPrice =
    asset.category_id === 'kripto' ? kriptoStoredUnitToUsd(rawSpot, usdTry, asset.currency) : rawSpot;
  const chgEff = effectiveChange24hPctForDisplay(
    asset.category_id,
    asset.change_24h_pct,
    asset.price_updated_at,
    now,
  );
  if (chgEff != null && Number.isFinite(chgEff) && Math.abs(1 + chgEff / 100) > 1e-9) return chgEff;

  const costRaw = h.avg_price != null ? Number(h.avg_price) : null;
  const costPrice =
    costRaw != null && asset.category_id === 'kripto'
      ? legacyCryptoStoredUnitToUsd(costRaw, usdTry, currentPrice)
      : costRaw;
  if (costPrice != null && costPrice > 0 && Number.isFinite(currentPrice) && currentPrice > 0) {
    return ((currentPrice - costPrice) / costPrice) * 100;
  }
  return 0;
}

const ASSET_ICONS: Record<string, { icon: string; bg: string; color: string }> = {
  default: { icon: 'ellipse-outline', bg: 'rgba(148,163,184,0.2)', color: '#94A3B8' },
  BTC: { icon: 'cash', bg: 'rgba(249,115,22,0.2)', color: '#f97316' },
  ETH: { icon: 'analytics', bg: 'rgba(59,130,246,0.2)', color: '#3b82f6' },
  SOL: { icon: 'flash', bg: 'rgba(168,85,247,0.2)', color: '#a855f7' },
  ADA: { icon: 'diamond-outline', bg: 'rgba(99,102,241,0.2)', color: '#6366f1' },
  XRP: { icon: 'flash-outline', bg: 'rgba(34,197,94,0.2)', color: '#22c55e' },
  DOT: { icon: 'ellipse-outline', bg: 'rgba(234,88,12,0.2)', color: '#ea580c' },
  XAU: { icon: 'cube', bg: 'rgba(250,204,21,0.4)', color: '#facc15' },
  XAG: { icon: 'cube', bg: 'rgba(148,163,184,0.4)', color: '#e5e7eb' },
  XPT: { icon: 'cube', bg: 'rgba(156,163,175,0.4)', color: '#d1d5db' },
  XPD: { icon: 'cube', bg: 'rgba(129,140,248,0.4)', color: '#a5b4fc' },
  XAUT: { icon: 'cube', bg: 'rgba(250,204,21,0.45)', color: '#facc15' },
  PAXG: { icon: 'cube', bg: 'rgba(234,179,8,0.4)', color: '#fbbf24' },
  emtia: { icon: 'cube-outline', bg: 'rgba(250,204,21,0.28)', color: '#facc15' },
  bist: { icon: 'stats-chart', bg: 'rgba(137,172,255,0.28)', color: Brand.primary },
  mevduat: { icon: 'wallet-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  VADESIZ: { icon: 'wallet-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  VADELI: { icon: 'time-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  BES: { icon: 'shield-checkmark-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  KASA: { icon: 'lock-closed-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
  DIGER: { icon: 'ellipsis-horizontal-circle-outline', bg: 'rgba(255,215,0,0.25)', color: '#FFD700' },
};

type SortMode = 'todayTopGainers' | 'todayTopLosers' | 'highestValue' | 'lowestValue' | 'alphaAZ' | 'alphaZA';

/** Portföy tutarları: kuruş yok, yukarı yuvarlanmış tam birim. */
function formatAmountCeiling(value: number, locale: string): string {
  const n = Number.isFinite(value) ? Math.ceil(value) : 0;
  return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function PortfolioScreen() {
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'tr-TR';
  const sortCollator = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'tr';

  const [fontsLoaded] = useFonts({
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const fontHead800 = fontsLoaded ? 'Manrope_800ExtraBold' : undefined;
  const fontHead700 = fontsLoaded ? 'Manrope_700Bold' : undefined;
  const fontBody = fontsLoaded ? 'Inter_500Medium' : undefined;
  const fontBodySemi = fontsLoaded ? 'Inter_600SemiBold' : undefined;

  const { width: windowWidth } = useWindowDimensions();

  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const router = useRouter();
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
  const minuteTick = useMinuteTick();
  const [portfolioPickerOpen, setPortfolioPickerOpen] = useState(false);
  const {
    filter,
    selectAllCategories,
    toggleCategoryPill,
    isAllCategories,
    isCategoryPillSelected,
  } = useSelectedCategories();

  useEffect(() => {
    // Home'dan grafik/çip üzerinden kategori set edilip ardından portföy ekranına girildiğinde
    // (ör. emtia) bu seçim "tümü"ye çekilmesin.
    if (filter.kind === 'all') selectAllCategories();
  }, [portfolioId, selectAllCategories, filter.kind]);

  const [sortMode, setSortMode] = useState<SortMode>('todayTopGainers');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [summaryMode, setSummaryMode] = useState<'daily' | 'total'>('daily');
  const [summaryDisplayCurrency, setSummaryDisplayCurrency] = useState<'TL' | 'USD'>('TL');

  const orderedCategories = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    for (const id of CATEGORY_ORDER) {
      const c = categories.find((x) => x.id === id);
      if (c) list.push(c);
    }
    return list;
  }, [categories]);

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

  const filteredHoldings = useMemo(() => {
    const base =
      filter.kind === 'all'
        ? holdings
        : holdings.filter((h) => {
            const asset = normalizeAsset(h.asset);
            return asset ? filter.ids.has(asset.category_id) : false;
          });

    const sorted = [...base];
    const now = new Date();

    sorted.sort((a, b) => {
      const assetA = normalizeAsset(a.asset);
      const assetB = normalizeAsset(b.asset);

      const rawA = Number((assetA?.current_price ?? a.avg_price ?? 0) || 0);
      const rawB = Number((assetB?.current_price ?? b.avg_price ?? 0) || 0);
      const unitA =
        assetA?.category_id === 'kripto'
          ? kriptoStoredUnitToUsd(rawA, usdTry, assetA.currency)
          : assetA?.category_id === 'fon'
            ? fonUnitNativeTry(assetA.current_price, a.avg_price)
            : rawA;
      const unitB =
        assetB?.category_id === 'kripto'
          ? kriptoStoredUnitToUsd(rawB, usdTry, assetB.currency)
          : assetB?.category_id === 'fon'
            ? fonUnitNativeTry(assetB.current_price, b.avg_price)
            : rawB;
      const nativeA = a.quantity * unitA;
      const nativeB = b.quantity * unitB;
      const rate = usdTry > 0 ? usdTry : 1;
      const valueA = isUsdNativeCategory(assetA?.category_id) ? nativeA * rate : nativeA;
      const valueB = isUsdNativeCategory(assetB?.category_id) ? nativeB * rate : nativeB;

      switch (sortMode) {
        case 'todayTopGainers': {
          const ca = assetA ? effectiveDailyPctForSort(a, assetA, usdTry, now) : Number.NEGATIVE_INFINITY;
          const cb = assetB ? effectiveDailyPctForSort(b, assetB, usdTry, now) : Number.NEGATIVE_INFINITY;
          return cb - ca;
        }
        case 'todayTopLosers': {
          const ca = assetA ? effectiveDailyPctForSort(a, assetA, usdTry, now) : Number.POSITIVE_INFINITY;
          const cb = assetB ? effectiveDailyPctForSort(b, assetB, usdTry, now) : Number.POSITIVE_INFINITY;
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
  }, [holdings, filter, sortMode, sortCollator, usdTry, minuteTick]);

  const summaryData = useMemo(() => {
    const now = new Date();
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
      const rawSpot = Number(asset.current_price ?? h.avg_price ?? 0);
      const spotUsd =
        asset.category_id === 'kripto'
          ? kriptoStoredUnitToUsd(rawSpot, usdTry, asset.currency)
          : asset.category_id === 'fon'
            ? fonUnitNativeTry(asset.current_price, h.avg_price)
            : rawSpot;
      const value = h.quantity * (Number(spotUsd) || 0);
      const effChg = effectiveChange24hPctForDisplay(
        asset.category_id,
        asset.change_24h_pct,
        asset.price_updated_at,
        now,
      );
      const { prevValue, dailyDelta: daily } = dailyPrevValueFromChangePct(value, effChg);
      const costRaw = h.avg_price != null ? Number(h.avg_price) : null;
      const unitCost =
        costRaw != null && asset.category_id === 'kripto'
          ? legacyCryptoStoredUnitToUsd(costRaw, usdTry, spotUsd)
          : costRaw;
      const cost =
        unitCost != null ? h.quantity * (Number(unitCost) || 0) : prevValue;
      const isUSD = isUsdNativeCategory(asset.category_id);
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

    const rate = usdTry > 0 ? usdTry : 1;
    const mergedTotalTL = totalTL + totalUSD * rate;
    const mergedTotalUSD = totalUSD + totalTL / rate;
    const mergedDailyAmtTL = dailyAmtTL + dailyAmtUSD * rate;
    const mergedDailyAmtUSD = dailyAmtUSD + dailyAmtTL / rate;
    const mergedDailyPctTL =
      mergedTotalTL - mergedDailyAmtTL > 0
        ? (mergedDailyAmtTL / (mergedTotalTL - mergedDailyAmtTL)) * 100
        : 0;
    const mergedDailyPctUSD =
      mergedTotalUSD - mergedDailyAmtUSD > 0
        ? (mergedDailyAmtUSD / (mergedTotalUSD - mergedDailyAmtUSD)) * 100
        : 0;
    const mergedCostTL = costTL + costUSD * rate;
    const mergedCostUSD = costUSD + costTL / rate;
    const mergedTotalAmtTL = totalAmtTL + totalAmtUSD * rate;
    const mergedTotalAmtUSD = totalAmtUSD + totalAmtTL / rate;
    const mergedTotalPctTL = mergedCostTL > 0 ? (mergedTotalAmtTL / mergedCostTL) * 100 : 0;
    const mergedTotalPctUSD = mergedCostUSD > 0 ? (mergedTotalAmtUSD / mergedCostUSD) * 100 : 0;

    return {
      totalUSD,
      totalTL,
      hasUSD,
      hasTL,
      dailyAmtUSD,
      dailyAmtTL,
      dailyPctUSD,
      dailyPctTL,
      totalAmtUSD,
      totalAmtTL,
      totalPctUSD,
      totalPctTL,
      mergedTotalTL,
      mergedTotalUSD,
      mergedDailyAmtTL,
      mergedDailyAmtUSD,
      mergedDailyPctTL,
      mergedDailyPctUSD,
      mergedTotalPctTL,
      mergedTotalPctUSD,
    };
  }, [filteredHoldings, usdTry, minuteTick]);

  const openPortfolioPicker = () => {
    if (portfolios.length > 0) setPortfolioPickerOpen(true);
  };

  return (
    <View style={styles.root}>
      <View style={styles.glowOrb} pointerEvents="none" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.headerTitleBtn}
            onPress={openPortfolioPicker}
            disabled={portfolios.length === 0}
            accessibilityRole="button"
            accessibilityLabel={t('portfolio.pickPortfolio')}>
            <Text style={[styles.headerPortfolioTitle, { fontFamily: fontHead800 }]} numberOfLines={2}>
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
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled>
          {error ? (
            <View style={styles.errorWrap}>
              <Text style={[styles.errorText, { fontFamily: fontBody }]}>{error}</Text>
            </View>
          ) : null}
          {loading && !holdings.length ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={PRIMARY} />
              <Text style={[styles.loadingText, { fontFamily: fontBody }]}>{t('portfolio.loading')}</Text>
            </View>
          ) : null}

          {(summaryData.hasUSD || summaryData.hasTL) && (() => {
            const isDaily = summaryMode === 'daily';
            const mainTotal =
              summaryDisplayCurrency === 'TL' ? summaryData.mergedTotalTL : summaryData.mergedTotalUSD;
            const changePct = isDaily
              ? summaryDisplayCurrency === 'TL'
                ? summaryData.mergedDailyPctTL
                : summaryData.mergedDailyPctUSD
              : summaryDisplayCurrency === 'TL'
                ? summaryData.mergedTotalPctTL
                : summaryData.mergedTotalPctUSD;
            const pctPositive = changePct >= 0;
            const pctStr = `${pctPositive ? '+' : ''}${changePct.toLocaleString(numberLocale, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}%`;
            const amountStr =
              summaryDisplayCurrency === 'USD'
                ? formatPortfolioMoneyCeil(mainTotal, 'en-US')
                : formatPortfolioMoneyCeil(mainTotal, numberLocale);
            const suffix = summaryDisplayCurrency === 'USD' ? ' USD' : ` ${t('home.currencyTL')}`;
            return (
              <View style={styles.hero}>
                <Text style={[styles.heroKicker, { fontFamily: fontBodySemi }]}>{t('portfolio.totalBalance')}</Text>
                <View style={styles.heroAmountRow}>
                  <Text style={[styles.heroAmount, { fontFamily: fontHead800 }]} numberOfLines={1} adjustsFontSizeToFit>
                    {amountStr}
                  </Text>
                  <Text style={[styles.heroSuffix, { fontFamily: fontHead700 }]}>{suffix}</Text>
                </View>
                <View style={styles.heroPctRow}>
                  <Ionicons
                    name={pctPositive ? 'caret-up' : 'caret-down'}
                    size={18}
                    color={pctPositive ? SECONDARY : ERROR}
                  />
                  <Text
                    style={[
                      styles.heroPct,
                      { fontFamily: fontHead700 },
                      pctPositive ? styles.pctUp : styles.pctDown,
                    ]}>
                    {pctStr}
                  </Text>
                </View>
                <View style={styles.heroPillsRow}>
                  <View style={[styles.currencyPill, styles.heroPillNoTop]}>
                    <Pressable
                      onPress={() => setSummaryMode('daily')}
                      style={[styles.currencyPillBtn, summaryMode === 'daily' && styles.currencyPillBtnOn]}>
                      <Text
                        style={[
                          styles.currencyPillText,
                          { fontFamily: fontBodySemi },
                          summaryMode === 'daily' && styles.currencyPillTextOn,
                        ]}>
                        {t('portfolio.daily')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSummaryMode('total')}
                      style={[styles.currencyPillBtn, summaryMode === 'total' && styles.currencyPillBtnOn]}>
                      <Text
                        style={[
                          styles.currencyPillText,
                          { fontFamily: fontBodySemi },
                          summaryMode === 'total' && styles.currencyPillTextOn,
                        ]}>
                        {t('portfolio.scopeAll')}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={[styles.currencyPill, styles.heroPillNoTop]}>
                    <Pressable
                      onPress={() => setSummaryDisplayCurrency('TL')}
                      style={[
                        styles.currencyPillBtn,
                        summaryDisplayCurrency === 'TL' && styles.currencyPillBtnOn,
                      ]}>
                      <Text
                        style={[
                          styles.currencyPillText,
                          { fontFamily: fontBodySemi },
                          summaryDisplayCurrency === 'TL' && styles.currencyPillTextOn,
                        ]}>
                        {t('home.currencyTL')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSummaryDisplayCurrency('USD')}
                      style={[
                        styles.currencyPillBtn,
                        summaryDisplayCurrency === 'USD' && styles.currencyPillBtnOn,
                      ]}>
                      <Text
                        style={[
                          styles.currencyPillText,
                          { fontFamily: fontBodySemi },
                          summaryDisplayCurrency === 'USD' && styles.currencyPillTextOn,
                        ]}>
                        {t('home.currencyUSD')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })()}

          <ScrollView
            horizontal
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.pillsScroll}
            style={[styles.pillsScrollView, { width: windowWidth }]}>
            <TouchableOpacity
              onPress={selectAllCategories}
              activeOpacity={0.85}
              style={[styles.categoryPill, styles.categoryPillGap, isAllCategories && styles.categoryPillActive]}>
              <Text
                style={[
                  styles.categoryPillText,
                  { fontFamily: fontBodySemi },
                  isAllCategories && styles.categoryPillTextActive,
                ]}>
                {t('portfolio.allAssets')}
              </Text>
            </TouchableOpacity>
            {orderedCategories.map((c) => {
              const isActive = isCategoryPillSelected(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => toggleCategoryPill(c.id)}
                  activeOpacity={0.85}
                  style={[styles.categoryPill, styles.categoryPillGap, isActive && styles.categoryPillActive]}>
                  <Text
                    style={[
                      styles.categoryPillText,
                      { fontFamily: fontBodySemi },
                      isActive && styles.categoryPillTextActive,
                    ]}>
                    {categoryDisplayLabel(c.id, c.name, t)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.sortRow}>
            <View style={styles.sortWrap}>
              <TouchableOpacity
                style={styles.sortBtn}
                onPress={() => setIsSortMenuOpen((o) => !o)}
                activeOpacity={0.85}>
                <Text style={[styles.sortBtnText, { fontFamily: fontBodySemi }]} numberOfLines={1}>
                  {sortLabel}
                </Text>
                <Ionicons
                  name={isSortMenuOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={ON_SURFACE}
                />
              </TouchableOpacity>
              {isSortMenuOpen ? (
                <View style={styles.sortMenu}>
                  {sortOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={styles.sortMenuItem}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSortMode(opt.id);
                        setIsSortMenuOpen(false);
                      }}>
                      <Text
                        style={[
                          styles.sortMenuItemText,
                          { fontFamily: fontBody },
                          opt.id === sortMode && styles.sortMenuItemTextActive,
                        ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.assetList}>
            {filteredHoldings.length === 0 && !loading ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="search" size={28} color={BG} />
                </View>
                <Text style={[styles.emptyText, { fontFamily: fontBody }]}>{t('portfolio.emptyHoldings')}</Text>
              </View>
            ) : (
              filteredHoldings.map((h) => {
                const asset = normalizeAsset(h.asset);
                if (!asset) return null;
                const rawSpot = Number(asset.current_price ?? h.avg_price ?? 0);
                const currentPrice =
                  asset.category_id === 'kripto'
                    ? kriptoStoredUnitToUsd(rawSpot, usdTry, asset.currency)
                    : asset.category_id === 'fon'
                      ? fonUnitNativeTry(asset.current_price, h.avg_price)
                      : rawSpot;
                const hasLivePrice = Number.isFinite(currentPrice) && currentPrice > 0;
                const value = h.quantity * currentPrice;
                const changePct =
                  effectiveChange24hPctForDisplay(
                    asset.category_id,
                    asset.change_24h_pct,
                    asset.price_updated_at,
                    new Date(),
                  ) ?? null;
                const valueCurrency = isUsdNativeCategory(asset.category_id) ? 'USD' : 'TL';
                const iconStyle =
                  ASSET_ICONS[asset.symbol] ??
                  ASSET_ICONS[asset.category_id] ??
                  ASSET_ICONS.default;
                const assetDisplayName =
                  asset.category_id === 'bist'
                    ? resolveBistDisplayName(asset.symbol, asset.name)
                    : asset.name;
                return (
                  <Pressable
                    key={h.id}
                    style={({ pressed }) => [styles.assetRow, pressed && styles.assetRowPressed]}
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/asset-entry',
                        params: {
                          returnTo: '/portfolio',
                          
                          holdingId: h.id,
                          assetId: asset.id,
                          name: assetDisplayName,
                          symbol: asset.symbol,
                          categoryId: asset.category_id,
                          price:
                            asset.current_price != null
                              ? String(asset.current_price)
                              : h.avg_price != null
                                ? String(h.avg_price)
                                : '',
                          quantity: String(h.quantity),
                          avgPrice: h.avg_price != null ? String(h.avg_price) : '',
                          spotCurrency: asset.currency ?? '',
                        },
                      })
                    }>
                    <View style={styles.assetLeft}>
                      <View style={styles.assetIconCircle}>
                        {asset.category_id === 'doviz' && asset.icon_url ? (
                          <Image
                            source={{ uri: asset.icon_url }}
                            style={styles.assetIconImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <Ionicons name={iconStyle.icon as keyof typeof Ionicons.glyphMap} size={22} color={PRIMARY} />
                        )}
                      </View>
                      <View style={styles.assetTextCol}>
                        <Text style={[styles.assetSymbol, { fontFamily: fontHead700 }]} numberOfLines={1}>
                          {asset.symbol}
                        </Text>
                        <Text style={[styles.assetSubtitle, { fontFamily: fontBody }]} numberOfLines={1}>
                          {assetDisplayName}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.assetRight}>
                      <Text style={[styles.assetValue, { fontFamily: fontHead700 }]}>
                        {hasLivePrice
                          ? `${formatPortfolioMoneyCeil(
                              value,
                              valueCurrency === 'USD' ? 'en-US' : numberLocale,
                            )} ${valueCurrency}`
                          : 'Fiyat güncelleniyor...'}
                      </Text>
                      {(() => {
                        const costRaw = h.avg_price != null ? Number(h.avg_price) : null;
                        const costPrice =
                          costRaw != null && asset.category_id === 'kripto'
                            ? legacyCryptoStoredUnitToUsd(costRaw, usdTry, currentPrice)
                            : costRaw;
                        const totalPctFromCost =
                          costPrice != null && costPrice > 0
                            ? ((currentPrice - costPrice) / costPrice) * 100
                            : null;
                        const dailyPct = changePct ?? totalPctFromCost ?? 0;
                        const totalPct =
                          costPrice != null && costPrice > 0
                            ? ((currentPrice - costPrice) / costPrice) * 100
                            : dailyPct;
                        const displayPct = summaryMode === 'daily' ? dailyPct : totalPct;
                        const isNeutral = Math.abs(displayPct) < 0.005;
                        const up = displayPct > 0;
                        return (
                          <View style={styles.assetPctRow}>
                            {!isNeutral ? (
                              <Ionicons
                                name={up ? 'caret-up' : 'caret-down'}
                                size={14}
                                color={up ? SECONDARY : ERROR}
                              />
                            ) : null}
                            <Text
                              style={[
                                styles.assetPct,
                                { fontFamily: fontBodySemi },
                                isNeutral ? styles.assetPctNeutral : up ? styles.assetPctUp : styles.assetPctDown,
                              ]}>
                              {isNeutral
                                ? `${displayPct.toLocaleString(numberLocale, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}%`
                                : `${up ? '+' : ''}${displayPct.toLocaleString(numberLocale, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}%`}
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

export default function TabsIndexRedirect() {
  return <Redirect href="/home" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, overflow: 'hidden' },
  glowOrb: {
    position: 'absolute',
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: 'rgba(137,172,255,0.07)',
    top: '38%',
    left: '50%',
    marginLeft: -220,
    marginTop: -220,
    zIndex: 0,
  },
  safe: { flex: 1, backgroundColor: BG, zIndex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
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
  scrollContent: { paddingHorizontal: 24, paddingBottom: 32 },
  errorWrap: {
    padding: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,113,108,0.12)',
    borderRadius: 16,
  },
  errorText: { color: ERROR, fontSize: 14 },
  loadingWrap: { padding: 32, alignItems: 'center', gap: 12 },
  loadingText: { color: ON_SURFACE_VARIANT, fontSize: 14 },
  hero: { marginBottom: 28, alignItems: 'center' },
  heroKicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    color: ON_SURFACE_VARIANT,
    textTransform: 'uppercase',
    marginBottom: 8,
    alignSelf: 'center',
  },
  heroAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: ON_SURFACE,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'] as any,
  },
  heroSuffix: { fontSize: 20, fontWeight: '700', color: ON_SURFACE, opacity: 0.72 },
  heroPctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    justifyContent: 'center',
  },
  heroPct: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] as any },
  pctUp: { color: SECONDARY },
  pctDown: { color: ERROR },
  heroPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 22,
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: 8,
  },
  heroPillNoTop: { marginTop: 0 },
  currencyPill: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 999,
    backgroundColor: SURFACE_CONTAINER,
    alignSelf: 'center',
  },
  currencyPillBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  currencyPillBtnOn: { backgroundColor: PRIMARY },
  currencyPillText: { fontSize: 12, fontWeight: '700', color: ON_SURFACE_VARIANT },
  currencyPillTextOn: { color: ON_PRIMARY },
  pillsScrollView: {
    marginHorizontal: -24,
    marginBottom: 20,
    flexGrow: 0,
    minHeight: 44,
  },
  pillsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 0,
    paddingHorizontal: 24,
    paddingVertical: 2,
    paddingRight: 32,
  },
  categoryPillGap: { marginRight: 8 },
  categoryPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: SURFACE_CONTAINER_HIGH,
  },
  categoryPillActive: { backgroundColor: PRIMARY },
  categoryPillText: { fontSize: 12, fontWeight: '600', color: ON_SURFACE_VARIANT },
  categoryPillTextActive: { color: ON_PRIMARY },
  sortRow: { alignItems: 'flex-end', marginBottom: 16, zIndex: 20 },
  sortWrap: { position: 'relative', alignSelf: 'flex-end', minWidth: '55%' },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: SURFACE_CONTAINER,
    borderWidth: 1,
    borderColor: 'rgba(72,72,72,0.35)',
  },
  sortBtnText: { fontSize: 12, fontWeight: '700', color: ON_SURFACE, flexShrink: 1 },
  sortMenu: {
    position: 'absolute',
    top: 46,
    right: 0,
    left: 0,
    backgroundColor: SURFACE_CONTAINER_HIGH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: OUTLINE_VARIANT,
    overflow: 'hidden',
    elevation: 8,
  },
  sortMenuItem: { paddingHorizontal: 14, paddingVertical: 12 },
  sortMenuItemText: { fontSize: 13, color: ON_SURFACE_VARIANT },
  sortMenuItemTextActive: { fontWeight: '700', color: ON_SURFACE },
  assetList: { gap: 0 },
  emptyWrap: { padding: 24, alignItems: 'center', gap: 14 },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: ON_SURFACE_VARIANT, fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  assetRowPressed: { backgroundColor: 'rgba(19,19,19,0.5)' },
  assetLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 16 },
  assetIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SURFACE_CONTAINER,
    borderWidth: 1,
    borderColor: 'rgba(72,72,72,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetIconImage: { width: 30, height: 30, borderRadius: 15 },
  assetTextCol: { flex: 1, minWidth: 0 },
  assetSymbol: { fontSize: 18, fontWeight: '700', color: ON_SURFACE },
  assetSubtitle: { fontSize: 12, color: ON_SURFACE_VARIANT, marginTop: 2, fontWeight: '500' },
  assetRight: { flexShrink: 0, alignItems: 'flex-end' },
  assetValue: {
    fontSize: 16,
    fontWeight: '700',
    color: ON_SURFACE,
    fontVariant: ['tabular-nums'] as any,
    textAlign: 'right',
  },
  assetPctRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: 4 },
  assetPct: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] as any },
  assetPctUp: { color: SECONDARY },
  assetPctDown: { color: ERROR },
  assetPctNeutral: { color: MUTED_PCT },
  bottomSpacer: { height: 120 },
});
