/**
 * Günlük % (change_24h_pct) — istemci gösterim kuralları
 *
 * - **BIST / fon:** Seans kapanışından sonra aynı günün %’i TSİ 24:00’a kadar; hafta sonu ve tatil
 *   günlerinde son işlem günü korunur; yalnızca **ertesi işlem gününün 00:00**’ında sıfırlanır.
 * - **Yurtdışı (ABD):** Aynı mantık, **America/New_York** takvim günü ile.
 * - **Döviz / emtia / mevduat:** TSİ gece yarısı; o takvim gününün güncel fiyatı.
 * - **Kripto:** Her gün açık; TSİ 00:00’da sıfırlanır, yeni gün fiyatı gelene kadar gizlenir.
 */

import {
  TZ_TR,
  TZ_US,
  calendarDateInTimeZone,
  priceUpdatedCalendarDay,
  shouldShowCalendarDayChange,
  shouldShowTradingDayChange,
} from '@/lib/trading-day-display';

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
