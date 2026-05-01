import { useEffect, useMemo, useState } from 'react';

import type { AssetRow, HoldingRow } from '@/hooks/use-portfolio-core-data';
import { normalizeAsset } from '@/hooks/use-portfolio-core-data';
import {
  buildPortfolioValueSeries,
  buildSampleTimestamps,
  groupPriceRows,
  type HistoryHolding,
  type PortfolioHistoryTf,
  type PricePoint,
  timeframeToMs,
} from '@/lib/portfolio-history-math';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Row = HoldingRow & { asset: AssetRow };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAllPriceHistoryChunked(
  assetIds: string[],
  sinceIso: string,
): Promise<{ asset_id: string; price: number; recorded_at: string }[]> {
  if (assetIds.length === 0 || !isSupabaseConfigured) return [];
  // Çok büyük IN sorgularını küçültüp statement-timeout riskini azalt.
  const idChunkSize = 20;
  const pageSize = 1000;
  const all: { asset_id: string; price: number; recorded_at: string }[] = [];

  for (const idChunk of chunk(assetIds, idChunkSize)) {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('price_history')
        .select('asset_id, price, recorded_at')
        .in('asset_id', idChunk)
        .gte('recorded_at', sinceIso)
        .order('asset_id', { ascending: true })
        .order('recorded_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      all.push(...(data as { asset_id: string; price: number; recorded_at: string }[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }
  return all;
}

function holdingsFingerprint(rows: Row[]): string {
  return rows
    .map((h) => `${h.id}:${h.asset.id}:${h.quantity}:${h.created_at}`)
    .sort()
    .join('|');
}

export function usePortfolioHistorySeries(
  holdings: HoldingRow[],
  usdTry: number,
  timeframe: PortfolioHistoryTf,
  perfCurrency: 'TL' | 'USD',
  portfolioId: string | null,
) {
  const [fetchState, setFetchState] = useState<{
    loading: boolean;
    error: string | null;
    rows: { asset_id: string; price: number; recorded_at: string }[];
    usdTryCurve: PricePoint[] | null;
  }>({ loading: false, error: null, rows: [], usdTryCurve: null });

  const rows = useMemo(() => {
    return holdings
      .map((h) => ({ ...h, asset: normalizeAsset(h.asset) }))
      .filter((h): h is Row => h.asset != null);
  }, [holdings]);

  const fp = useMemo(() => holdingsFingerprint(rows), [rows]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isSupabaseConfigured || !portfolioId || rows.length === 0) {
        setFetchState({ loading: false, error: null, rows: [], usdTryCurve: null });
        return;
      }

      setFetchState((s) => ({ ...s, loading: true, error: null }));

      const now = Date.now();
      const rangeMs = timeframeToMs(timeframe);
      const sinceMs = now - rangeMs - 5 * 86400000;
      const sinceIso = new Date(sinceMs).toISOString();

      const assetIds = [...new Set(rows.map((h) => h.asset.id))];

      try {
        const { data: usdAsset, error: usdErr } = await supabase
          .from('assets')
          .select('id')
          .eq('category_id', 'doviz')
          .eq('symbol', 'USD')
          .maybeSingle();

        if (usdErr) throw new Error(usdErr.message);

        const usdId = usdAsset?.id as string | undefined;
        const queryIds = usdId ? [...new Set([...assetIds, usdId])] : [...assetIds];

        const historyRows = await fetchAllPriceHistoryChunked(queryIds, sinceIso);
        if (cancelled) return;

        const grouped = groupPriceRows(historyRows);
        const usdCurve = usdId ? grouped.get(usdId) ?? null : null;

        setFetchState({
          loading: false,
          error: null,
          rows: historyRows,
          usdTryCurve: usdCurve,
        });
      } catch (e) {
        if (!cancelled) {
          setFetchState({
            loading: false,
            error: e instanceof Error ? e.message : 'History fetch failed',
            rows: [],
            usdTryCurve: null,
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [portfolioId, timeframe, fp]);

  const series = useMemo(() => {
    const now = Date.now();
    const samples = buildSampleTimestamps(now, timeframe);
    const priceByAsset = groupPriceRows(fetchState.rows);

    const historyHoldings: HistoryHolding[] = rows.map((h) => {
      const p = h.asset.current_price ?? h.avg_price ?? 0;
      const fp = Number(p) || 0;
      return {
        assetId: h.asset.id,
        quantity: h.quantity,
        createdMs: new Date(h.created_at).getTime(),
        categoryId: h.asset.category_id,
        storedCurrency: h.asset.currency,
        fallbackPrice: fp > 0 ? fp : 1e-8,
      };
    });

    return buildPortfolioValueSeries(
      samples,
      historyHoldings,
      priceByAsset,
      fetchState.usdTryCurve,
      usdTry > 0 ? usdTry : 1,
      perfCurrency,
    );
  }, [fetchState.rows, fetchState.usdTryCurve, rows, timeframe, perfCurrency, usdTry]);

  const paddedSeries = useMemo(() => {
    let { values, dates } = series;
    if (values.length === 1 && dates.length === 1) {
      values = [values[0], values[0]];
      dates = [dates[0], dates[0]];
    }
    return { values, dates };
  }, [series]);

  return {
    ...paddedSeries,
    loading: fetchState.loading,
    error: fetchState.error,
  };
}
