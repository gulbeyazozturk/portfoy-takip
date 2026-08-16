import { Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { PortfolioPickerModal } from '@/components/portfolio-picker-modal';
import { TabScreenRoot } from '@/components/tab-screen-root';
import { Brand } from '@/constants/brand';
import { usePortfolioCoreData, type AssetRow, type HoldingRow } from '@/hooks/use-portfolio-core-data';
import { useMinuteTick } from '@/hooks/use-minute-tick';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { assetAvatarBg } from '@/lib/asset-avatar';
import { resolveBistDisplayName } from '@/lib/bist-display-name';
import { CATEGORY_CHART_COLORS } from '@/lib/category-chart-colors';
import { categoryDisplayLabel } from '@/lib/category-display';
import { legacyCryptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import { effectiveChange24hPctForDisplay } from '@/lib/effective-change-24h';
import {
  formatDisplayMoneyCeil,
  formatDisplayPlLine,
  formatDisplaySignedMoney,
  type DisplayCurrency,
} from '@/lib/display-currency';
import { dailyPrevValueFromChangePct } from '@/lib/fon-price-guards';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';
import {
  holdingMarketUnitNative,
  normalizeAsset,
} from '@/lib/portfolio-holdings';
import { MIN_VALID_USD_TRY_RATE } from '@/lib/usdtry-cache';

const BG = '#000000';
const SURFACE = '#111111';
const PRIMARY = Brand.primary;
const ON_PRIMARY = Brand.onPrimary;
const SURFACE_CONTAINER = '#191919';
const ON_SURFACE = '#ffffff';
const ON_SURFACE_VARIANT = '#ababab';
const BORDER = 'rgba(255,255,255,0.05)';
const POSITIVE = Brand.chartPositive;
const NEGATIVE = Brand.chartNegative;

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  bist: 'stats-chart',
  yurtdisi: 'globe-outline',
  doviz: 'cash-outline',
  emtia: 'cube-outline',
  fon: 'pie-chart-outline',
  kripto: 'logo-bitcoin',
  mevduat: 'wallet-outline',
};

type ScopeMode = 'daily' | 'all';

type HoldingMetric = {
  holding: HoldingRow;
  asset: AssetRow;
  displayName: string;
  displayValue: number;
  displayChangeAmt: number;
  displayPct: number;
  weightPct: number;
  hasLivePrice: boolean;
};

function holdingCostUnit(asset: AssetRow, holding: HoldingRow, usdTry: number, spot: number): number | null {
  const costRaw = holding.avg_price != null ? Number(holding.avg_price) : null;
  if (costRaw == null) return null;
  if (asset.category_id === 'kripto') {
    return legacyCryptoStoredUnitToUsd(costRaw, usdTry, spot);
  }
  return costRaw;
}

function toDisplayAmount(nativeAmt: number, nativeCurrency: 'TL' | 'USD', display: DisplayCurrency, rate: number): number {
  if (nativeCurrency === display) return nativeAmt;
  return nativeCurrency === 'USD' ? nativeAmt * rate : nativeAmt / rate;
}

function buildHoldingMetrics(
  holdings: HoldingRow[],
  usdTry: number,
  scope: ScopeMode,
  displayCurrency: DisplayCurrency,
  totalDisplayValue: number,
  now: Date,
): HoldingMetric[] {
  const rate = usdTry > MIN_VALID_USD_TRY_RATE ? usdTry : 1;
  const rows: HoldingMetric[] = [];

  for (const h of holdings) {
    const asset = normalizeAsset(h.asset);
    if (!asset) continue;

    const spot = holdingMarketUnitNative(h, usdTry).unitNative;
    const hasLivePrice = Number.isFinite(spot) && spot > 0;
    if (!hasLivePrice) continue;

    const valueNative = h.quantity * spot;
    const nativeCurrency: 'TL' | 'USD' = isUsdNativeCategory(asset.category_id) ? 'USD' : 'TL';
    const displayValue = toDisplayAmount(valueNative, nativeCurrency, displayCurrency, rate);

    const changePctDaily =
      effectiveChange24hPctForDisplay(
        asset.category_id,
        asset.change_24h_pct,
        asset.price_updated_at,
        now,
      ) ?? 0;
    const costUnit = holdingCostUnit(asset, h, usdTry, spot);
    const totalPct =
      costUnit != null && costUnit > 0 ? ((spot - costUnit) / costUnit) * 100 : changePctDaily;

    const displayPct = scope === 'daily' ? changePctDaily : totalPct;
    const changeAmtNative =
      scope === 'daily'
        ? dailyPrevValueFromChangePct(valueNative, changePctDaily).dailyDelta
        : costUnit != null
          ? valueNative - h.quantity * costUnit
          : 0;
    const displayChangeAmt = toDisplayAmount(changeAmtNative, nativeCurrency, displayCurrency, rate);

    const displayName =
      asset.category_id === 'bist' ? resolveBistDisplayName(asset.symbol, asset.name) : asset.name;

    rows.push({
      holding: h,
      asset,
      displayName,
      displayValue,
      displayChangeAmt,
      displayPct,
      weightPct: totalDisplayValue > 0 ? (displayValue / totalDisplayValue) * 100 : 0,
      hasLivePrice,
    });
  }

  return rows;
}

function MoverRow({
  item,
  displayCurrency,
  numberLocale,
  onPress,
  fontHead700,
  fontBody,
  iconSize,
}: {
  item: HoldingMetric;
  displayCurrency: DisplayCurrency;
  numberLocale: string;
  onPress: () => void;
  fontHead700: string | undefined;
  fontBody: string | undefined;
  iconSize: number;
}) {
  const { asset, displayChangeAmt, displayPct } = item;
  const pl = formatDisplayPlLine(displayChangeAmt, displayPct, displayCurrency, numberLocale);
  const pctStr = `${displayPct >= 0 ? '+' : ''}${displayPct.toLocaleString(numberLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
  const avatarBg = assetAvatarBg(asset.symbol, asset.category_id);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.moverRow, pressed && styles.moverRowPressed]}
      accessibilityRole="button">
      <View style={styles.moverLeft}>
        <View
          style={[
            styles.moverIcon,
            {
              width: iconSize,
              height: iconSize,
              borderRadius: iconSize / 2,
              backgroundColor: asset.icon_url ? '#ffffff' : avatarBg,
            },
          ]}>
          {asset.icon_url ? (
            <Image
              source={{ uri: asset.icon_url }}
              style={{
                width: iconSize - 8,
                height: iconSize - 8,
                borderRadius: (iconSize - 8) / 2,
              }}
              resizeMode="contain"
            />
          ) : (
            <Text style={[styles.moverIconLetter, { fontFamily: fontHead700 }]}>
              {asset.symbol.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.moverTextCol}>
          <Text style={[styles.moverSymbol, { fontFamily: fontHead700 }]} numberOfLines={1}>
            {asset.symbol}
          </Text>
          <Text style={[styles.moverName, { fontFamily: fontBody }]} numberOfLines={1}>
            {item.displayName}
          </Text>
        </View>
      </View>
      <View style={styles.moverRight}>
        <Text
          style={[
            styles.moverPct,
            { fontFamily: fontHead700 },
            pl.neutral ? styles.pctNeutral : pl.up ? styles.pctUp : styles.pctDown,
          ]}
          numberOfLines={1}>
          {pctStr}
        </Text>
        <Text
          style={[
            styles.moverAmt,
            { fontFamily: fontBody },
            pl.neutral ? styles.pctNeutral : pl.up ? styles.pctUp : styles.pctDown,
          ]}
          numberOfLines={1}>
          {formatDisplaySignedMoney(displayChangeAmt, displayCurrency, numberLocale)}
        </Text>
      </View>
    </Pressable>
  );
}

export default function AnalysisScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const layout = useScreenLayout();
  const numberLocale = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'tr-TR';
  const minuteTick = useMinuteTick();

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

  const [portfolioPickerOpen, setPortfolioPickerOpen] = useState(false);
  const [scope, setScope] = useState<ScopeMode>('daily');
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('TL');

  const {
    holdings,
    usdTry,
    loading,
    error,
    portfolioId,
    portfolios,
    selectPortfolio,
    currentPortfolioName,
    allocationBreakdown,
    portfolioMetrics,
    categoryPerformanceById,
  } = usePortfolioCoreData();

  const totalValue =
    displayCurrency === 'TL' ? portfolioMetrics.totalValueTL : portfolioMetrics.totalValueUSD;

  const heroAmt =
    scope === 'daily'
      ? displayCurrency === 'TL'
        ? portfolioMetrics.dailyChangeTL
        : portfolioMetrics.dailyChangeUSD
      : displayCurrency === 'TL'
        ? portfolioMetrics.totalChangeAmtTL
        : portfolioMetrics.totalChangeAmtUSD;

  const heroPct =
    scope === 'daily'
      ? displayCurrency === 'TL'
        ? portfolioMetrics.dailyPctTL
        : portfolioMetrics.dailyPctUSD
      : displayCurrency === 'TL'
        ? portfolioMetrics.totalPctTL
        : portfolioMetrics.totalPctUSD;

  const heroPositive = heroAmt >= 0;

  const holdingMetrics = useMemo(() => {
    void minuteTick;
    return buildHoldingMetrics(
      holdings,
      usdTry,
      scope,
      displayCurrency,
      totalValue,
      new Date(),
    );
  }, [holdings, usdTry, scope, displayCurrency, totalValue, minuteTick]);

  const categoryContributions = useMemo(() => {
    const rows = allocationBreakdown.map((row) => {
      const perf = categoryPerformanceById[row.categoryId];
      const changeAmt =
        perf == null
          ? 0
          : displayCurrency === 'TL'
            ? scope === 'daily'
              ? perf.dailyChangeTL
              : perf.totalChangeTL
            : scope === 'daily'
              ? perf.dailyChangeUSD
              : perf.totalChangeUSD;
      const changePct =
        perf == null
          ? 0
          : displayCurrency === 'TL'
            ? scope === 'daily'
              ? perf.dailyPctTL
              : perf.totalPctTL
            : scope === 'daily'
              ? perf.dailyPctUSD
              : perf.totalPctUSD;
      return {
        categoryId: row.categoryId,
        label: row.label,
        color: CATEGORY_CHART_COLORS[row.categoryId] ?? row.color,
        changeAmt,
        changePct,
        weightPct: row.pct,
      };
    });

    return rows
      .filter((r) => Math.abs(r.changeAmt) > 0.005 || r.weightPct > 0)
      .sort((a, b) => Math.abs(b.changeAmt) - Math.abs(a.changeAmt));
  }, [allocationBreakdown, categoryPerformanceById, displayCurrency, scope]);

  const maxCategoryAbs = useMemo(
    () => Math.max(...categoryContributions.map((c) => Math.abs(c.changeAmt)), 1),
    [categoryContributions],
  );

  const topGainers = useMemo(
    () => [...holdingMetrics].sort((a, b) => b.displayPct - a.displayPct).slice(0, 3),
    [holdingMetrics],
  );

  const topLosers = useMemo(
    () => [...holdingMetrics].sort((a, b) => a.displayPct - b.displayPct).slice(0, 3),
    [holdingMetrics],
  );

  const concentrationPositions = useMemo(
    () => [...holdingMetrics].sort((a, b) => b.weightPct - a.weightPct).slice(0, 3),
    [holdingMetrics],
  );

  const topCategory = useMemo(() => {
    if (allocationBreakdown.length === 0) return null;
    return [...allocationBreakdown].sort((a, b) => b.pct - a.pct)[0];
  }, [allocationBreakdown]);

  const topThreeWeight = useMemo(
    () => concentrationPositions.reduce((sum, p) => sum + p.weightPct, 0),
    [concentrationPositions],
  );

  const openHolding = (item: HoldingMetric) => {
    const { holding: h, asset } = item;
    router.push({
      pathname: '/(tabs)/asset-entry',
      params: {
        returnTo: '/(tabs)/analysis',
        holdingId: h.id,
        assetId: asset.id,
        name: item.displayName,
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
    });
  };

  const moversTitle =
    scope === 'daily' ? t('analysis.todayMovers') : t('analysis.topPerformers');

  return (
    <TabScreenRoot style={styles.root}>
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
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: layout.scrollPaddingBottom },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {loading && holdings.length === 0 ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={PRIMARY} />
              <Text style={styles.loadingText}>{t('portfolio.loading')}</Text>
            </View>
          ) : null}

          {/* Özet kartı */}
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { fontFamily: fontBodySemi, padding: layout.sectionPadding }]}>
              {t('analysis.summaryTitle')}
            </Text>
            <View style={[styles.summaryBody, { padding: layout.sectionPadding, paddingTop: 0 }]}>
              <Text style={[styles.totalLabel, { fontFamily: fontBody }]}>{t('portfolio.totalValueLabel')}</Text>
              <Text style={[styles.totalValue, { fontFamily: fontHead800, fontSize: layout.analysisSummaryValueFontSize }]}>
                {formatDisplayMoneyCeil(totalValue, displayCurrency, numberLocale)}
              </Text>

              <View style={styles.pillsRow}>
                <View style={styles.currencyPill}>
                  <Pressable
                    onPress={() => setScope('daily')}
                    style={[styles.currencyPillBtn, scope === 'daily' && styles.currencyPillBtnOn]}>
                    <Text
                      style={[
                        styles.currencyPillText,
                        { fontFamily: fontBodySemi },
                        scope === 'daily' && styles.currencyPillTextOn,
                      ]}>
                      {t('portfolio.daily')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setScope('all')}
                    style={[styles.currencyPillBtn, scope === 'all' && styles.currencyPillBtnOn]}>
                    <Text
                      style={[
                        styles.currencyPillText,
                        { fontFamily: fontBodySemi },
                        scope === 'all' && styles.currencyPillTextOn,
                      ]}>
                      {t('portfolio.scopeAll')}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.currencyPill}>
                  <Pressable
                    onPress={() => setDisplayCurrency('TL')}
                    style={[styles.currencyPillBtn, displayCurrency === 'TL' && styles.currencyPillBtnOn]}>
                    <Text
                      style={[
                        styles.currencyPillText,
                        { fontFamily: fontBodySemi },
                        displayCurrency === 'TL' && styles.currencyPillTextOn,
                      ]}>
                      {t('home.currencyTL')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setDisplayCurrency('USD')}
                    style={[styles.currencyPillBtn, displayCurrency === 'USD' && styles.currencyPillBtnOn]}>
                    <Text
                      style={[
                        styles.currencyPillText,
                        { fontFamily: fontBodySemi },
                        displayCurrency === 'USD' && styles.currencyPillTextOn,
                      ]}>
                      {t('home.currencyUSD')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {totalValue > 0 ? (
                <View style={styles.deltaRow}>
                  <Text
                    style={[
                      styles.deltaAmt,
                      { fontFamily: fontHead700 },
                      heroPositive ? styles.pctUp : styles.pctDown,
                    ]}>
                    {formatDisplaySignedMoney(heroAmt, displayCurrency, numberLocale)}
                  </Text>
                  <View style={[styles.deltaBadge, heroPositive && styles.deltaBadgePositive]}>
                    <Text
                      style={[
                        styles.deltaBadgeText,
                        { fontFamily: fontBodySemi },
                        heroPositive ? styles.pctUp : styles.pctDown,
                      ]}>
                      {heroPositive ? '+' : ''}
                      {heroPct.toLocaleString(numberLocale, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      %
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {/* Kategori katkısı */}
          {categoryContributions.length > 0 ? (
            <View style={styles.card}>
              <Text style={[styles.sectionTitle, { fontFamily: fontBodySemi, padding: layout.sectionPadding }]}>
                {t('analysis.categoryContribution')}
              </Text>
              <View style={[styles.sectionBody, { padding: layout.sectionPadding, paddingTop: 0 }]}>
                {categoryContributions.map((row) => {
                  const positive = row.changeAmt >= 0;
                  const barWidth = Math.max(4, (Math.abs(row.changeAmt) / maxCategoryAbs) * 100);
                  const iconName = CATEGORY_ICONS[row.categoryId] ?? 'pricetag-outline';
                  return (
                    <View key={row.categoryId} style={styles.contribRow}>
                      <View style={styles.contribHeader}>
                        <View style={styles.contribLabelRow}>
                          <View style={[styles.contribIconWrap, { backgroundColor: `${row.color}24` }]}>
                            <Ionicons name={iconName} size={14} color={row.color} />
                          </View>
                          <Text style={[styles.contribLabel, { fontFamily: fontBodySemi }]} numberOfLines={1}>
                            {categoryDisplayLabel(row.categoryId, row.label, t)}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.contribAmt,
                            { fontFamily: fontHead700 },
                            positive ? styles.pctUp : styles.pctDown,
                          ]}
                          numberOfLines={1}>
                          {formatDisplaySignedMoney(row.changeAmt, displayCurrency, numberLocale)}
                        </Text>
                      </View>
                      <View style={styles.contribBarTrack}>
                        <View
                          style={[
                            styles.contribBarFill,
                            {
                              width: `${barWidth}%`,
                              backgroundColor: positive ? POSITIVE : NEGATIVE,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.contribMeta, { fontFamily: fontBody }]}>
                        {row.weightPct.toFixed(1)}% ·{' '}
                        {positive ? '+' : ''}
                        {row.changePct.toLocaleString(numberLocale, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        %
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Hareketliler */}
          {holdingMetrics.length > 0 ? (
            <View style={styles.card}>
              <Text style={[styles.sectionTitle, { fontFamily: fontBodySemi, padding: layout.sectionPadding }]}>
                {moversTitle}
              </Text>
              <View style={[styles.sectionBody, { paddingHorizontal: layout.sectionPadding, paddingBottom: layout.sectionPadding }]}>
                <Text style={[styles.subsectionLabel, { fontFamily: fontBodySemi }]}>
                  {scope === 'daily' ? t('analysis.topGainers') : t('analysis.bestPerformers')}
                </Text>
                {topGainers.map((item) => (
                  <MoverRow
                    key={`gain-${item.holding.id}`}
                    item={item}
                    displayCurrency={displayCurrency}
                    numberLocale={numberLocale}
                    onPress={() => openHolding(item)}
                    fontHead700={fontHead700}
                    fontBody={fontBody}
                    iconSize={layout.assetIconSize - 6}
                  />
                ))}

                <Text style={[styles.subsectionLabel, styles.subsectionLabelSpaced, { fontFamily: fontBodySemi }]}>
                  {scope === 'daily' ? t('analysis.topLosers') : t('analysis.worstPerformers')}
                </Text>
                {topLosers.map((item) => (
                  <MoverRow
                    key={`loss-${item.holding.id}`}
                    item={item}
                    displayCurrency={displayCurrency}
                    numberLocale={numberLocale}
                    onPress={() => openHolding(item)}
                    fontHead700={fontHead700}
                    fontBody={fontBody}
                    iconSize={layout.assetIconSize - 6}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* Konsantrasyon */}
          {holdingMetrics.length > 0 ? (
            <View style={styles.card}>
              <Text style={[styles.sectionTitle, { fontFamily: fontBodySemi, padding: layout.sectionPadding }]}>
                {t('analysis.concentration')}
              </Text>
              <View style={[styles.sectionBody, { padding: layout.sectionPadding, paddingTop: 0 }]}>
                <View style={styles.concStatRow}>
                  <Text style={[styles.concStatLabel, { fontFamily: fontBody }]}>{t('analysis.top3Weight')}</Text>
                  <Text style={[styles.concStatValue, { fontFamily: fontHead700 }]}>
                    {topThreeWeight.toFixed(1)}%
                  </Text>
                </View>
                {topCategory ? (
                  <View style={styles.concStatRow}>
                    <Text style={[styles.concStatLabel, { fontFamily: fontBody }]}>
                      {t('analysis.largestCategory')}
                    </Text>
                    <Text style={[styles.concStatValue, { fontFamily: fontHead700 }]} numberOfLines={1}>
                      {categoryDisplayLabel(topCategory.categoryId, topCategory.label, t)} ({topCategory.pct.toFixed(1)}%)
                    </Text>
                  </View>
                ) : null}

                <View style={styles.concDivider} />

                {concentrationPositions.map((item, idx) => (
                  <Pressable
                    key={item.holding.id}
                    onPress={() => openHolding(item)}
                    style={({ pressed }) => [styles.concRow, pressed && styles.moverRowPressed]}
                    accessibilityRole="button">
                    <Text style={[styles.concRank, { fontFamily: fontBodySemi }]}>{idx + 1}</Text>
                    <View style={styles.concRowMid}>
                      <Text style={[styles.concSymbol, { fontFamily: fontHead700 }]} numberOfLines={1}>
                        {item.asset.symbol}
                      </Text>
                      <View style={styles.concBarTrack}>
                        <View
                          style={[
                            styles.concBarFill,
                            {
                              width: `${Math.max(4, item.weightPct)}%`,
                              backgroundColor: PRIMARY,
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <Text style={[styles.concPct, { fontFamily: fontHead700 }]}>
                      {item.weightPct.toFixed(1)}%
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {!loading && holdings.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyText, { fontFamily: fontBody }]}>{t('portfolio.emptyHoldings')}</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </TabScreenRoot>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headerTitleBtn: { maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 8 },
  headerPortfolioTitle: {
    fontWeight: '800',
    color: PRIMARY,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  errorWrap: {
    padding: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 12,
  },
  errorText: { color: '#fca5a5', fontSize: 14 },
  loadingWrap: { padding: 32, alignItems: 'center', gap: 12 },
  loadingText: { color: ON_SURFACE_VARIANT, fontSize: 14 },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ON_SURFACE,
    paddingBottom: 4,
  },
  summaryBody: {},
  sectionBody: {},
  totalLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 4, fontWeight: '500' },
  totalValue: {
    fontWeight: '700',
    color: ON_SURFACE,
    fontVariant: ['tabular-nums'],
    marginBottom: 14,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  currencyPill: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 999,
    backgroundColor: SURFACE_CONTAINER,
  },
  currencyPillBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  currencyPillBtnOn: { backgroundColor: PRIMARY },
  currencyPillText: { fontSize: 12, fontWeight: '700', color: ON_SURFACE_VARIANT },
  currencyPillTextOn: { color: ON_PRIMARY },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deltaAmt: { fontSize: 15, fontWeight: '600' },
  deltaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  deltaBadgePositive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  deltaBadgeText: { fontSize: 13, fontWeight: '600' },
  pctUp: { color: POSITIVE },
  pctDown: { color: NEGATIVE },
  pctNeutral: { color: ON_SURFACE_VARIANT },
  contribRow: { marginBottom: 14 },
  contribHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  contribLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  contribIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contribLabel: { fontSize: 13, fontWeight: '600', color: ON_SURFACE, flex: 1 },
  contribAmt: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  contribBarTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  contribBarFill: { height: '100%', borderRadius: 999 },
  contribMeta: { fontSize: 11, color: ON_SURFACE_VARIANT, marginTop: 4 },
  subsectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: ON_SURFACE_VARIANT,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  subsectionLabelSpaced: { marginTop: 14 },
  moverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 10,
  },
  moverRowPressed: { opacity: 0.72 },
  moverLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  moverIcon: { alignItems: 'center', justifyContent: 'center' },
  moverIconLetter: { fontSize: 14, fontWeight: '700', color: ON_SURFACE },
  moverTextCol: { flex: 1 },
  moverSymbol: { fontSize: 15, fontWeight: '700', color: ON_SURFACE },
  moverName: { fontSize: 12, color: ON_SURFACE_VARIANT, marginTop: 1 },
  moverRight: { alignItems: 'flex-end', maxWidth: '38%' },
  moverPct: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  moverAmt: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  concStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  concStatLabel: { fontSize: 13, color: ON_SURFACE_VARIANT, flex: 1 },
  concStatValue: { fontSize: 14, color: ON_SURFACE, fontVariant: ['tabular-nums'] },
  concDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 12,
  },
  concRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  concRank: {
    width: 20,
    fontSize: 13,
    color: ON_SURFACE_VARIANT,
    textAlign: 'center',
  },
  concRowMid: { flex: 1, gap: 4 },
  concSymbol: { fontSize: 14, color: ON_SURFACE },
  concBarTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  concBarFill: { height: '100%', borderRadius: 999 },
  concPct: {
    width: 48,
    textAlign: 'right',
    fontSize: 13,
    color: ON_SURFACE,
    fontVariant: ['tabular-nums'],
  },
  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: ON_SURFACE_VARIANT, textAlign: 'center', lineHeight: 20 },
});
