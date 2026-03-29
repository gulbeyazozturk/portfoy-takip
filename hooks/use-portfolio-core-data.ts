import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePortfolio } from '@/context/portfolio';
import { categoryDisplayLabel } from '@/lib/category-display';
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

export const CATEGORY_COLORS: Record<string, string> = {
  fon: '#00C2F2',
  emtia: '#F9A000',
  yurtdisi: '#C60021',
  kripto: '#F6465D',
  bist: '#A64CEB',
  doviz: '#2EB135',
  mevduat: '#FFD700',
};

export type CategoryRow = { id: string; name: string; sort_order: number };
export type AssetRow = {
  id: string;
  name: string;
  symbol: string;
  category_id: string;
  current_price: number | null;
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

export function usePortfolioCoreData() {
  const { t } = useTranslation();
  const { portfolioId, portfolios, selectPortfolio, portfoliosLoading } = usePortfolio();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [usdTry, setUsdTry] = useState<number>(1);
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
        'id, quantity, avg_price, created_at, asset:assets(id, name, symbol, category_id, current_price, change_24h_pct, icon_url)',
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
      const price = asset.current_price ?? h.avg_price ?? 0;
      const isUSD = asset.category_id === 'yurtdisi';
      const rateTL = isUSD ? safeRate : 1;
      const rateUSD = isUSD ? 1 : 1 / safeRate;
      const value = h.quantity * (Number(price) || 0);
      const valueTL = value * rateTL;
      const valueUSD = value * rateUSD;
      const cat = asset.category_id;
      byCategoryTL[cat] = (byCategoryTL[cat] ?? 0) + valueTL;
      totalValueTL += valueTL;
      totalValueUSD += valueUSD;

      const pct24 = asset.change_24h_pct ?? 0;
      const prevValue = pct24 !== 0 ? value / (1 + pct24 / 100) : value;
      const dailyDeltaNative = pct24 !== 0 ? value - prevValue : 0;
      const costNative = h.avg_price != null ? h.quantity * (Number(h.avg_price) || 0) : prevValue;
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
        color: CATEGORY_COLORS[id] ?? '#666',
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
  }, [holdings, categories, usdTry, t]);

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
