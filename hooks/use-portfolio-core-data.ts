import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePortfolio } from '@/context/portfolio';
import { useMinuteTick } from '@/hooks/use-minute-tick';
import { CATEGORY_CHART_COLORS } from '@/lib/category-chart-colors';
import { categoryDisplayLabel } from '@/lib/category-display';
import { legacyCryptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import { effectiveChange24hPctForDisplay } from '@/lib/effective-change-24h';
import { dailyPrevValueFromChangePct } from '@/lib/fon-price-guards';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';
import {
  holdingMarketUnitNative,
  isHoldingMarketPriceReady,
  mergeHoldingsPreservePrices,
  normalizeAsset,
  type AssetRow,
  type HoldingRow,
} from '@/lib/portfolio-holdings';
import {
  mergeHoldingsIntoAssetLastPriceCache,
  readAssetLastPriceCache,
  type AssetLastPriceMap,
} from '@/lib/asset-last-price-cache';
import {
  applyLastKnownPricesToHoldings,
  collectAssetIdsNeedingSeed,
  fetchLatestPriceHistoryByAsset,
} from '@/lib/seed-holdings-last-known-prices';
import {
  persistPortfolioSummaryCache,
  readPortfolioSummaryCache,
} from '@/lib/portfolio-summary-cache';
import { pruneLocalPortfolioCaches } from '@/lib/prune-local-portfolio-cache';
import { MIN_VALID_USD_TRY_RATE, persistUsdTryRate, readCachedUsdTryRate } from '@/lib/usdtry-cache';
import { supabase } from '@/lib/supabase';

import type { DonutSlice } from '@/components/ultra-dark-donut-chart';

export type { AssetRow, HoldingRow } from '@/lib/portfolio-holdings';
export { normalizeAsset } from '@/lib/portfolio-holdings';

export type AllocationBreakdownRow = {
  categoryId: string;
  label: string;
  pct: number;
  color: string;
  amountTL: number;
  amountUSD: number;
};

export const CATEGORY_COLORS = CATEGORY_CHART_COLORS;

export type CategoryRow = { id: string; name: string; sort_order: number };

/** Kategori kartları / özet: günlük (24s) ve tümü (maliyete göre) */
export type CategoryPerformanceMetrics = {
  dailyChangeTL: number;
  dailyPctTL: number;
  dailyChangeUSD: number;
  dailyPctUSD: number;
  totalChangeTL: number;
  totalPctTL: number;
  totalChangeUSD: number;
  totalPctUSD: number;
};

/** Döviz sembol eşlemesi (M*_ öneki kalkmış büyük harf); spot haritası anahtarları için. */
function dovizSymbolKey(symbol: string | null | undefined): string {
  if (!symbol) return '';
  return symbol.replace(/^M\d+_/, '').toUpperCase().trim();
}

export function usePortfolioCoreData() {
  const { t } = useTranslation();
  const { portfolioId, portfolios, selectPortfolio, portfoliosLoading } = usePortfolio();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  /** 0 = henüz bilinmiyor; `MIN_VALID_USD_TRY_RATE` üstü değerler kur için kullanılır. */
  const [usdTry, setUsdTry] = useState<number>(0);
  const [usdTryDailyPct, setUsdTryDailyPct] = useState<number>(0);
  /** Sembol → pozitif TRY/1 birim; aynı sembolün birden fazla asset satırında en yüksek fiyat (genelde dolu master satır). */
  const [dovizSpotBySymbol, setDovizSpotBySymbol] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const minuteTick = useMinuteTick();
  const holdingsFetchGenRef = useRef(0);
  const holdingsPortfolioRef = useRef<string | null>(null);
  const devicePriceCacheRef = useRef<AssetLastPriceMap>({});
  const usdTryFallbackRef = useRef<number>(0);
  const [summaryEpoch, setSummaryEpoch] = useState(0);

  type MetricsBundle = {
    allocationData: DonutSlice[];
    allocationBreakdown: AllocationBreakdownRow[];
    portfolioMetrics: {
      totalValueTL: number;
      totalValueUSD: number;
      dailyChangeTL: number;
      dailyChangeUSD: number;
      dailyPctTL: number;
      dailyPctUSD: number;
      costBasisTL: number;
      costBasisUSD: number;
      totalChangeAmtTL: number;
      totalChangeAmtUSD: number;
      totalPctTL: number;
      totalPctUSD: number;
      holdingCount: number;
    };
    categoryPerformanceById: Record<string, CategoryPerformanceMetrics>;
  };

  const lastMetricsRef = useRef<{ portfolioId: string | null; data: MetricsBundle | null }>({
    portfolioId: null,
    data: null,
  });

  const fetchUsdRate = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('assets')
        .select('symbol, current_price, change_24h_pct')
        .eq('category_id', 'doviz');
      const map: Record<string, number> = {};
      let usdDailyPct = 0;
      for (const row of data ?? []) {
        const p = Number(row.current_price);
        if (!Number.isFinite(p) || p <= 0) continue;
        const sym = dovizSymbolKey(row.symbol);
        if (!sym) continue;
        if (map[sym] == null || p > map[sym]) {
          map[sym] = p;
          if (sym === 'USD') {
            const chg = Number(row.change_24h_pct);
            usdDailyPct = Number.isFinite(chg) ? chg : 0;
          }
        }
      }
      setDovizSpotBySymbol(map);
      const usd = map.USD;
      if (usd != null && usd > MIN_VALID_USD_TRY_RATE) {
        setUsdTry(usd);
        void persistUsdTryRate(usd);
      }
      setUsdTryDailyPct(usdDailyPct);
    } catch {
      /* keep previous */
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
    const fetchGen = ++holdingsFetchGenRef.current;
    const portfolioSwitched = holdingsPortfolioRef.current !== portfolioId;
    holdingsPortfolioRef.current = portfolioId;
    setError(null);
    setLoading((prevLoading) => portfolioSwitched || prevLoading);
    const { data, error: e } = await supabase
      .from('holdings')
      .select(
        'id, quantity, avg_price, created_at, asset:assets(id, name, symbol, category_id, current_price, currency, change_24h_pct, price_updated_at, icon_url)',
      )
      .eq('portfolio_id', portfolioId);
    if (e) {
      setError(e.message);
    } else {
      const rawHoldings = ((data as unknown as HoldingRow[]) ?? []).slice();

      let deviceByAsset = devicePriceCacheRef.current;
      if (!Object.keys(deviceByAsset).length) {
        deviceByAsset = await readAssetLastPriceCache();
        devicePriceCacheRef.current = deviceByAsset;
      }

      const seedIds = collectAssetIdsNeedingSeed(rawHoldings);
      const phPricesByAsset =
        seedIds.length > 0 ? await fetchLatestPriceHistoryByAsset(supabase, seedIds) : new Map();

      let updatedHoldings = applyLastKnownPricesToHoldings(
        rawHoldings,
        deviceByAsset,
        phPricesByAsset,
      );

      if (fetchGen !== holdingsFetchGenRef.current) return;
      setHoldings((prev) => {
        const merged =
          portfolioSwitched || !prev.length
            ? updatedHoldings
            : mergeHoldingsPreservePrices(prev, updatedHoldings);
        void (async () => {
          await mergeHoldingsIntoAssetLastPriceCache(merged);
          if (portfolios.length > 0) {
            await pruneLocalPortfolioCaches(portfolios.map((p) => p.id));
          }
          devicePriceCacheRef.current = await readAssetLastPriceCache();
        })();
        return merged;
      });
    }
    if (fetchGen === holdingsFetchGenRef.current) {
      setLoading(false);
    }
  }, [portfolioId, portfolios]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const cached = await readCachedUsdTryRate();
      if (!alive || cached == null) return;
      usdTryFallbackRef.current = cached;
      setUsdTry((prev) => (prev > MIN_VALID_USD_TRY_RATE ? prev : cached));
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!portfolioId) return;
    let alive = true;
    void (async () => {
      const [assetCache, summaryRow, usdCached] = await Promise.all([
        readAssetLastPriceCache(),
        readPortfolioSummaryCache(portfolioId),
        readCachedUsdTryRate(),
      ]);
      if (!alive) return;
      devicePriceCacheRef.current = assetCache;
      if (usdCached != null && usdCached > MIN_VALID_USD_TRY_RATE) {
        usdTryFallbackRef.current = usdCached;
        setUsdTry((prev) => (prev > MIN_VALID_USD_TRY_RATE ? prev : usdCached));
      }
      if (summaryRow?.data) {
        lastMetricsRef.current = {
          portfolioId,
          data: summaryRow.data as MetricsBundle,
        };
        setSummaryEpoch((n) => n + 1);
      }
    })();
    return () => {
      alive = false;
    };
  }, [portfolioId]);

  useEffect(() => {
    fetchCategories();
    fetchUsdRate();
  }, [fetchCategories, fetchUsdRate]);

  useEffect(() => {
    holdingsPortfolioRef.current = null;
    lastMetricsRef.current = { portfolioId: portfolioId ?? null, data: null };
    devicePriceCacheRef.current = {};
    setHoldings([]);
    setLoading(true);
    void readAssetLastPriceCache().then((map) => {
      devicePriceCacheRef.current = map;
    });
    fetchHoldings();
  }, [fetchHoldings, portfolioId]);

  useFocusEffect(
    useCallback(() => {
      if (portfolioId) {
        fetchHoldings();
        fetchUsdRate();
      }
    }, [portfolioId, fetchHoldings, fetchUsdRate]),
  );

  // Ekran uzun süre açık kaldığında fiyatlar arka planda güncellenebiliyor;
  // dakika tikinde hafif bir yenileme yaparak toplam/kalem tutarsızlığını azalt.
  useEffect(() => {
    if (!portfolioId || minuteTick <= 0) return;
    if (minuteTick % 2 !== 0) return; // Her 2 dakikada bir
    void fetchHoldings();
    void fetchUsdRate();
  }, [portfolioId, minuteTick, fetchHoldings, fetchUsdRate]);

  const currentPortfolioName = useMemo(() => {
    const row = portfolios.find((p) => p.id === portfolioId);
    if (row?.name) return row.name;
    return portfoliosLoading ? t('portfolio.loading') : t('portfolio.headerTitle');
  }, [portfolios, portfolioId, portfoliosLoading, t]);

  const fxRateReady = useMemo(() => {
    const needs = holdings.some((h) => {
      const a = normalizeAsset(h.asset);
      return a != null && isUsdNativeCategory(a.category_id);
    });
    const rate =
      usdTry > MIN_VALID_USD_TRY_RATE
        ? usdTry
        : usdTryFallbackRef.current > MIN_VALID_USD_TRY_RATE
          ? usdTryFallbackRef.current
          : usdTry;
    return !needs || rate > MIN_VALID_USD_TRY_RATE;
  }, [holdings, usdTry, summaryEpoch]);

  const valuationReady = useMemo(() => {
    if (holdings.length === 0) return true;
    const rate =
      usdTry > MIN_VALID_USD_TRY_RATE
        ? usdTry
        : usdTryFallbackRef.current > MIN_VALID_USD_TRY_RATE
          ? usdTryFallbackRef.current
          : 1;
    return holdings.every((h) => isHoldingMarketPriceReady(h, rate));
  }, [holdings, usdTry, summaryEpoch]);

  const metricsReady = fxRateReady && valuationReady;

  const effectiveUsdTry = useMemo(() => {
    if (usdTry > MIN_VALID_USD_TRY_RATE) return usdTry;
    if (usdTryFallbackRef.current > MIN_VALID_USD_TRY_RATE) return usdTryFallbackRef.current;
    return usdTry;
  }, [usdTry, summaryEpoch]);

  const liveMetrics = useMemo((): MetricsBundle => {
    const emptyMetrics = {
      totalValueTL: 0,
      totalValueUSD: 0,
      dailyChangeTL: 0,
      dailyChangeUSD: 0,
      dailyPctTL: 0,
      dailyPctUSD: 0,
      costBasisTL: 0,
      costBasisUSD: 0,
      totalChangeAmtTL: 0,
      totalChangeAmtUSD: 0,
      totalPctTL: 0,
      totalPctUSD: 0,
      holdingCount: 0,
    };
    const empty = {
      allocationData: [] as DonutSlice[],
      allocationBreakdown: [] as AllocationBreakdownRow[],
      portfolioMetrics: emptyMetrics,
      categoryPerformanceById: {} as Record<string, CategoryPerformanceMetrics>,
    };

    const withAsset = holdings.map((h) => ({ ...h, asset: normalizeAsset(h.asset) })).filter((h) => h.asset);
    if (withAsset.length === 0) return empty;

    const safeRate = effectiveUsdTry > MIN_VALID_USD_TRY_RATE ? effectiveUsdTry : 1;
    const now = new Date();

    const byCategoryTL: Record<string, number> = {};
    type CatAgg = { vTL: number; dTL: number; cTL: number; vUSD: number; dUSD: number; cUSD: number };
    const byCat: Record<string, CatAgg> = {};
    let totalValueTL = 0;
    let totalValueUSD = 0;
    let dailyChangeTL = 0;
    let dailyChangeUSD = 0;
    let costBasisTL = 0;
    let costBasisUSD = 0;
    const usdDailyFactor = 1 + (Number.isFinite(usdTryDailyPct) ? usdTryDailyPct : 0) / 100;
    const safeRatePrev = usdDailyFactor > 0 ? safeRate / usdDailyFactor : safeRate;

    for (const h of withAsset) {
      if (!(h.quantity > 0)) continue;
      const { unitNative, asset: valuedAsset } = holdingMarketUnitNative(h, safeRate);
      const asset = valuedAsset as AssetRow;
      if (!asset || !(unitNative > 0)) continue;
      const isUSD = isUsdNativeCategory(asset.category_id);
      const rateTL = isUSD ? safeRate : 1;
      const rateUSD = isUSD ? 1 : 1 / safeRate;
      const value = h.quantity * unitNative;
      const valueTL = value * rateTL;
      const valueUSD = value * rateUSD;
      const cat = asset.category_id;
      byCategoryTL[cat] = (byCategoryTL[cat] ?? 0) + valueTL;
      totalValueTL += valueTL;
      totalValueUSD += valueUSD;

      const effPct = effectiveChange24hPctForDisplay(
        asset.category_id,
        asset.change_24h_pct,
        asset.price_updated_at,
        now,
      );
      const { prevValue, dailyDelta: dailyDeltaNative } = dailyPrevValueFromChangePct(value, effPct);
      const prevValueNative = value - dailyDeltaNative;
      const costUnit =
        h.avg_price != null
          ? asset.category_id === 'kripto'
            ? legacyCryptoStoredUnitToUsd(Number(h.avg_price), safeRate, unitNative > 0 ? unitNative : undefined)
            : Number(h.avg_price) || 0
          : 0;
      const costNative = h.avg_price != null ? h.quantity * costUnit : prevValue;
      const dTL = dailyDeltaNative * rateTL;
      const dUSD = isUSD
        ? dailyDeltaNative
        : value / safeRate - prevValueNative / safeRatePrev;
      const cTL = costNative * rateTL;
      const cUSD = costNative * rateUSD;

      dailyChangeTL += dTL;
      dailyChangeUSD += dUSD;
      costBasisTL += cTL;
      costBasisUSD += cUSD;

      if (!byCat[cat]) {
        byCat[cat] = { vTL: 0, dTL: 0, cTL: 0, vUSD: 0, dUSD: 0, cUSD: 0 };
      }
      const ca = byCat[cat];
      ca.vTL += valueTL;
      ca.vUSD += valueUSD;
      ca.dTL += dTL;
      ca.dUSD += dUSD;
      ca.cTL += cTL;
      ca.cUSD += cUSD;
    }

    if (totalValueTL <= 0 || !Number.isFinite(totalValueTL)) return empty;

    const dailyPctTL =
      totalValueTL - dailyChangeTL > 0
        ? Math.round((dailyChangeTL / (totalValueTL - dailyChangeTL)) * 10000) / 100
        : 0;
    const dailyPctUSD =
      totalValueUSD - dailyChangeUSD > 0
        ? Math.round((dailyChangeUSD / (totalValueUSD - dailyChangeUSD)) * 10000) / 100
        : 0;

    const totalChangeAmtTL = totalValueTL - costBasisTL;
    const totalChangeAmtUSD = totalValueUSD - costBasisUSD;
    const totalPctTL =
      costBasisTL > 0 ? Math.round((totalChangeAmtTL / costBasisTL) * 10000) / 100 : 0;
    const totalPctUSD =
      costBasisUSD > 0 ? Math.round((totalChangeAmtUSD / costBasisUSD) * 10000) / 100 : 0;

    const categoryPerformanceById: Record<string, CategoryPerformanceMetrics> = {};
    for (const [cid, a] of Object.entries(byCat)) {
      const dailyPctTLCat =
        a.vTL - a.dTL > 0 ? Math.round((a.dTL / (a.vTL - a.dTL)) * 10000) / 100 : 0;
      const dailyPctUSDCat =
        a.vUSD - a.dUSD > 0 ? Math.round((a.dUSD / (a.vUSD - a.dUSD)) * 10000) / 100 : 0;
      const totalChangeTLCat = a.vTL - a.cTL;
      const totalChangeUSDCat = a.vUSD - a.cUSD;
      const totalPctTLCat =
        a.cTL > 0 ? Math.round((totalChangeTLCat / a.cTL) * 10000) / 100 : 0;
      const totalPctUSDCat =
        a.cUSD > 0 ? Math.round((totalChangeUSDCat / a.cUSD) * 10000) / 100 : 0;
      categoryPerformanceById[cid] = {
        dailyChangeTL: a.dTL,
        dailyPctTL: dailyPctTLCat,
        dailyChangeUSD: a.dUSD,
        dailyPctUSD: dailyPctUSDCat,
        totalChangeTL: totalChangeTLCat,
        totalPctTL: totalPctTLCat,
        totalChangeUSD: totalChangeUSDCat,
        totalPctUSD: totalPctUSDCat,
      };
    }

    const catNames: Record<string, string> = {};
    categories.forEach((c) => {
      catNames[c.id] = categoryDisplayLabel(c.id, c.name, t);
    });

    const allocationData: DonutSlice[] = Object.entries(byCategoryTL)
      .map(([id, amountTL]) => ({
        categoryId: id,
        label: catNames[id] ?? id,
        value: Math.round((amountTL / totalValueTL) * 10000) / 100,
        color: CATEGORY_CHART_COLORS[id] ?? '#666',
      }))
      .filter((d) => d.value > 0);

    const allocationBreakdown: AllocationBreakdownRow[] = [...allocationData]
      .map((d) => {
        const amountTL = byCategoryTL[d.categoryId!] ?? 0;
        return {
          categoryId: d.categoryId!,
          label: d.label,
          pct: d.value,
          color: d.color,
          amountTL,
          amountUSD: amountTL / safeRate,
        };
      })
      .sort((a, b) => b.amountTL - a.amountTL);

    return {
      allocationData,
      allocationBreakdown,
      portfolioMetrics: {
        totalValueTL,
        totalValueUSD,
        dailyChangeTL,
        dailyChangeUSD,
        dailyPctTL,
        dailyPctUSD,
        costBasisTL,
        costBasisUSD,
        totalChangeAmtTL,
        totalChangeAmtUSD,
        totalPctTL,
        totalPctUSD,
        holdingCount: withAsset.length,
      },
      categoryPerformanceById,
    };
  }, [holdings, categories, effectiveUsdTry, usdTryDailyPct, dovizSpotBySymbol, t, minuteTick]);

  const { allocationData, allocationBreakdown, portfolioMetrics, categoryPerformanceById } = useMemo(() => {
    const live = liveMetrics;
    const canCommit =
      holdings.length === 0 ||
      (live.portfolioMetrics.totalValueTL > 0 &&
        Number.isFinite(live.portfolioMetrics.totalValueTL));
    if (canCommit) {
      lastMetricsRef.current = { portfolioId: portfolioId ?? null, data: live };
      if (portfolioId && holdings.length > 0) {
        void persistPortfolioSummaryCache(portfolioId, live);
      }
      return live;
    }
    const cached = lastMetricsRef.current;
    if (cached.portfolioId === portfolioId && cached.data) {
      return cached.data;
    }
    return live;
  }, [liveMetrics, holdings.length, portfolioId, summaryEpoch]);

  return {
    categories,
    holdings,
    usdTry,
    loading,
    error,
    portfolioId,
    portfolios,
    portfoliosLoading,
    selectPortfolio,
    currentPortfolioName,
    allocationData,
    allocationBreakdown,
    portfolioMetrics,
    categoryPerformanceById,
    fetchHoldings,
    fetchUsdRate,
  };
}
