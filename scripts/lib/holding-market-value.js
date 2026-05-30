/**
 * Uygulama ile uyumlu holding piyasa değeri (lib/portfolio-holdings.ts özeti).
 */

function positivePrice(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isUsdNativeCategory(categoryId) {
  return categoryId === 'yurtdisi' || categoryId === 'kripto';
}

function legacyCryptoStoredUnitToUsd(unitPrice, usdTryRate, referenceUsd) {
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

function kriptoStoredUnitToUsd(unitPrice, usdTryRate, storedCurrency, referenceUsd) {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return unitPrice;
  const c = (storedCurrency ?? '').trim().toUpperCase();
  if (c === 'TRY' || c === 'TL') {
    if (!Number.isFinite(usdTryRate) || usdTryRate < 5) return unitPrice;
    return unitPrice / usdTryRate;
  }
  return legacyCryptoStoredUnitToUsd(unitPrice, usdTryRate, referenceUsd);
}

function fonUnitNativeTry(currentPrice, avgPrice) {
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
 * @returns {{ unitNative: number, priceSource: 'current_price' | 'avg_price' | 'none' }}
 */
function holdingMarketUnitNative(holding, asset, usdTry) {
  const row = normalizeAssetRow(asset);
  if (!row) return { unitNative: 0, priceSource: 'none' };
  const safeRate = usdTry > 0 ? usdTry : 1;

  if (row.category_id === 'kripto') {
    const live = positivePrice(row.current_price);
    if (live != null) {
      return {
        unitNative: kriptoStoredUnitToUsd(live, safeRate, row.currency),
        priceSource: 'current_price',
      };
    }
    if (holding.avg_price != null && Number(holding.avg_price) > 0) {
      return {
        unitNative: legacyCryptoStoredUnitToUsd(Number(holding.avg_price), safeRate),
        priceSource: 'avg_price',
      };
    }
    return { unitNative: 0, priceSource: 'none' };
  }

  if (row.category_id === 'fon') {
    const unit = fonUnitNativeTry(row.current_price, holding.avg_price);
    const src =
      positivePrice(row.current_price) != null
        ? 'current_price'
        : holding.avg_price != null && Number(holding.avg_price) > 0
          ? 'avg_price'
          : 'none';
    return { unitNative: unit, priceSource: src };
  }

  const live = positivePrice(row.current_price);
  const avg = positivePrice(holding.avg_price);
  if (live != null) return { unitNative: live, priceSource: 'current_price' };
  if (avg != null) return { unitNative: avg, priceSource: 'avg_price' };
  return { unitNative: 0, priceSource: 'none' };
}

/**
 * @param {{ quantity: number, avg_price?: number | null }} holding
 * @param {{ category_id: string, current_price?: number | null, currency?: string | null }} asset
 * @param {number} usdTry
 */
function computeHoldingValues(holding, asset, usdTry) {
  const row = normalizeAssetRow(asset);
  const { unitNative, priceSource } = holdingMarketUnitNative(holding, row, usdTry);
  const qty = Number(holding.quantity) || 0;
  const valueNative = qty * unitNative;
  const safeRate = usdTry > 0 ? usdTry : 1;
  const usdNative = isUsdNativeCategory(row?.category_id);

  let valueTL;
  let valueUSD;
  if (usdNative) {
    valueUSD = valueNative;
    valueTL = valueNative * safeRate;
  } else {
    valueTL = valueNative;
    valueUSD = valueNative / safeRate;
  }

  return {
    unitNative,
    valueNative,
    valueTL,
    valueUSD,
    priceSource,
    unitCurrency: usdNative ? 'USD' : 'TRY',
  };
}

function normalizeAssetRow(asset) {
  if (!asset) return null;
  const raw = Array.isArray(asset) ? asset[0] : asset;
  if (!raw) return null;
  const a = { ...raw };
  if (a.symbol) a.symbol = String(a.symbol).replace(/^M\d+_/, '');
  return a;
}

/** lib/portfolio-holdings.ts — fiyatı olmayan pozitif miktarlı holding hazır değil. */
function isHoldingMarketPriceReady(holding, asset, usdTry) {
  const qty = Number(holding?.quantity) || 0;
  if (!(qty > 0)) return true;
  const row = normalizeAssetRow(asset);
  if (!row) return false;
  const { unitNative } = holdingMarketUnitNative(holding, row, usdTry);
  return unitNative > 0;
}

/**
 * lib/portfolio-performance.ts ile aynı toplam (yalnızca miktarı > 0 ve asset’i olan satırlar).
 * @param {Array<{ quantity: number, avg_price?: number | null, asset?: object | object[] | null }>} holdings
 */
function computePortfolioPerformanceValuesJs(holdings, usdTry) {
  const empty = { totalValueTL: 0, totalValueUSD: 0 };
  const withAsset = holdings
    .filter((h) => (Number(h.quantity) || 0) > 0)
    .map((h) => ({ ...h, asset: normalizeAssetRow(h.asset) }))
    .filter((h) => h.asset);
  if (withAsset.length === 0) return empty;

  const safeRate = usdTry > 0 ? usdTry : 1;
  let totalValueTL = 0;
  let totalValueUSD = 0;

  for (const h of withAsset) {
    const asset = h.asset;
    const { unitNative } = holdingMarketUnitNative(h, asset, safeRate);
    if (!(unitNative > 0)) continue;
    const isUSD = isUsdNativeCategory(asset.category_id);
    const rateTL = isUSD ? safeRate : 1;
    const rateUSD = isUSD ? 1 : 1 / safeRate;
    const value = (Number(h.quantity) || 0) * unitNative;
    totalValueTL += value * rateTL;
    totalValueUSD += value * rateUSD;
  }

  return { totalValueTL, totalValueUSD };
}

async function fetchUsdTryRate(sb) {
  const { data, error } = await sb
    .from('assets')
    .select('current_price')
    .eq('category_id', 'doviz')
    .eq('symbol', 'USD')
    .maybeSingle();
  if (error) throw error;
  const rate = Number(data?.current_price);
  return Number.isFinite(rate) && rate >= 5 ? rate : 35;
}

module.exports = {
  computeHoldingValues,
  computePortfolioPerformanceValuesJs,
  fetchUsdTryRate,
  isHoldingMarketPriceReady,
  isUsdNativeCategory,
  normalizeAssetRow,
};
