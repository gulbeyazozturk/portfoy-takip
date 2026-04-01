import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchUsdTryHistorical } from '@/lib/usdtry-historical';

/**
 * `price_history` (USD varlık) ile gün içi / önceki kapanış; yoksa harici tarihsel kur.
 * `isoDate`: YYYY-MM-DD (UTC günü).
 */
export async function getUsdTryRateForDate(
  supabase: SupabaseClient,
  usdAssetId: string,
  isoDate: string,
): Promise<number | null> {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;

  const dayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
  const dayEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 59)).toISOString();

  const { data: sameDay } = await supabase
    .from('price_history')
    .select('price')
    .eq('asset_id', usdAssetId)
    .gte('recorded_at', dayStart)
    .lte('recorded_at', dayEnd)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const p1 = sameDay?.price != null ? Number(sameDay.price) : NaN;
  if (Number.isFinite(p1) && p1 > 0) return p1;

  const { data: before } = await supabase
    .from('price_history')
    .select('price')
    .eq('asset_id', usdAssetId)
    .lte('recorded_at', dayEnd)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const p2 = before?.price != null ? Number(before.price) : NaN;
  if (Number.isFinite(p2) && p2 > 0) return p2;

  return fetchUsdTryHistorical(new Date(`${isoDate}T12:00:00.000Z`));
}
