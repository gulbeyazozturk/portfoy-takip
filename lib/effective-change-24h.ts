/**
 * Günlük % (change_24h_pct) kaynağı “son işlem günü”ne ait; yeni takvim gününde fiyat henüz
 * o gün için güncellenmediyse eski % gösterilmesin (0 / —).
 *
 * - BIST: hafta içi seans öncesi ve hafta sonu eski % gösterilmez; seans açıldıktan sonra yalnızca
 *   güncel işlem gününe ait veri kullanılır.
 * - BIST dışı TR seansı kullanan varlıklar (fon, emtia, döviz, mevduat): **Europe/Istanbul**
 *   takvim günü (TSİ 00:00 sonrası yeni gün).
 * - Yurtdışı (ABD) hisse: **America/New_York** takvim günü — NYSE/NASDAQ kapanışı genelde
 *   Doğu Saati 16:00 → kış (EST) iken kabaca **00:00 TSİ**, yaz (EDT) iken kabaca **23:00 TSİ**
 *   (Türkiye sürekli UTC+3; ABD yaz/kış saati değişir). Hafta sonu ve seans öncesi eski % gizlenir.
 * - Kripto: kesintisiz piyasa; tarih sıfırlaması yok.
 *
 * Senkron scriptler (ör. sync-doviz) emtia/döviz için gece yarısı mantığını ayrıca DB’de uygulayabilir;
 * burada istemci, güncelleme zaman damgası günü değişmişse eski %’i göstermez.
 */

const TZ_TR = 'Europe/Istanbul';
const TZ_US = 'America/New_York';
const BIST_SESSION_START_MINUTE = 10 * 60;
const BIST_SESSION_END_MINUTE = 18 * 60;
const US_SESSION_START_MINUTE = 9 * 60 + 30;
const US_SESSION_END_MINUTE = 16 * 60;

function calendarDateInTimeZone(date: Date, timeZone: string): string | null {
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

function isStaleVersusSessionDay(
  priceUpdatedAt: string | null | undefined,
  now: Date,
  sessionTimeZone: string,
): boolean {
  const dNow = calendarDateInTimeZone(now, sessionTimeZone);
  if (!dNow) return false;
  if (priceUpdatedAt == null || String(priceUpdatedAt).trim() === '') return true;
  const t = Date.parse(String(priceUpdatedAt));
  if (!Number.isFinite(t)) return true;
  const dPrice = calendarDateInTimeZone(new Date(t), sessionTimeZone);
  if (!dPrice) return true;
  return dPrice < dNow;
}

function timePartsInTimeZone(
  date: Date,
  timeZone: string,
): { weekday: string; minuteOfDay: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { weekday, minuteOfDay: hour * 60 + minute };
  } catch {
    return null;
  }
}

function isWeekday(weekday: string): boolean {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
}

function isWithinActiveSession(categoryId: string, now: Date): boolean {
  if (categoryId !== 'bist' && categoryId !== 'yurtdisi') return false;

  const timeZone = categoryId === 'bist' ? TZ_TR : TZ_US;
  const sessionOpenMinute = categoryId === 'bist' ? BIST_SESSION_START_MINUTE : US_SESSION_START_MINUTE;
  const sessionEndMinute = categoryId === 'bist' ? BIST_SESSION_END_MINUTE : US_SESSION_END_MINUTE;
  const parts = timePartsInTimeZone(now, timeZone);
  if (!parts) return false;
  if (!isWeekday(parts.weekday)) return false;
  return parts.minuteOfDay >= sessionOpenMinute && parts.minuteOfDay < sessionEndMinute;
}

/**
 * UI ve portföy özetinde kullanılacak günlük %; güncelleme “oturum günü”ne ait değilse null döner (0% gibi göster).
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

  if (categoryId === 'kripto') return raw;

  let sessionTz: string | null = null;
  if (
    categoryId === 'bist' ||
    categoryId === 'fon' ||
    categoryId === 'emtia' ||
    categoryId === 'mevduat' ||
    categoryId === 'doviz'
  ) {
    sessionTz = TZ_TR;
  } else if (categoryId === 'yurtdisi') {
    sessionTz = TZ_US;
  }

  if (sessionTz == null) return raw;

  if ((categoryId === 'bist' || categoryId === 'yurtdisi') && !isWithinActiveSession(categoryId, now)) {
    return null;
  }
  if (isStaleVersusSessionDay(priceUpdatedAt, now, sessionTz)) return null;
  return raw;
}
