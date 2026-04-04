/**
 * Günlük % (change_24h_pct) kaynağı “son işlem günü”ne ait; yeni takvim gününde fiyat henüz
 * o gün için güncellenmediyse eski % gösterilmesin (0 / —).
 *
 * - BIST, fon, emtia, döviz, mevduat: **Europe/Istanbul** takvim günü (TSİ 00:00 sonrası yeni gün).
 * - Yurtdışı (ABD) hisse: **America/New_York** takvim günü — NYSE/NASDAQ kapanışı genelde
 *   Doğu Saati 16:00 → kış (EST) iken kabaca **00:00 TSİ**, yaz (EDT) iken kabaca **23:00 TSİ**
 *   (Türkiye sürekli UTC+3; ABD yaz/kış saati değişir).
 * - Kripto: kesintisiz piyasa; tarih sıfırlaması yok.
 *
 * Senkron scriptler (ör. sync-doviz) emtia/döviz için gece yarısı mantığını ayrıca DB’de uygulayabilir;
 * burada istemci, güncelleme zaman damgası günü değişmişse eski %’i göstermez.
 */

const TZ_TR = 'Europe/Istanbul';
const TZ_US = 'America/New_York';

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

  if (isStaleVersusSessionDay(priceUpdatedAt, now, sessionTz)) return null;
  return raw;
}
