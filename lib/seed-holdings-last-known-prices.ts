import type { SupabaseClient } from '@supabase/supabase-js';

import type { AssetLastPriceMap } from '@/lib/asset-last-price-cache';
import type { AssetRow, HoldingRow } from '@/lib/portfolio-holdings';
import { normalizeAsset } from '@/lib/portfolio-holdings';

function positivePrice(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fonPriceInvalid(raw: number): boolean {
  return raw === -100 || (Number.isFinite(raw) && raw < 0);
}

export function assetNeedsLastKnownSeed(asset: AssetRow): boolean {
  const raw = Number(asset.current_price ?? NaN);
  const priceMissing =
    !Number.isFinite(raw) ||
    raw <= 0 ||
    (asset.category_id === 'fon' && fonPriceInvalid(raw));
  const ch = asset.change_24h_pct;
  const changeMissing = ch == null || !Number.isFinite(Number(ch));
  return priceMissing || changeMissing;
}

export async function fetchLatestPriceHistoryByAsset(
  supabase: SupabaseClient,
  assetIds: string[],
): Promise<Map<string, number[]>> {
  const pricesByAsset = new Map<string, number[]>();
  if (assetIds.length === 0) return pricesByAsset;

  const chunkSize = 80;
  for (let i = 0; i < assetIds.length; i += chunkSize) {
    const chunk = assetIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('price_history')
      .select('asset_id, price, recorded_at')
      .in('asset_id', chunk)
      .not('price', 'is', null)
      .order('recorded_at', { ascending: false });
    if (error) continue;

    for (const row of data ?? []) {
      const aid = String(row.asset_id);
      const p = Number(row.price);
      if (!Number.isFinite(p) || p <= 0) continue;
      if (!pricesByAsset.has(aid)) pricesByAsset.set(aid, []);
      const arr = pricesByAsset.get(aid)!;
      if (!arr.length || Math.abs(arr[0] - p) > 1e-12) arr.push(p);
      if (arr.length >= 2) continue;
    }
  }

  return pricesByAsset;
}

function patchAssetWithSeeds(
  asset: AssetRow,
  device: AssetLastPriceMap[string] | undefined,
  phPrices: number[] | undefined,
): AssetRow {
  const raw = Number(asset.current_price ?? NaN);
  const needsPrice =
    !Number.isFinite(raw) ||
    raw <= 0 ||
    (asset.category_id === 'fon' && fonPriceInvalid(raw));
  const ch = asset.change_24h_pct;
  const needsChange = ch == null || !Number.isFinite(Number(ch));

  if (!needsPrice && !needsChange) return asset;

  const next: AssetRow = { ...asset };
  if (needsPrice) {
    const fromDevice = device ? positivePrice(device.current_price) : null;
    const fromPh = phPrices?.[0] != null ? positivePrice(phPrices[0]) : null;
    const seeded = fromDevice ?? fromPh;
    if (seeded != null) next.current_price = seeded;
  }

  if (needsChange) {
    const chDev = device?.change_24h_pct;
    if (chDev != null && Number.isFinite(Number(chDev))) {
      next.change_24h_pct = Number(chDev);
    } else {
      const latest = phPrices?.[0];
      const prev = phPrices?.[1];
      if (
        latest != null &&
        prev != null &&
        Number.isFinite(prev) &&
        prev > 0 &&
        latest > 0
      ) {
        next.change_24h_pct = ((latest - prev) / prev) * 100;
      }
    }
  }

  return next;
}

/** DB fiyatı → telefon önbelleği → price_history (2 gün). */
export function applyLastKnownPricesToHoldings(
  holdings: HoldingRow[],
  deviceByAsset: AssetLastPriceMap,
  phPricesByAsset: Map<string, number[]>,
): HoldingRow[] {
  return holdings.map((h) => {
    const asset = normalizeAsset(h.asset);
    if (!asset) return h;
    if (!assetNeedsLastKnownSeed(asset)) return h;

    const patched = patchAssetWithSeeds(
      asset,
      deviceByAsset[asset.id],
      phPricesByAsset.get(String(asset.id)),
    );
    if (patched === asset) return h;
    if (Array.isArray(h.asset)) {
      return { ...h, asset: [patched, ...h.asset.slice(1)] };
    }
    return { ...h, asset: patched };
  });
}

export function collectAssetIdsNeedingSeed(holdings: HoldingRow[]): string[] {
  const ids = new Set<string>();
  for (const h of holdings) {
    const asset = normalizeAsset(h.asset);
    if (!asset) continue;
    if (assetNeedsLastKnownSeed(asset)) ids.add(String(asset.id));
  }
  return Array.from(ids);
}
