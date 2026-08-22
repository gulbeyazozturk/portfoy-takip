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

const STORAGE_BUCKET = 'fund-tax-cache';
const STORAGE_OBJECT = 'metadata.json';

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
  const fromTable = await fetchFundTaxMetadataFromTable(supabase, symbols);
  if (fromTable.size > 0) return fromTable;
  return fetchFundTaxMetadataFromStorage(supabase, symbols);
}

async function fetchFundTaxMetadataFromTable(
  supabase: SupabaseClient,
  symbols?: string[],
): Promise<FundTaxMetadataMap> {
  const map: FundTaxMetadataMap = new Map();
  const chunkSize = 200;
  const normalized = symbols?.map((s) => s.trim().toUpperCase()).filter(Boolean);

  try {
    if (normalized?.length) {
      for (let i = 0; i < normalized.length; i += chunkSize) {
        const slice = normalized.slice(i, i + chunkSize);
        const { data, error } = await supabase.from('fund_tax_metadata').select('*').in('symbol', slice);
        if (error) {
          if (/Could not find the table|PGRST205|schema cache/i.test(error.message)) return map;
          throw error;
        }
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
      if (error) {
        if (/Could not find the table|PGRST205|schema cache/i.test(error.message)) return map;
        throw error;
      }
      const rows = (data ?? []) as FundTaxMetadataRow[];
      for (const row of rows) {
        map.set(row.symbol.toUpperCase(), row);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  } catch {
    return map;
  }
  return map;
}

async function fetchFundTaxMetadataFromStorage(
  supabase: SupabaseClient,
  symbols?: string[],
): Promise<FundTaxMetadataMap> {
  const map: FundTaxMetadataMap = new Map();
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(STORAGE_OBJECT);
  if (error || !data) return map;

  const text = await data.text();
  let parsed: { rows?: FundTaxMetadataRow[] } | null = null;
  try {
    parsed = JSON.parse(text) as { rows?: FundTaxMetadataRow[] };
  } catch {
    return map;
  }

  const normalized = symbols?.map((s) => s.trim().toUpperCase()).filter(Boolean);
  for (const row of parsed?.rows ?? []) {
    const sym = row.symbol.toUpperCase();
    if (normalized?.length && !normalized.includes(sym)) continue;
    map.set(sym, row);
  }
  return map;
}
