import { normalizePortfolioNameKey } from '@/lib/portfolio-name-normalize';

/** Portföy adı eşlemesi: boşluk yok, Türkçe küçük harf (bulk CSV ile aynı kural) */
export function portfolioNameLooseKey(value: string | null | undefined): string {
  return normalizePortfolioNameKey((value ?? '').toString());
}

export const LEGACY_DEFAULT_PORTFOLIO_NAME = 'Portföyüm';
export const DEFAULT_MAIN_PORTFOLIO_NAME = 'Ana Portföy';
export const DEFAULT_MAIN_PORTFOLIO_NAME_EN = 'Main portfolio';

const DEFAULT_MAIN_LOOSE_KEYS = new Set([
  portfolioNameLooseKey(DEFAULT_MAIN_PORTFOLIO_NAME),
  portfolioNameLooseKey(DEFAULT_MAIN_PORTFOLIO_NAME_EN),
  portfolioNameLooseKey(LEGACY_DEFAULT_PORTFOLIO_NAME),
]);

export function isDefaultPortfolioLooseKey(loose: string): boolean {
  return DEFAULT_MAIN_LOOSE_KEYS.has(loose);
}

export function portfolioListHasDefaultAlias(names: string[]): boolean {
  return names.some((n) => DEFAULT_MAIN_LOOSE_KEYS.has(portfolioNameLooseKey(n)));
}

export function portfolioLooseExistsInList(
  portList: { id: string; name: string }[],
  loose: string,
): boolean {
  if (
    portList.some(
      (x) =>
        portfolioNameLooseKey(x.name) === loose || portfolioNameLooseKey(x.id) === loose,
    )
  ) {
    return true;
  }
  if (isDefaultPortfolioLooseKey(loose) && portfolioListHasDefaultAlias(portList.map((p) => p.name))) {
    return true;
  }
  return false;
}

export function findPortfolioRowByCsvName<T extends { id: string; name: string }>(
  portList: T[],
  rowPortfolioName: string,
): T | undefined {
  const loose = portfolioNameLooseKey(rowPortfolioName.trim());
  const byExact = portList.find(
    (x) =>
      portfolioNameLooseKey(x.name) === loose || portfolioNameLooseKey(x.id) === loose,
  );
  if (byExact) return byExact;
  if (isDefaultPortfolioLooseKey(loose)) {
    return portList.find((x) => isDefaultPortfolioLooseKey(portfolioNameLooseKey(x.name)));
  }
  return undefined;
}
