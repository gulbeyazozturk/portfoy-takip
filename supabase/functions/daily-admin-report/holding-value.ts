import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

function positivePrice(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isUsdNativeCategory(categoryId: string | undefined) {
  return categoryId === 'yurtdisi' || categoryId === 'kripto';
}

function legacyCryptoStoredUnitToUsd(unitPrice: number, usdTryRate: number, referenceUsd?: number) {
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

function kriptoStoredUnitToUsd(
  unitPrice: number,
  usdTryRate: number,
  storedCurrency?: string | null,
) {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return unitPrice;
  const c = (storedCurrency ?? '').trim().toUpperCase();
  if (c === 'TRY' || c === 'TL') {
    if (!Number.isFinite(usdTryRate) || usdTryRate < 5) return unitPrice;
    return unitPrice / usdTryRate;
  }
  return legacyCryptoStoredUnitToUsd(unitPrice, usdTryRate);
}

function fonUnitNativeTry(currentPrice: number | null | undefined, avgPrice: number | null | undefined) {
  const raw = currentPrice != null ? Number(currentPrice) : NaN;
  const avg = avgPrice != null ? Number(avgPrice) : NaN;
  const avgOk = Number.isFinite(avg) && avg > 0;
  if (raw === -100 || (Number.isFinite(raw) && raw < 0)) return avgOk ? avg : 0;
  if (Number.isFinite(raw) && raw > 0) return raw;
  return avgOk ? avg : 0;
}

export function roundMoney(n: number) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function normalizeAssetRow(
  asset:
    | {
        symbol?: string;
        category_id?: string;
        current_price?: number | null;
        currency?: string | null;
        name?: string;
      }
    | null
    | undefined,
) {
  if (!asset) return null;
  const a = { ...asset };
  if (a.symbol) a.symbol = String(a.symbol).replace(/^M\d+_/, '');
  return a;
}

function holdingMarketUnitNative(
  holding: { avg_price?: number | null },
  asset: ReturnType<typeof normalizeAssetRow>,
  usdTry: number,
): { unitNative: number; priceSource: 'current_price' | 'avg_price' | 'none' } {
  if (!asset) return { unitNative: 0, priceSource: 'none' };
  const safeRate = usdTry > 0 ? usdTry : 1;

  if (asset.category_id === 'kripto') {
    const live = positivePrice(asset.current_price);
    if (live != null) {
      return { unitNative: kriptoStoredUnitToUsd(live, safeRate, asset.currency), priceSource: 'current_price' };
    }
    if (holding.avg_price != null && Number(holding.avg_price) > 0) {
      return {
        unitNative: legacyCryptoStoredUnitToUsd(Number(holding.avg_price), safeRate),
        priceSource: 'avg_price',
      };
    }
    return { unitNative: 0, priceSource: 'none' };
  }

  if (asset.category_id === 'fon') {
    const unit = fonUnitNativeTry(asset.current_price, holding.avg_price);
    const priceSource = positivePrice(asset.current_price)
      ? 'current_price'
      : holding.avg_price != null && Number(holding.avg_price) > 0
        ? 'avg_price'
        : 'none';
    return { unitNative: unit, priceSource };
  }

  const live = positivePrice(asset.current_price);
  const avg = positivePrice(holding.avg_price);
  if (live != null) return { unitNative: live, priceSource: 'current_price' };
  if (avg != null) return { unitNative: avg, priceSource: 'avg_price' };
  return { unitNative: 0, priceSource: 'none' };
}

export function computePortfolioPerformanceValuesJs(
  holdings: { quantity: number; avg_price?: number | null; asset?: ReturnType<typeof normalizeAssetRow> }[],
  usdTry: number,
) {
  const withAsset = holdings
    .filter((h) => (Number(h.quantity) || 0) > 0)
    .map((h) => ({ ...h, asset: normalizeAssetRow(h.asset ?? null) }))
    .filter((h) => h.asset);
  if (withAsset.length === 0) return { totalValueTL: 0, totalValueUSD: 0 };

  const safeRate = usdTry > 0 ? usdTry : 1;
  let totalValueTL = 0;
  let totalValueUSD = 0;
  for (const h of withAsset) {
    const asset = h.asset!;
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

export function computeHoldingValues(
  holding: { quantity: number; avg_price?: number | null },
  asset: { category_id?: string; current_price?: number | null; currency?: string | null },
  usdTry: number,
) {
  const row = normalizeAssetRow(asset);
  const { unitNative, priceSource } = holdingMarketUnitNative(holding, row, usdTry);
  const qty = Number(holding.quantity) || 0;
  const valueNative = qty * unitNative;
  const safeRate = usdTry > 0 ? usdTry : 1;
  const usdNative = isUsdNativeCategory(row?.category_id);
  let valueTL: number;
  let valueUSD: number;
  if (usdNative) {
    valueUSD = valueNative;
    valueTL = valueNative * safeRate;
  } else {
    valueTL = valueNative;
    valueUSD = valueNative / safeRate;
  }

  return {
    unitNative,
    valueTL,
    valueUSD,
    priceSource,
    unitCurrency: usdNative ? 'USD' : 'TRY',
  };
}

export async function fetchUsdTryRate(sb: SupabaseClient) {
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

export type AssetRow = {
  email: string;
  portfolioName: string;
  category: string;
  symbol: string;
  assetName: string;
  quantity: number;
  unitPrice: number | null;
  unitCurrency: string;
  priceSource: string;
  valueTL: number | null;
  valueUSD: number | null;
};

export async function fetchPortfolioBlock(
  sb: SupabaseClient,
  users: { id: string; email?: string }[],
) {
  const usdTry = await fetchUsdTryRate(sb);
  const emailById = new Map(users.map((u) => [u.id, u.email || '(e-posta yok)']));

  const { data: portfolios, error: pErr } = await sb
    .from('portfolios')
    .select('id, name, user_id, currency')
    .not('user_id', 'is', null);
  if (pErr) throw pErr;
  const portList = portfolios || [];
  const portfolioIds = portList.map((p) => p.id);
  const portById = new Map(portList.map((p) => [p.id, p]));

  let holdings: {
    portfolio_id: string;
    asset_id: string;
    quantity: number;
    avg_price: number | null;
  }[] = [];
  if (portfolioIds.length) {
    const { data: hData, error: hErr } = await sb
      .from('holdings')
      .select('portfolio_id, asset_id, quantity, avg_price')
      .in('portfolio_id', portfolioIds);
    if (hErr) throw hErr;
    holdings = (hData || []) as typeof holdings;
  }

  const assetIds = [...new Set(holdings.map((h) => h.asset_id))];
  let assets: {
    id: string;
    name: string;
    symbol: string;
    category_id: string;
    current_price: number | null;
    currency: string | null;
  }[] = [];
  if (assetIds.length) {
    const { data: aData, error: aErr } = await sb
      .from('assets')
      .select('id, name, symbol, category_id, current_price, currency')
      .in('id', assetIds);
    if (aErr) throw aErr;
    assets = (aData || []) as typeof assets;
  }
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const holdingsByPortfolio = new Map<string, number>();
  const holdingsGrouped = new Map<
    string,
    { quantity: number; avg_price: number | null; asset: ReturnType<typeof normalizeAssetRow> }[]
  >();
  for (const h of holdings) {
    const qty = Number(h.quantity) || 0;
    if (!(qty > 0)) continue;
    holdingsByPortfolio.set(h.portfolio_id, (holdingsByPortfolio.get(h.portfolio_id) || 0) + 1);
    if (!holdingsGrouped.has(h.portfolio_id)) holdingsGrouped.set(h.portfolio_id, []);
    holdingsGrouped.get(h.portfolio_id)!.push({
      quantity: qty,
      avg_price: h.avg_price,
      asset: normalizeAssetRow(assetById.get(h.asset_id)),
    });
  }

  const portfolioValueTL = new Map<string, number>();
  const portfolioValueUSD = new Map<string, number>();
  let totalValueTL = 0;
  let totalValueUSD = 0;
  for (const p of portList) {
    const perf = computePortfolioPerformanceValuesJs(holdingsGrouped.get(p.id) || [], usdTry);
    const tl = roundMoney(perf.totalValueTL) ?? 0;
    const usd = roundMoney(perf.totalValueUSD) ?? 0;
    portfolioValueTL.set(p.id, tl);
    portfolioValueUSD.set(p.id, usd);
    totalValueTL += tl;
    totalValueUSD += usd;
  }

  const assetRows: AssetRow[] = [];
  for (const h of holdings) {
    const qty = Number(h.quantity) || 0;
    if (!(qty > 0)) continue;
    const port = portById.get(h.portfolio_id);
    const asset = normalizeAssetRow(assetById.get(h.asset_id));
    const vals = computeHoldingValues(h, asset || {}, usdTry);

    const priceSourceLabel =
      vals.priceSource === 'current_price'
        ? 'güncel fiyat'
        : vals.priceSource === 'avg_price'
          ? 'maliyet (avg)'
          : 'fiyat yok';

    assetRows.push({
      email: emailById.get(port?.user_id || '') || '?',
      portfolioName: port?.name || '?',
      category: asset?.category_id || '?',
      symbol: asset?.symbol || '?',
      assetName: asset?.name || '?',
      quantity: qty,
      unitPrice: vals.unitNative > 0 ? roundMoney(vals.unitNative) : null,
      unitCurrency: vals.unitCurrency,
      priceSource: priceSourceLabel,
      valueTL: roundMoney(vals.valueTL),
      valueUSD: roundMoney(vals.valueUSD),
    });
  }

  assetRows.sort((a, b) => {
    return (
      a.email.localeCompare(b.email, 'tr') ||
      a.portfolioName.localeCompare(b.portfolioName, 'tr') ||
      a.category.localeCompare(b.category) ||
      a.symbol.localeCompare(b.symbol)
    );
  });

  return {
    portfolios: portList,
    holdingsByPortfolio,
    portfolioValueTL,
    portfolioValueUSD,
    assets: assetRows,
    usdTry: roundMoney(usdTry)!,
    totalValueTL: roundMoney(totalValueTL)!,
    totalValueUSD: roundMoney(totalValueUSD)!,
  };
}
