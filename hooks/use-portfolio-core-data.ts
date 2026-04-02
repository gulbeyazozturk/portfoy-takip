import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePortfolio } from '@/context/portfolio';
import { CATEGORY_CHART_COLORS } from '@/lib/category-chart-colors';
import { categoryDisplayLabel } from '@/lib/category-display';
import { kriptoStoredUnitToUsd, legacyCryptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';
import { supabase } from '@/lib/supabase';

import type { DonutSlice } from '@/components/ultra-dark-donut-chart';

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
export type AssetRow = {
  id: string;
  name: string;
  symbol: string;
  category_id: string;
  current_price: number | null;
  currency?: string | null;
  icon_url?: string | null;
  change_24h_pct?: number | null;
};
export type HoldingRow = {
  id: string;
  quantity: number;
  avg_price: number | null;
  created_at: string;
  asset: AssetRow | AssetRow[] | null;
};

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

export function normalizeAsset(asset: HoldingRow['asset']): AssetRow | null {
  if (!asset) return null;
  const a = Array.isArray(asset) ? asset[0] ?? null : asset;
  if (a) a.symbol = a.symbol.replace(/^M\d+_/, '');
  return a;
}

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
  const [usdTry, setUsdTry] = useState<number>(1);
  /** Sembol → pozitif TRY/1 birim; aynı sembolün birden fazla asset satırında en yüksek fiyat (genelde dolu master satır). */
  const [dovizSpotBySymbol, setDovizSpotBySymbol] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsdRate = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('assets')
        .select('symbol, current_price')
        .eq('category_id', 'doviz');
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const p = Number(row.current_price);
        if (!Number.isFinite(p) || p <= 0) continue;
        const sym = dovizSymbolKey(row.symbol);
        if (!sym) continue;
        if (map[sym] == null || p > map[sym]) map[sym] = p;
      }
      setDovizSpotBySymbol(map);
      const usd = map.USD;
      if (usd != null && usd > 0) setUsdTry(usd);
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
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('holdings')
      .select(
        'id, quantity, avg_price, created_at, asset:assets(id, name, symbol, category_id, current_price, currency, change_24h_pct, icon_url)',
      )
      .eq('portfolio_id', portfolioId);
    if (e) {
      setError(e.message);
      setHoldings([]);
    } else {
      const rawHoldings = ((data as unknown as HoldingRow[]) ?? []).slice();

      // FON'larda (TEFAS o gün datası gelmediyse) assets.current_price null kalabiliyor.
      // Bu durumda price_history'den en son kaydı (bir önceki gün) çekip current_price'a seed ediyoruz.
      const fonMissingAssetIds = new Set<string>();
      for (const h of rawHoldings) {
        const a = Array.isArray(h.asset) ? h.asset[0] : h.asset;
        if (!a) continue;
        if (a.category_id !== 'fon') continue;
        const p = Number(a.current_price ?? 0);
        const ch = a.change_24h_pct;
        const needsChange = ch == null || !Number.isFinite(Number(ch));
        if (!Number.isFinite(p) || p <= 0 || needsChange) {
          fonMissingAssetIds.add(String(a.id));
        }
      }

      let updatedHoldings = rawHoldings;
      if (fonMissingAssetIds.size > 0) {
        const ids = Array.from(fonMissingAssetIds);
        const { data: phRows, error: phErr } = await supabase
          .from('price_history')
          .select('asset_id, price, recorded_at')
          .in('asset_id', ids)
          .not('price', 'is', null)
          .order('recorded_at', { ascending: false });
        if (phErr) {
          // Fiyat seed edilemezse mevcut (null) kalsın; UI "Fiyat güncelleniyor..." gösterebilir.
        } else {
          const pricesByAsset = new Map<string, number[]>();
          for (const row of phRows ?? []) {
            const aid = String(row.asset_id);
            const p = Number(row.price);
            if (!Number.isFinite(p) || p <= 0) continue;
            if (!pricesByAsset.has(aid)) pricesByAsset.set(aid, []);
            const arr = pricesByAsset.get(aid)!;
            // Aynı değeri tekrar ekleme (bazı kayıtlarda tekrar olabiliyor)
            if (!arr.length || Math.abs(arr[0] - p) > 1e-12) arr.push(p);
            // Her asset için sadece son 2 değere ihtiyacımız var.
            if (arr.length >= 2) continue;
          }

          updatedHoldings = rawHoldings.map((h) => {
            const a = Array.isArray(h.asset) ? h.asset[0] : h.asset;
            if (!a) return h;
            if (a.category_id !== 'fon') return h;
            const cur = Number(a.current_price ?? 0);
            const needsCurrentSeed = !Number.isFinite(cur) || cur <= 0;
            const needsChangeSeed = a.change_24h_pct == null || !Number.isFinite(Number(a.change_24h_pct));
            const prices = pricesByAsset.get(String(a.id)) ?? [];
            const latest = prices[0];
            const prev = prices[1];
            if (!needsCurrentSeed && !needsChangeSeed) return h;
            if (latest == null) return h;

            const nextAsset: any = { ...a };
            if (needsCurrentSeed) nextAsset.current_price = latest;
            if (needsChangeSeed) {
              if (prev != null && Number.isFinite(prev) && prev > 0 && latest > 0) {
                nextAsset.change_24h_pct = ((latest - prev) / prev) * 100;
              } else {
                nextAsset.change_24h_pct = null;
              }
            }
            if (Array.isArray(h.asset)) {
              return { ...h, asset: [nextAsset, ...h.asset.slice(1)] };
            }
            return { ...h, asset: nextAsset };
          });
        }
      }

      setHoldings(updatedHoldings);
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
    }, [portfolioId, fetchHoldings, fetchUsdRate]),
  );

  const currentPortfolioName = useMemo(() => {
    const row = portfolios.find((p) => p.id === portfolioId);
    if (row?.name) return row.name;
    return portfoliosLoading ? t('portfolio.loading') : t('portfolio.headerTitle');
  }, [portfolios, portfolioId, portfoliosLoading, t]);

  const { allocationData, allocationBreakdown, portfolioMetrics, categoryPerformanceById } = useMemo(() => {
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

    const byCategoryTL: Record<string, number> = {};
    type CatAgg = { vTL: number; dTL: number; cTL: number; vUSD: number; dUSD: number; cUSD: number };
    const byCat: Record<string, CatAgg> = {};
    let totalValueTL = 0;
    let totalValueUSD = 0;
    let dailyChangeTL = 0;
    let dailyChangeUSD = 0;
    let costBasisTL = 0;
    let costBasisUSD = 0;
    const safeRate = usdTry > 0 ? usdTry : 1;

    for (const h of withAsset) {
      const asset = h.asset as AssetRow;
      let unitNative = 0;
      if (asset.category_id === 'kripto') {
        const r = asset.current_price != null ? Number(asset.current_price) : NaN;
        if (Number.isFinite(r) && r > 0) {
          unitNative = kriptoStoredUnitToUsd(r, safeRate, asset.currency);
        } else if (h.avg_price != null) {
          unitNative = legacyCryptoStoredUnitToUsd(Number(h.avg_price), safeRate);
        }
      } else {
        unitNative = Number(asset.current_price ?? h.avg_price ?? 0) || 0;
      }
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

      const pct24 = asset.change_24h_pct ?? 0;
      const prevValue = pct24 !== 0 ? value / (1 + pct24 / 100) : value;
      const dailyDeltaNative = pct24 !== 0 ? value - prevValue : 0;
      const costUnit =
        h.avg_price != null
          ? asset.category_id === 'kripto'
            ? legacyCryptoStoredUnitToUsd(Number(h.avg_price), safeRate, unitNative > 0 ? unitNative : undefined)
            : Number(h.avg_price) || 0
          : 0;
      const costNative = h.avg_price != null ? h.quantity * costUnit : prevValue;
      const dTL = dailyDeltaNative * rateTL;
      const dUSD = dailyDeltaNative * rateUSD;
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
  }, [holdings, categories, usdTry, dovizSpotBySymbol, t]);

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
