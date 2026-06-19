import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HoldingRow } from '@/lib/portfolio-holdings';
import { normalizeAsset } from '@/lib/portfolio-holdings';

export const ASSET_LAST_PRICE_CACHE_KEY = 'omnifolio_asset_last_prices_v1';

export type CachedAssetPrice = {
  current_price: number;
  change_24h_pct?: number | null;
  saved_at: string;
};

export type AssetLastPriceMap = Record<string, CachedAssetPrice>;

function positivePrice(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function readAssetLastPriceCache(): Promise<AssetLastPriceMap> {
  try {
    const raw = await AsyncStorage.getItem(ASSET_LAST_PRICE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AssetLastPriceMap;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: AssetLastPriceMap = {};
    for (const [id, row] of Object.entries(parsed)) {
      const p = positivePrice(row?.current_price);
      if (p == null) continue;
      out[id] = {
        current_price: p,
        change_24h_pct: row.change_24h_pct ?? null,
        saved_at: row.saved_at ?? '',
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function persistAssetLastPriceCache(map: AssetLastPriceMap): Promise<void> {
  try {
    await AsyncStorage.setItem(ASSET_LAST_PRICE_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Canlı/geçerli fiyatları mevcut önbellekle birleştirip kaydeder. */
export async function mergeHoldingsIntoAssetLastPriceCache(holdings: HoldingRow[]): Promise<void> {
  const existing = await readAssetLastPriceCache();
  const now = new Date().toISOString();
  let changed = false;

  for (const h of holdings) {
    const asset = normalizeAsset(h.asset);
    if (!asset) continue;
    const p = positivePrice(asset.current_price);
    if (p == null) continue;
    const ch = asset.change_24h_pct;
    const chOk = ch != null && Number.isFinite(Number(ch));
    existing[asset.id] = {
      current_price: p,
      change_24h_pct: chOk ? Number(ch) : null,
      saved_at: now,
    };
    changed = true;
  }

  if (changed) {
    await persistAssetLastPriceCache(existing);
  }
}
