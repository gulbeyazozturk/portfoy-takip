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
import { TabScreenRoot } from '@/components/tab-screen-root';
import { useSelectedCategories } from '@/context/selected-categories';
import {
  normalizeAsset,
  usePortfolioCoreData,
  type AssetRow,
  type HoldingRow,
} from '@/hooks/use-portfolio-core-data';
import { useMinuteTick } from '@/hooks/use-minute-tick';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { kriptoStoredUnitToUsd, legacyCryptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import { assetAvatarBg } from '@/lib/asset-avatar';
import { resolveBistDisplayName } from '@/lib/bist-display-name';
import { Brand } from '@/constants/brand';
import { categoryDisplayLabel } from '@/lib/category-display';
import { effectiveChange24hPctForDisplay } from '@/lib/effective-change-24h';
import { dailyPrevValueFromChangePct, fonUnitNativeTry } from '@/lib/fon-price-guards';
import { isHoldingMarketPriceReady } from '@/lib/portfolio-holdings';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';
import {
  formatDisplayMoney,
  formatDisplayMoneyCeil,
  formatDisplayPlLine,
  type DisplayCurrency,
} from '@/lib/display-currency';
import { MIN_VALID_USD_TRY_RATE } from '@/lib/usdtry-cache';
import { useTranslation } from 'react-i18next';

const BG = '#000000';
const PRIMARY = Brand.primary;
const ON_PRIMARY = Brand.onPrimary;
const SURFACE_CONTAINER = '#191919';
const SURFACE_CONTAINER_HIGH = '#1f1f1f';
const ON_SURFACE = '#ffffff';
const ON_SURFACE_VARIANT = '#ababab';
const SECONDARY = Brand.chartPositive;
const ERROR = Brand.chartNegative;
const OUTLINE_VARIANT = '#484848';
const MUTED_PCT = 'rgba(255,255,255,0.45)';

const CATEGORY_ORDER = ['yurtdisi', 'bist', 'doviz', 'emtia', 'fon', 'kripto', 'mevduat'] as const;

/** Tutarlar: kuruş yok, yukarı yuvarlı tam TL/USD. */
function formatPortfolioMoneyCeil(value: number, currency: DisplayCurrency, locale: string): string {
  return formatDisplayMoneyCeil(value, currency, locale);
}

/**
 * Sıralama için günlük %: önce change_24h_pct; yoksa (FON vb.) liste satırıyla aynı şekilde maliyetten türetilir.
 * Ürün kararı: Günlükte yalnızca gerçek günlük veri kullanılır; yoksa 0 kabul edilir.
 */
function effectiveDailyPctForSort(h: HoldingRow, asset: AssetRow, usdTry: number, now: Date): number {
  const chgEff = effectiveChange24hPctForDisplay(
    asset.category_id,
    asset.change_24h_pct,
    asset.price_updated_at,
    now,
  );
  return chgEff != null && Number.isFinite(chgEff) ? chgEff : 0;
}

type SortMode = 'todayTopGainers' | 'todayTopLosers' | 'highestValue' | 'lowestValue' | 'alphaAZ' | 'alphaZA';

type PortfolioSummaryData = {
  totalUSD: number;
  totalTL: number;
  hasUSD: boolean;
  hasTL: boolean;
  dailyAmtUSD: number;
  dailyAmtTL: number;
  dailyPctUSD: number;
  dailyPctTL: number;
  totalAmtUSD: number;
  totalAmtTL: number;
  totalPctUSD: number;
  totalPctTL: number;
  mergedTotalTL: number;
  mergedTotalUSD: number;
  mergedDailyAmtTL: number;
  mergedDailyAmtUSD: number;
  mergedDailyPctTL: number;
  mergedDailyPctUSD: number;
  mergedTotalAmtTL: number;
  mergedTotalAmtUSD: number;
  mergedTotalPctTL: number;
  mergedTotalPctUSD: number;
};

/** Liste satırı: birim fiyat / tutar (2 ondalık). */
function formatRowMoney(value: number, currency: DisplayCurrency, locale: string): string {
  return formatDisplayMoney(value, currency, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** P/L satırı */
function formatRowPlLine(
  amount: number,
  pct: number,
  currency: DisplayCurrency,
  locale: string,
): { text: string; neutral: boolean; up: boolean } {
  return formatDisplayPlLine(amount, pct, currency, locale);
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
  const layout = useScreenLayout();

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

  useEffect(() => {
    lastSummaryRef.current = { portfolioId: portfolioId ?? null, cacheKey: '', data: null };
  }, [portfolioId]);

  const [sortMode, setSortMode] = useState<SortMode>('todayTopGainers');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [summaryMode, setSummaryMode] = useState<'daily' | 'total'>('daily');
  const [summaryDisplayCurrency, setSummaryDisplayCurrency] = useState<'TL' | 'USD'>('TL');

  const lastSummaryRef = useRef<{
    portfolioId: string | null;
    cacheKey: string;
    data: PortfolioSummaryData | null;
  }>({ portfolioId: null, cacheKey: '', data: null });

  const summaryCacheKey = useMemo(() => {
    if (filter.kind === 'all') return 'all';
    return [...filter.ids].sort().join(',');
  }, [filter]);

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
      const rate = usdTry > MIN_VALID_USD_TRY_RATE ? usdTry : 1;
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

  const summaryData = useMemo((): PortfolioSummaryData | null => {
    const filteredNeedsFx = filteredHoldings.some((h) => {
      const asset = normalizeAsset(h.asset);
      return asset != null && isUsdNativeCategory(asset.category_id);
    });
    const fxOk = !filteredNeedsFx || usdTry > MIN_VALID_USD_TRY_RATE;
    if (!fxOk) {
      const cached = lastSummaryRef.current;
      if (
        cached.portfolioId === portfolioId &&
        cached.cacheKey === summaryCacheKey &&
        cached.data
      ) {
        return cached.data;
      }
      return null;
    }

    const rateForReady = usdTry > MIN_VALID_USD_TRY_RATE ? usdTry : 1;

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

    const rate = usdTry > MIN_VALID_USD_TRY_RATE ? usdTry : 1;
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

    const live: PortfolioSummaryData = {
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
      mergedTotalAmtTL,
      mergedTotalAmtUSD,
      mergedTotalPctTL,
      mergedTotalPctUSD,
    };

    const valuationOk = filteredHoldings.every((h) => isHoldingMarketPriceReady(h, rateForReady));
    const canCommit =
      valuationOk && (filteredHoldings.length === 0 || mergedTotalTL > 0);
    if (canCommit) {
      lastSummaryRef.current = {
        portfolioId: portfolioId ?? null,
        cacheKey: summaryCacheKey,
        data: live,
      };
      return live;
    }

    const cached = lastSummaryRef.current;
    if (
      cached.portfolioId === portfolioId &&
      cached.cacheKey === summaryCacheKey &&
      cached.data
    ) {
      return cached.data;
    }
    return live;
  }, [filteredHoldings, usdTry, minuteTick, portfolioId, summaryCacheKey]);

  const openPortfolioPicker = () => {
    if (portfolios.length > 0) setPortfolioPickerOpen(true);
  };

  return (
    <TabScreenRoot style={styles.root}>
      <View style={styles.glowOrb} pointerEvents="none" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.header, { paddingVertical: layout.headerPaddingVertical }]}>
          <Pressable
            style={styles.headerTitleBtn}
            onPress={openPortfolioPicker}
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

          {summaryData && (summaryData.hasUSD || summaryData.hasTL) ? (
            (() => {
            const isDaily = summaryMode === 'daily';
            const mainTotal =
              summaryDisplayCurrency === 'TL' ? summaryData.mergedTotalTL : summaryData.mergedTotalUSD;
            const changeAmt = isDaily
              ? summaryDisplayCurrency === 'TL'
                ? summaryData.mergedDailyAmtTL
                : summaryData.mergedDailyAmtUSD
              : summaryDisplayCurrency === 'TL'
                ? summaryData.mergedTotalAmtTL
                : summaryData.mergedTotalAmtUSD;
            const changePct = isDaily
              ? summaryDisplayCurrency === 'TL'
                ? summaryData.mergedDailyPctTL
                : summaryData.mergedDailyPctUSD
              : summaryDisplayCurrency === 'TL'
                ? summaryData.mergedTotalPctTL
                : summaryData.mergedTotalPctUSD;
            const plLine = formatRowPlLine(changeAmt, changePct, summaryDisplayCurrency, numberLocale);
            const amountStr = formatPortfolioMoneyCeil(mainTotal, summaryDisplayCurrency, numberLocale);
            return (
              <View style={[styles.hero, { marginBottom: layout.heroMarginBottomPortfolio }]}>
                <Text style={[styles.heroKicker, { fontFamily: fontBodySemi }]}>{t('portfolio.totalBalance')}</Text>
                <View style={styles.heroAmountRow}>
                  <Text
                    style={[
                      styles.heroAmount,
                      { fontFamily: fontHead800, fontSize: layout.heroAmountFontSize },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    {amountStr}
                  </Text>
                </View>
                <View style={styles.heroPctRow}>
                  <Text
                    style={[
                      styles.heroPct,
                      { fontFamily: fontHead700, fontSize: layout.heroPctFontSize },
                      plLine.neutral ? styles.pctNeutral : plLine.up ? styles.pctUp : styles.pctDown,
                    ]}>
                    {plLine.text}
                  </Text>
                </View>
                <View
                  style={[
                    styles.heroPillsRow,
                    { marginTop: layout.isCompact ? 14 : 22 },
                  ]}>
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
          })()
          ) : null}

          <ScrollView
            horizontal
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.pillsScroll}
            style={[
              styles.pillsScrollView,
              { width: windowWidth, marginBottom: layout.pillsMarginBottom },
            ]}>
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
                const rate = usdTry > MIN_VALID_USD_TRY_RATE ? usdTry : 1;
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
                const nativeCurrency = isUsdNativeCategory(asset.category_id) ? 'USD' : 'TL';
                const displayCurrency = summaryDisplayCurrency;
                const displayLocale = numberLocale;
                const displayedUnitPrice =
                  nativeCurrency === displayCurrency
                    ? currentPrice
                    : nativeCurrency === 'USD'
                      ? currentPrice * rate
                      : currentPrice / rate;
                const displayedValue =
                  nativeCurrency === displayCurrency
                    ? value
                    : nativeCurrency === 'USD'
                      ? value * rate
                      : value / rate;
                const costRaw = h.avg_price != null ? Number(h.avg_price) : null;
                const costPrice =
                  costRaw != null && asset.category_id === 'kripto'
                    ? legacyCryptoStoredUnitToUsd(costRaw, usdTry, currentPrice)
                    : costRaw;
                const dailyPct = changePct ?? 0;
                const totalPct =
                  costPrice != null && costPrice > 0
                    ? ((currentPrice - costPrice) / costPrice) * 100
                    : dailyPct;
                const displayPct = summaryMode === 'daily' ? dailyPct : totalPct;
                const changeAmtNative =
                  summaryMode === 'daily'
                    ? dailyPrevValueFromChangePct(value, changePct).dailyDelta
                    : costPrice != null
                      ? value - h.quantity * costPrice
                      : 0;
                const displayedChangeAmt =
                  nativeCurrency === displayCurrency
                    ? changeAmtNative
                    : nativeCurrency === 'USD'
                      ? changeAmtNative * rate
                      : changeAmtNative / rate;
                const avatarBg = assetAvatarBg(asset.symbol, asset.category_id);
                const plLine = formatRowPlLine(displayedChangeAmt, displayPct, displayCurrency, displayLocale);
                const assetDisplayName =
                  asset.category_id === 'bist'
                    ? resolveBistDisplayName(asset.symbol, asset.name)
                    : asset.name;
                return (
                  <Pressable
                    key={h.id}
                    style={({ pressed }) => [
                      styles.assetRow,
                      { paddingVertical: layout.assetRowPaddingVertical },
                      pressed && styles.assetRowPressed,
                    ]}
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
                    <View style={[styles.assetLeft, { gap: layout.assetGap }]}>
                      <View style={styles.assetIconWrap}>
                        <View
                          style={[
                            styles.assetIconCircle,
                            {
                              width: layout.assetIconSize,
                              height: layout.assetIconSize,
                              borderRadius: layout.assetIconSize / 2,
                              backgroundColor: asset.icon_url ? '#ffffff' : avatarBg,
                            },
                          ]}>
                          {asset.icon_url ? (
                            <Image
                              source={{ uri: asset.icon_url }}
                              style={[
                                styles.assetIconImage,
                                {
                                  width: layout.assetIconSize - 8,
                                  height: layout.assetIconSize - 8,
                                  borderRadius: (layout.assetIconSize - 8) / 2,
                                },
                              ]}
                              resizeMode="contain"
                            />
                          ) : (
                            <Text style={[styles.assetIconLetter, { fontFamily: fontHead700 }]}>
                              {asset.symbol.charAt(0).toUpperCase()}
                            </Text>
                          )}
                        </View>
                        {!hasLivePrice ? (
                          <View style={styles.assetIconClock}>
                            <Ionicons name="time-outline" size={11} color="#fff" />
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.assetTextCol}>
                        <Text
                          style={[
                            styles.assetSymbol,
                            { fontFamily: fontHead700, fontSize: layout.assetSymbolFontSize },
                          ]}
                          numberOfLines={1}>
                          {asset.symbol}
                        </Text>
                        <Text style={[styles.assetSubtitle, { fontFamily: fontBody }]} numberOfLines={1}>
                          {hasLivePrice ? formatRowMoney(displayedUnitPrice, displayCurrency, displayLocale) : '—'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.assetRight}>
                      <Text style={[styles.assetValue, { fontFamily: fontHead700 }]} numberOfLines={1}>
                        {hasLivePrice
                          ? formatRowMoney(displayedValue, displayCurrency, displayLocale)
                          : t('portfolio.priceUpdating')}
                      </Text>
                      {hasLivePrice ? (
                        <Text
                          style={[
                            styles.assetPlLine,
                            { fontFamily: fontBodySemi },
                            plLine.neutral
                              ? styles.assetPctNeutral
                              : plLine.up
                                ? styles.assetPctUp
                                : styles.assetPctDown,
                          ]}
                          numberOfLines={1}>
                          {plLine.text}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
          <View style={[styles.bottomSpacer, { height: layout.bottomSpacerHeight }]} />
        </ScrollView>
      </SafeAreaView>
    </TabScreenRoot>
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
  pctNeutral: { color: MUTED_PCT },
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
  assetList: { marginTop: 4 },
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(72,72,72,0.55)',
  },
  assetRowPressed: { opacity: 0.72 },
  assetLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  assetIconWrap: { position: 'relative' },
  assetIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  assetIconLetter: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  assetIconClock: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#374151',
    borderWidth: 1.5,
    borderColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetIconImage: { width: 40, height: 40, borderRadius: 20 },
  assetTextCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  assetSymbol: { fontSize: 16, fontWeight: '700', color: ON_SURFACE, letterSpacing: -0.2 },
  assetSubtitle: { fontSize: 13, color: ON_SURFACE_VARIANT, marginTop: 3, fontWeight: '400' },
  assetRight: { flexShrink: 0, alignItems: 'flex-end', marginLeft: 12, maxWidth: '46%' },
  assetValue: {
    fontSize: 16,
    fontWeight: '700',
    color: ON_SURFACE,
    fontVariant: ['tabular-nums'] as any,
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  assetPlLine: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    fontVariant: ['tabular-nums'] as any,
    textAlign: 'right',
  },
  assetPctUp: { color: SECONDARY },
  assetPctDown: { color: ERROR },
  assetPctNeutral: { color: MUTED_PCT },
  bottomSpacer: { height: 120 },
});
