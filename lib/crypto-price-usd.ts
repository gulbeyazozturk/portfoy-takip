/**
 * Kripto birim fiyatları senkron sonrası USD; eski kayıtlar (TRY) veya price_history satırları kalabilir.
 * Güncel spot (USD) verilirse birim karışıklığını daha güvenli ayırt eder.
 */
export function legacyCryptoStoredUnitToUsd(
  unitPrice: number,
  usdTryRate: number,
  referenceUsd?: number,
): number {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return unitPrice;
  if (!Number.isFinite(usdTryRate) || usdTryRate < 5) return unitPrice;

  const asUsdFromTry = unitPrice / usdTryRate;

  if (unitPrice >= 500_000) return asUsdFromTry;

  if (referenceUsd != null && referenceUsd > 0) {
    const distSame = Math.abs(unitPrice - referenceUsd) / referenceUsd;
    const distConverted = Math.abs(asUsdFromTry - referenceUsd) / referenceUsd;
    if (distConverted < distSame && distConverted < 0.4) return asUsdFromTry;
  }

  return unitPrice;
}

/**
 * `assets.currency` güvenilir kaynak: TRY/TL ise fiyat TL cinsinden kabul edilir (düşük coinlerde
 * legacy sezgisel dönüşüm reference olmadan 4,05 gibi değerleri yanlışlıkla USD sanabiliyordu).
 */
export function kriptoStoredUnitToUsd(
  unitPrice: number,
  usdTryRate: number,
  storedCurrency?: string | null,
  referenceUsd?: number,
): number {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return unitPrice;
  const c = (storedCurrency ?? '').trim().toUpperCase();
  if (c === 'TRY' || c === 'TL') {
    if (!Number.isFinite(usdTryRate) || usdTryRate < 5) return unitPrice;
    return unitPrice / usdTryRate;
  }
  return legacyCryptoStoredUnitToUsd(unitPrice, usdTryRate, referenceUsd);
}
