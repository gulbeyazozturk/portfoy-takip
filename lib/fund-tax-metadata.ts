import type { SupabaseClient } from '@supabase/supabase-js';

import type { FundKind } from './fund-tax-classification';
import { computeFundStopajRatePct } from './fund-stopaj';
import type { FundTaxClassification } from './fund-tax-classification';

export type FundTaxMetadataRow = {
  symbol: string;
  asset_id: string | null;
  fund_kind: FundKind;
  fund_name: string;
  umbrella_type: string | null;
  category: string | null;
  is_hisse_yogun: boolean;
  is_serbest: boolean;
  tefas_listed: boolean;
  stopaj_pct_reference: number;
  stopaj_schedule: Record<string, unknown>;
  source_updated_at: string;
};

export type FundTaxMetadataMap = Map<string, FundTaxMetadataRow>;

function rowToClassification(row: FundTaxMetadataRow): FundTaxClassification {
  return {
    symbol: row.symbol,
    fundKind: row.fund_kind,
    fundName: row.fund_name,
    umbrellaType: row.umbrella_type,
    category: row.category,
    isHisseYogun: row.is_hisse_yogun,
    isSerbest: row.is_serbest,
    tefasListed: row.tefas_listed,
  };
}

/** Belirli iktisap tarihi / elde tutma süresi ile stopaj % hesapla. */
export function resolveFundStopajPctFromRow(
  row: FundTaxMetadataRow,
  options?: { acquisitionDate?: string | null; holdingDays?: number | null; asOfDate?: string },
): number {
  return computeFundStopajRatePct({
    classification: rowToClassification(row),
    acquisitionDate: options?.acquisitionDate,
    holdingDays: options?.holdingDays,
    asOfDate: options?.asOfDate,
  });
}

export async function fetchFundTaxMetadataMap(
  supabase: SupabaseClient,
  symbols?: string[],
): Promise<FundTaxMetadataMap> {
  const map: FundTaxMetadataMap = new Map();
  const chunkSize = 200;
  const normalized = symbols?.map((s) => s.trim().toUpperCase()).filter(Boolean);

  if (normalized?.length) {
    for (let i = 0; i < normalized.length; i += chunkSize) {
      const slice = normalized.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('fund_tax_metadata')
        .select('*')
        .in('symbol', slice);
      if (error) throw error;
      for (const row of (data ?? []) as FundTaxMetadataRow[]) {
        map.set(row.symbol.toUpperCase(), row);
      }
    }
    return map;
  }

  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('fund_tax_metadata')
      .select('*')
      .order('symbol')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as FundTaxMetadataRow[];
    for (const row of rows) {
      map.set(row.symbol.toUpperCase(), row);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return map;
}
