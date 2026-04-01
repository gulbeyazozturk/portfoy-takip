export function stripQuotes(value: string): string {
  return (value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

export function turkishLower(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ş/g, 'ş')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    .toLowerCase();
}

/** Collapsed, locale-aware key for comparing portfolio display names (quotes, spacing, Turkish İ/I). */
export function normalizePortfolioNameKey(name: string): string {
  const t = (name ?? '').toString().trim();
  return turkishLower(stripQuotes(t)).replace(/\s+/g, '');
}

export function portfolioNamesConflict(a: string, b: string): boolean {
  return normalizePortfolioNameKey(a) === normalizePortfolioNameKey(b);
}
