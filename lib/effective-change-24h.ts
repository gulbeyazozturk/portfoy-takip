/**
 * Günlük % (change_24h_pct) — istemci gösterim kuralları
 *
 * - **BIST / fon:** Seans kapanışından sonra aynı günün %’i TSİ 24:00’a kadar; hafta sonu ve tatil
 *   günlerinde son işlem günü korunur; yalnızca **ertesi işlem gününün 00:00**’ında sıfırlanır.
 * - **Yurtdışı (ABD):** Aynı mantık, **America/New_York** takvim günü ile.
 * - **Döviz / emtia / mevduat:** TSİ gece yarısı; o takvim gününün güncel fiyatı.
 * - **Kripto:** Her gün açık; TSİ 00:00’da sıfırlanır, yeni gün fiyatı gelene kadar gizlenir.
 * - **Aynı gün alım:** Kotasyon alımdan eskiyse veya bugünün günlük %’i yoksa pozisyon
 *   ortalama maliyetle değerlenir (önceki kapanışa göre sahte toplam getiri yok).
 */

import {
  TZ_TR,
  TZ_US,
  calendarDateInTimeZone,
  priceUpdatedCalendarDay,
  shouldShowCalendarDayChange,
  shouldShowTradingDayChange,
} from './trading-day-display';

const TR_CALENDAR_CATEGORIES = new Set(['emtia', 'doviz', 'mevduat', 'kripto']);
const TR_TRADING_CATEGORIES = new Set(['bist', 'fon']);

function shouldShowDailyChange(
  categoryId: string,
  priceUpdatedAt: string | null | undefined,
  now: Date,
): boolean {
  if (categoryId === 'yurtdisi') {
    const priceDay = priceUpdatedCalendarDay(priceUpdatedAt, TZ_US);
    const nowDay = calendarDateInTimeZone(now, TZ_US);
    if (!priceDay || !nowDay) return false;
    return shouldShowTradingDayChange(priceDay, nowDay, TZ_US);
  }

  if (TR_TRADING_CATEGORIES.has(categoryId)) {
    const priceDay = priceUpdatedCalendarDay(priceUpdatedAt, TZ_TR);
    const nowDay = calendarDateInTimeZone(now, TZ_TR);
    if (!priceDay || !nowDay) return false;
    return shouldShowTradingDayChange(priceDay, nowDay, TZ_TR);
  }

  if (TR_CALENDAR_CATEGORIES.has(categoryId)) {
    const priceDay = priceUpdatedCalendarDay(priceUpdatedAt, TZ_TR);
    const nowDay = calendarDateInTimeZone(now, TZ_TR);
    if (!priceDay || !nowDay) return false;
    return shouldShowCalendarDayChange(priceDay, nowDay);
  }

  return true;
}

/**
 * UI ve portföy özetinde kullanılacak günlük %; referans günü geçerli değilse null (0% gibi göster).
 */
export function effectiveChange24hPctForDisplay(
  categoryId: string,
  change24hPct: number | null | undefined,
  priceUpdatedAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (change24hPct == null) return null;
  const raw = Number(change24hPct);
  if (!Number.isFinite(raw)) return null;

  if (!shouldShowDailyChange(categoryId, priceUpdatedAt, now)) return null;
  return raw;
}

function categoryDisplayTimeZone(categoryId: string): string {
  return categoryId === 'yurtdisi' ? TZ_US : TZ_TR;
}

/** Pozisyonun açıldığı an, kategori takvim gününde “bugün” mü? */
export function holdingOpenedOnCurrentDisplayDay(
  categoryId: string,
  openedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (openedAt == null || String(openedAt).trim() === '') return false;
  const openedMs = Date.parse(String(openedAt));
  if (!Number.isFinite(openedMs)) return false;
  const tz = categoryDisplayTimeZone(categoryId);
  const openDay = calendarDateInTimeZone(new Date(openedMs), tz);
  const nowDay = calendarDateInTimeZone(now, tz);
  return openDay != null && nowDay != null && openDay === nowDay;
}

/**
 * Alım, son kotasyondan yeniyse önceki kapanışa göre değerlemek sahte toplam getiri üretir
 * (ör. az önce 105,98’den alınan ABD hissesini dünkü 103,08 ile işaretlemek).
 */
export function isHoldingFillNewerThanQuote(
  holdingCreatedAt: string | null | undefined,
  priceUpdatedAt: string | null | undefined,
): boolean {
  if (holdingCreatedAt == null || String(holdingCreatedAt).trim() === '') return false;
  const createdMs = Date.parse(String(holdingCreatedAt));
  if (!Number.isFinite(createdMs)) return false;
  if (priceUpdatedAt == null || String(priceUpdatedAt).trim() === '') return false;
  const quoteMs = Date.parse(String(priceUpdatedAt));
  if (!Number.isFinite(quoteMs)) return false;
  return createdMs > quoteMs;
}

export type MarkHoldingAtCostArgs = {
  categoryId: string;
  priceUpdatedAt: string | null | undefined;
  change24hPct: number | null | undefined;
  holdingCreatedAt: string | null | undefined;
  now?: Date;
};

/**
 * Güvenilir aynı-seans kotasyonu yokken (veya kotasyon alımdan eskiyken) pozisyonu
 * ortalama maliyetle değerle; aksi halde alım anında gerçek dışı kâr/zarar görünür.
 */
export function shouldMarkHoldingAtCost(args: MarkHoldingAtCostArgs): boolean {
  const now = args.now ?? new Date();
  const openedAt = args.holdingCreatedAt;
  if (openedAt == null || String(openedAt).trim() === '') return false;

  if (isHoldingFillNewerThanQuote(openedAt, args.priceUpdatedAt)) return true;

  if (!holdingOpenedOnCurrentDisplayDay(args.categoryId, openedAt, now)) return false;

  return (
    effectiveChange24hPctForDisplay(
      args.categoryId,
      args.change24hPct,
      args.priceUpdatedAt,
      now,
    ) == null
  );
}

/** Bugünkü getiri: yeni pozisyonda seans kotasyonu yoksa 0; değilse piyasa günlük %. */
export function holdingDailyChangePctForDisplay(
  args: MarkHoldingAtCostArgs & { markAtCost?: boolean },
): number | null {
  const now = args.now ?? new Date();
  const markAtCost = args.markAtCost ?? shouldMarkHoldingAtCost({ ...args, now });
  if (markAtCost) return 0;
  return effectiveChange24hPctForDisplay(
    args.categoryId,
    args.change24hPct,
    args.priceUpdatedAt,
    now,
  );
}
