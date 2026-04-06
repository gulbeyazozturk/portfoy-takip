import type { AssetRow, HoldingRow } from '@/hooks/use-portfolio-core-data';
import { normalizeAsset } from '@/hooks/use-portfolio-core-data';
import { kriptoStoredUnitToUsd, legacyCryptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import { effectiveChange24hPctForDisplay } from '@/lib/effective-change-24h';
import { dailyPrevValueFromChangePct, fonUnitNativeTry } from '@/lib/fon-price-guards';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';

export type PortfolioPerformanceValues = {
  totalValueTL: number;
  costBasisTL: number;
  totalValueUSD: number;
  costBasisUSD: number;
  totalChangeAmtTL: number;
  totalChangePctTL: number | null;
  totalChangeAmtUSD: number;
  totalChangePctUSD: number | null;
  dailyChangeTL: number;
  dailyPctTL: number;
  dailyChangeUSD: number;
  dailyPctUSD: number;
};

type Row = HoldingRow & { asset: AssetRow };

/** Portföy / Trend üst kartı için tutar ve günlük-tümü metrikleri (filtrelenmiş holding listesiyle kullanılabilir). */
export function computePortfolioPerformanceValues(
  holdings: HoldingRow[],
  usdTry: number,
  opts?: { now?: Date },
): PortfolioPerformanceValues {
  const now = opts?.now ?? new Date();
  const empty: PortfolioPerformanceValues = {
    totalValueTL: 0,
    costBasisTL: 0,
    totalValueUSD: 0,
    costBasisUSD: 0,
    totalChangeAmtTL: 0,
    totalChangePctTL: null,
    totalChangeAmtUSD: 0,
    totalChangePctUSD: null,
    dailyChangeTL: 0,
    dailyPctTL: 0,
    dailyChangeUSD: 0,
    dailyPctUSD: 0,
  };

  const withAsset = holdings
    .map((h) => ({ ...h, asset: normalizeAsset(h.asset) }))
    .filter((h): h is Row => h.asset != null);
  if (withAsset.length === 0) return empty;

  let totalValueTL = 0;
  let costBasisTL = 0;
  let totalValueUSD = 0;
  let costBasisUSD = 0;
  let dailyChangeTL = 0;
  let dailyChangeUSD = 0;
  const safeRate = usdTry > 0 ? usdTry : 1;

  for (const h of withAsset) {
    const asset = h.asset;
    let unitNative = 0;
    if (asset.category_id === 'kripto') {
      const r = asset.current_price != null ? Number(asset.current_price) : NaN;
      if (Number.isFinite(r) && r > 0) {
        unitNative = kriptoStoredUnitToUsd(r, safeRate, asset.currency);
      } else if (h.avg_price != null) {
        unitNative = legacyCryptoStoredUnitToUsd(Number(h.avg_price), safeRate);
      }
    } else if (asset.category_id === 'fon') {
      unitNative = fonUnitNativeTry(asset.current_price, h.avg_price);
    } else {
      unitNative = Number(asset.current_price ?? h.avg_price ?? 0) || 0;
    }
    const costUnit =
      h.avg_price != null && h.avg_price > 0
        ? asset.category_id === 'kripto'
          ? legacyCryptoStoredUnitToUsd(Number(h.avg_price), safeRate, unitNative > 0 ? unitNative : undefined)
          : Number(h.avg_price)
        : unitNative;
    const isUSD = isUsdNativeCategory(asset.category_id);
    const rateTL = isUSD ? safeRate : 1;
    const rateUSD = isUSD ? 1 : 1 / safeRate;
    const value = h.quantity * unitNative;
    const costVal = h.quantity * (Number(costUnit) || 0);
    totalValueTL += value * rateTL;
    costBasisTL += costVal * rateTL;
    totalValueUSD += value * rateUSD;
    costBasisUSD += costVal * rateUSD;
    const effPct = effectiveChange24hPctForDisplay(
      asset.category_id,
      asset.change_24h_pct,
      asset.price_updated_at,
      now,
    );
    const { dailyDelta: dailyDeltaNative } = dailyPrevValueFromChangePct(value, effPct);
    dailyChangeTL += dailyDeltaNative * rateTL;
    dailyChangeUSD += dailyDeltaNative * rateUSD;
  }

  const totalChangeAmtTL = totalValueTL - costBasisTL;
  const totalChangePctTL =
    costBasisTL > 0 ? Math.round((totalChangeAmtTL / costBasisTL) * 10000) / 100 : null;
  const totalChangeAmtUSD = totalValueUSD - costBasisUSD;
  const totalChangePctUSD =
    costBasisUSD > 0 ? Math.round((totalChangeAmtUSD / costBasisUSD) * 10000) / 100 : null;

  const dailyPctTL =
    totalValueTL - dailyChangeTL > 0
      ? Math.round((dailyChangeTL / (totalValueTL - dailyChangeTL)) * 10000) / 100
      : 0;
  const dailyPctUSD =
    totalValueUSD - dailyChangeUSD > 0
      ? Math.round((dailyChangeUSD / (totalValueUSD - dailyChangeUSD)) * 10000) / 100
      : 0;

  return {
    totalValueTL,
    costBasisTL,
    totalValueUSD,
    costBasisUSD,
    totalChangeAmtTL,
    totalChangePctTL,
    totalChangeAmtUSD,
    totalChangePctUSD,
    dailyChangeTL,
    dailyPctTL,
    dailyChangeUSD,
    dailyPctUSD,
  };
}
