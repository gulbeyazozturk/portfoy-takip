/**
 * Günlük % gösterimi: borsa kapanışından sonra ve hafta sonu boyunca son işlem günü korunur;
 * yalnızca bir sonraki işlem gününün gece yarısında (00:00) sıfırlanır.
 */

export const TZ_TR = 'Europe/Istanbul';
export const TZ_US = 'America/New_York';

const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

/** YYYY-MM-DD — takvim karşılaştırması için. */
export function calendarDateInTimeZone(date: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (!y || !m || !d) return null;
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}

function weekdayInTimeZone(date: Date, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  } catch {
    return null;
  }
}

export function isWeekdayTradingDate(calendarDate: string, timeZone: string): boolean {
  const wd = weekdayInTimeZone(new Date(`${calendarDate}T12:00:00Z`), timeZone);
  return wd != null && WEEKDAYS.has(wd);
}

function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** priceDay sonrası ilk işlem günü (hafta içi) — o gün 00:00’da gösterim sıfırlanır. */
export function nextTradingDayAfter(priceDay: string, timeZone: string): string {
  let cursor = priceDay;
  for (let i = 0; i < 10; i++) {
    cursor = addCalendarDays(cursor, 1);
    if (isWeekdayTradingDate(cursor, timeZone)) return cursor;
  }
  return cursor;
}

/**
 * BIST / fon / ABD: fiyatın ait olduğu işlem günü %’i, ertesi işlem günü 00:00’a kadar (hafta sonu dahil) gösterilir.
 */
export function shouldShowTradingDayChange(
  priceDay: string,
  nowDay: string,
  timeZone: string,
): boolean {
  if (priceDay > nowDay) return false;
  if (priceDay === nowDay) return true;
  const resetDay = nextTradingDayAfter(priceDay, timeZone);
  return nowDay < resetDay;
}

/** Kripto, döviz, emtia, mevduat: TSİ takvim günü; gece yarısından sonra yalnızca o günün fiyatı. */
export function shouldShowCalendarDayChange(priceDay: string, nowDay: string): boolean {
  return priceDay >= nowDay;
}

export function priceUpdatedCalendarDay(
  priceUpdatedAt: string | null | undefined,
  timeZone: string,
): string | null {
  if (priceUpdatedAt == null || String(priceUpdatedAt).trim() === '') return null;
  const t = Date.parse(String(priceUpdatedAt));
  if (!Number.isFinite(t)) return null;
  return calendarDateInTimeZone(new Date(t), timeZone);
}
