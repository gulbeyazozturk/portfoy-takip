import { kriptoStoredUnitToUsd, legacyCryptoStoredUnitToUsd } from './crypto-price-usd';
import { shouldMarkHoldingAtCost } from './effective-change-24h';
import { fonUnitNativeTry } from './fon-price-guards';

export type AssetRow = {
  id: string;
  name: string;
  symbol: string;
  category_id: string;
  current_price: number | null;
  currency?: string | null;
  icon_url?: string | null;
  change_24h_pct?: number | null;
  price_updated_at?: string | null;
};

export type HoldingRow = {
  id: string;
  quantity: number;
  avg_price: number | null;
  created_at: string;
  notes?: string | null;
  asset: AssetRow | AssetRow[] | null;
};

export function normalizeAsset(asset: HoldingRow['asset']): AssetRow | null {
  if (!asset) return null;
  const a = Array.isArray(asset) ? asset[0] ?? null : asset;
  if (a) a.symbol = a.symbol.replace(/^M\d+_/, '');
  return a;
}

function positivePrice(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function holdingAvgUnitNative(
  holding: HoldingRow,
  asset: AssetRow,
  usdTry: number,
): number | null {
  const avg = positivePrice(holding.avg_price);
  if (avg == null) return null;
  if (asset.category_id === 'kripto') {
    return legacyCryptoStoredUnitToUsd(avg, usdTry);
  }
  return avg;
}

/** Piyasa birim fiyatı (varlık para biriminde); 0 = henüz güvenilir fiyat yok. */
export function holdingMarketUnitNative(
  holding: HoldingRow,
  usdTry: number,
  opts?: { now?: Date },
): { unitNative: number; asset: AssetRow | null } {
  const asset = normalizeAsset(holding.asset);
  if (!asset) return { unitNative: 0, asset: null };

  const safeRate = usdTry > 0 ? usdTry : 1;
  const avgNative = holdingAvgUnitNative(holding, asset, safeRate);
  if (
    avgNative != null &&
    shouldMarkHoldingAtCost({
      categoryId: asset.category_id,
      priceUpdatedAt: asset.price_updated_at,
      change24hPct: asset.change_24h_pct,
      holdingCreatedAt: holding.created_at,
      now: opts?.now,
    })
  ) {
    return { unitNative: avgNative, asset };
  }

  if (asset.category_id === 'kripto') {
    const live = positivePrice(asset.current_price);
    if (live != null) {
      return { unitNative: kriptoStoredUnitToUsd(live, safeRate, asset.currency), asset };
    }
    if (avgNative != null) {
      return { unitNative: avgNative, asset };
    }
    return { unitNative: 0, asset };
  }

  if (asset.category_id === 'fon') {
    return { unitNative: fonUnitNativeTry(asset.current_price, holding.avg_price), asset };
  }

  const spot = positivePrice(asset.current_price) ?? avgNative ?? 0;
  return { unitNative: spot, asset };
}

export function isHoldingMarketPriceReady(
  holding: HoldingRow,
  usdTry: number,
  opts?: { now?: Date },
): boolean {
  if (!(holding.quantity > 0)) return true;
  const { unitNative } = holdingMarketUnitNative(holding, usdTry, opts);
  return unitNative > 0;
}

function mergeAssetPreservePrice(prev: AssetRow, next: AssetRow): AssetRow {
  const prevPrice = positivePrice(prev.current_price);
  const nextPrice = positivePrice(next.current_price);
  const prevChg = prev.change_24h_pct;
  const nextChg = next.change_24h_pct;
  const nextChgOk = nextChg != null && Number.isFinite(Number(nextChg));
  const prevChgOk = prevChg != null && Number.isFinite(Number(prevChg));

  let current_price = next.current_price;
  if (nextPrice == null && prevPrice != null) {
    current_price = prev.current_price;
  }

  let change_24h_pct = next.change_24h_pct;
  if (!nextChgOk && prevChgOk) {
    change_24h_pct = prev.change_24h_pct;
  }

  if (current_price === next.current_price && change_24h_pct === next.change_24h_pct) {
    return next;
  }
  return { ...next, current_price, change_24h_pct };
}

/** Aynı portföy yenilemesinde geçici boş fiyatlar eski değerin üstüne yazılmasın. */
export function mergeHoldingsPreservePrices(
  prev: HoldingRow[],
  next: HoldingRow[],
): HoldingRow[] {
  if (!prev.length) return next;
  const prevById = new Map(prev.map((h) => [h.id, h]));

  return next.map((h) => {
    const old = prevById.get(h.id);
    if (!old) return h;

    const oldAsset = normalizeAsset(old.asset);
    const newAsset = normalizeAsset(h.asset);
    if (!oldAsset || !newAsset) return h;

    const merged = mergeAssetPreservePrice(oldAsset, newAsset);
    if (merged === newAsset) return h;
    if (Array.isArray(h.asset)) {
      return { ...h, asset: [merged, ...h.asset.slice(1)] };
    }
    return { ...h, asset: merged };
  });
}
