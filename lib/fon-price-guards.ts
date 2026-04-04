/**
 * TEFAS bazen hata yerine FIYAT=-100 veya negatif döner; portföy değerlemesinde yok sayılır.
 */
export function fonUnitNativeTry(
  currentPrice: number | null | undefined,
  avgPrice: number | null | undefined,
): number {
  const raw = currentPrice != null ? Number(currentPrice) : NaN;
  const avg = avgPrice != null ? Number(avgPrice) : NaN;
  const avgOk = Number.isFinite(avg) && avg > 0;
  if (raw === -100 || (Number.isFinite(raw) && raw < 0)) {
    return avgOk ? avg : 0;
  }
  if (Number.isFinite(raw) && raw > 0) return raw;
  return avgOk ? avg : 0;
}

/**
 * Günlük değişim: change_24h_pct === -100 iken 1+p/100=0 → NaN üretmemek için güvenli payda.
 */
export function dailyPrevValueFromChangePct(
  value: number,
  change_24h_pct: number | null | undefined,
): { prevValue: number; dailyDelta: number } {
  const pctRaw = change_24h_pct ?? 0;
  const pct = Number(pctRaw);
  const pctSafe = Number.isFinite(pct) ? pct : 0;
  const denom = 1 + pctSafe / 100;
  const canUse = pctSafe !== 0 && Number.isFinite(denom) && Math.abs(denom) > 1e-9;
  const prevValue = canUse ? value / denom : value;
  const dailyDelta = canUse ? value - prevValue : 0;
  return { prevValue, dailyDelta };
}
