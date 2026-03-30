import { kriptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';

/** Trend: gerçek portföy değeri zaman çizelgesi (price_history + kur + created_at). */

export type PortfolioHistoryTf = '1D' | '1W' | '1M' | '1Y' | '5Y';

export type HistoryHolding = {
  assetId: string;
  quantity: number;
  createdMs: number;
  categoryId: string;
  /** Kripto `assets.currency` (TRY ise price_history birimleri TL) */
  storedCurrency?: string | null;
  /** price_history yoksa veya boşsa kullanılacak birim fiyat (TL veya USD native) */
  fallbackPrice: number;
};

export type PricePoint = { ms: number; price: number };

export function timeframeToMs(tf: PortfolioHistoryTf): number {
  switch (tf) {
    case '1D':
      return 24 * 60 * 60 * 1000;
    case '1W':
      return 7 * 24 * 60 * 60 * 1000;
    case '1M':
      return 30 * 24 * 60 * 60 * 1000;
    case '1Y':
      return 365 * 24 * 60 * 60 * 1000;
    case '5Y':
      return 5 * 365 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

/** Grafik nokta sayısı — çok uzun aralıkta günlük binlerce nokta yerine seyreltik örnekleme. */
export function buildSampleTimestamps(nowMs: number, tf: PortfolioHistoryTf): number[] {
  const span = timeframeToMs(tf);
  const start = nowMs - span;
  let n: number;
  switch (tf) {
    case '1D':
      n = 25;
      break;
    case '1W':
      n = 8;
      break;
    case '1M':
      n = 32;
      break;
    case '1Y':
      n = 53;
      break;
    case '5Y':
      n = 66;
      break;
    default:
      n = 24;
  }
  const out: number[] = [];
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    out.push(Math.round(start + ((nowMs - start) * i) / denom));
  }
  return out;
}

/** recorded_at string → ms */
export function parseHistoryMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Son bilinen fiyat: recorded_at <= t ; yoksa en erken kayıt (ileri doldurma başlangıcı). */
export function forwardFilledPrice(sortedAsc: PricePoint[], tMs: number, fallback: number): number {
  if (sortedAsc.length === 0) return fallback;
  let lo = 0;
  let hi = sortedAsc.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid].ms <= tMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best >= 0) return sortedAsc[best].price;
  return sortedAsc[0].price;
}

export function groupPriceRows(
  rows: { asset_id: string; price: number; recorded_at: string }[],
): Map<string, PricePoint[]> {
  const map = new Map<string, PricePoint[]>();
  for (const r of rows) {
    const ms = parseHistoryMs(r.recorded_at);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const p = Number(r.price);
    if (!Number.isFinite(p) || p <= 0) continue;
    const id = r.asset_id;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push({ ms, price: p });
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.ms - b.ms);
  }
  return map;
}

export function buildPortfolioValueSeries(
  sampleMs: number[],
  holdings: HistoryHolding[],
  priceByAsset: Map<string, PricePoint[]>,
  usdTryPoints: PricePoint[] | null,
  spotUsdTry: number,
  currency: 'TL' | 'USD',
): { values: number[]; dates: Date[] } {
  const values: number[] = [];
  const dates: Date[] = [];

  const tryAt = (tMs: number) =>
    forwardFilledPrice(usdTryPoints ?? [], tMs, spotUsdTry > 0 ? spotUsdTry : 1);

  for (const tMs of sampleMs) {
    let total = 0;
    for (const h of holdings) {
      if (tMs < h.createdMs) continue;
      const curve = priceByAsset.get(h.assetId) ?? [];
      let unit = forwardFilledPrice(curve, tMs, h.fallbackPrice);
      const rate = tryAt(tMs);
      if (h.categoryId === 'kripto') {
        unit = kriptoStoredUnitToUsd(unit, rate, h.storedCurrency);
      }
      const qty = h.quantity;
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const native = qty * unit;
      const usdNative = isUsdNativeCategory(h.categoryId);

      if (currency === 'TL') {
        if (usdNative) total += native * rate;
        else total += native;
      } else {
        if (usdNative) total += native;
        else total += rate > 0 ? native / rate : native;
      }
    }
    values.push(total);
    dates.push(new Date(tMs));
  }

  return { values, dates };
}
