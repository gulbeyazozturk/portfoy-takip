import { classifyFundTax } from './fund-tax-classification';
import type { FundTaxMetadataMap } from './fund-tax-metadata';
import { resolveFundStopajPctFromRow } from './fund-tax-metadata';
import { extractCostDateFromNotes } from './holding-notes-cost-date';
import { computeFundSellProceeds, computeFundStopajRatePct } from './fund-stopaj';
import { isUsdNativeCategory } from './portfolio-currency';
import { holdingMarketUnitNative, normalizeAsset, type HoldingRow } from './portfolio-holdings';
import { MIN_VALID_USD_TRY_RATE } from './usdtry-cache';

export type NetPortfolioCategoryTotals = {
  grossTL: number;
  grossUSD: number;
  netTL: number;
  netUSD: number;
  stopajTL: number;
};

export type NetPortfolioSummary = {
  totalGrossTL: number;
  totalGrossUSD: number;
  totalNetTL: number;
  totalNetUSD: number;
  totalStopajTL: number;
  byCategory: Record<string, NetPortfolioCategoryTotals>;
};

function isoDateFromCreatedAt(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const m = createdAt.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

function holdingDaysFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  const from = new Date(`${iso}T12:00:00+03:00`);
  const to = new Date(`${today}T12:00:00+03:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function resolveFundStopajPct(
  symbol: string,
  fundName: string,
  metadata: FundTaxMetadataMap,
  acquisitionDate: string | null,
  holdingDays: number | null,
): number {
  const meta = metadata.get(symbol.toUpperCase());
  if (meta) {
    return resolveFundStopajPctFromRow(meta, { acquisitionDate, holdingDays });
  }

  const classification = classifyFundTax({
    symbol,
    fundKind: 'YAT',
    fundName,
    tefasListed: true,
  });
  return computeFundStopajRatePct({ classification, acquisitionDate, holdingDays });
}

/** Bugün satış simülasyonu: kategori bazında brüt / net (fon stopajı düşülmüş). */
export function computeNetPortfolioSummary(
  holdings: HoldingRow[],
  usdTry: number,
  fundTaxMetadata: FundTaxMetadataMap,
): NetPortfolioSummary {
  const rate = usdTry > MIN_VALID_USD_TRY_RATE ? usdTry : 1;
  const byCategory: Record<string, NetPortfolioCategoryTotals> = {};

  const ensure = (categoryId: string): NetPortfolioCategoryTotals => {
    if (!byCategory[categoryId]) {
      byCategory[categoryId] = { grossTL: 0, grossUSD: 0, netTL: 0, netUSD: 0, stopajTL: 0 };
    }
    return byCategory[categoryId];
  };

  for (const h of holdings) {
    const asset = normalizeAsset(h.asset);
    if (!asset || !(h.quantity > 0)) continue;

    const { unitNative: spot } = holdingMarketUnitNative(h, usdTry);
    if (!(spot > 0)) continue;

    const categoryId = asset.category_id;
    const bucket = ensure(categoryId);
    const isUsdNative = isUsdNativeCategory(categoryId);

    if (categoryId === 'fon') {
      const acquisitionDate =
        extractCostDateFromNotes(h.notes) ?? isoDateFromCreatedAt(h.created_at);
      const holdingDays = holdingDaysFromIso(acquisitionDate);
      const stopajPct = resolveFundStopajPct(
        asset.symbol,
        asset.name,
        fundTaxMetadata,
        acquisitionDate,
        holdingDays,
      );
      const proceeds = computeFundSellProceeds({
        quantity: h.quantity,
        currentPrice: spot,
        avgCost: h.avg_price,
        stopajRatePct: stopajPct,
      });

      bucket.grossTL += proceeds.grossValue;
      bucket.netTL += proceeds.netProceeds;
      bucket.stopajTL += proceeds.stopajAmount;
      bucket.grossUSD += proceeds.grossValue / rate;
      bucket.netUSD += proceeds.netProceeds / rate;
      continue;
    }

    const valueNative = h.quantity * spot;
    const grossTL = isUsdNative ? valueNative * rate : valueNative;
    const grossUSD = isUsdNative ? valueNative : valueNative / rate;

    bucket.grossTL += grossTL;
    bucket.grossUSD += grossUSD;
    bucket.netTL += grossTL;
    bucket.netUSD += grossUSD;
  }

  let totalGrossTL = 0;
  let totalGrossUSD = 0;
  let totalNetTL = 0;
  let totalNetUSD = 0;
  let totalStopajTL = 0;

  for (const row of Object.values(byCategory)) {
    totalGrossTL += row.grossTL;
    totalGrossUSD += row.grossUSD;
    totalNetTL += row.netTL;
    totalNetUSD += row.netUSD;
    totalStopajTL += row.stopajTL;
  }

  return {
    totalGrossTL,
    totalGrossUSD,
    totalNetTL,
    totalNetUSD,
    totalStopajTL,
    byCategory,
  };
}
