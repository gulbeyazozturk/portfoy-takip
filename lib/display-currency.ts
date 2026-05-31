/** UI tutar gösterimi: USD `$` ve TRY `₺` önek (sonda " TL" yok). */

export type DisplayCurrency = 'TL' | 'USD';

export const TRY_CURRENCY_PREFIX = '₺';
export const USD_CURRENCY_PREFIX = '$';

export function displayCurrencyPrefix(currency: DisplayCurrency): string {
  return currency === 'USD' ? USD_CURRENCY_PREFIX : TRY_CURRENCY_PREFIX;
}

export function displayCurrencyLocale(currency: DisplayCurrency, locale: string): string {
  return currency === 'USD' ? 'en-US' : locale;
}

type FormatMoneyOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export function formatDisplayMoney(
  value: number,
  currency: DisplayCurrency,
  locale: string,
  options: FormatMoneyOptions = {},
): string {
  const min = options.minimumFractionDigits ?? 2;
  const max = options.maximumFractionDigits ?? 2;
  const loc = displayCurrencyLocale(currency, locale);
  const n = Number.isFinite(value) ? value : 0;
  const body = Math.abs(n).toLocaleString(loc, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
  const prefix = displayCurrencyPrefix(currency);
  if (n < 0) return `-${prefix}${body}`;
  return `${prefix}${body}`;
}

/** Kuruşsuz, yukarı yuvarlı tam tutar (portföy özeti). */
export function formatDisplayMoneyCeil(
  value: number,
  currency: DisplayCurrency,
  locale: string,
): string {
  const loc = displayCurrencyLocale(currency, locale);
  const n = Number.isFinite(value) ? value : 0;
  const body = Math.ceil(Math.abs(n)).toLocaleString(loc, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
  const prefix = displayCurrencyPrefix(currency);
  if (n < 0) return `-${prefix}${body}`;
  return `${prefix}${body}`;
}

/** P/L satırı: ₺486,60 (%2,99) */
export function formatDisplayPlLine(
  amount: number,
  pct: number,
  currency: DisplayCurrency,
  locale: string,
): { text: string; neutral: boolean; up: boolean } {
  const neutral = Math.abs(pct) < 0.005 && Math.abs(amount) < 0.005;
  const up = amount >= 0;
  const pctAbs = Math.abs(pct).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const signedAmt = formatDisplayMoney(amount, currency, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const signedPct = pct >= 0 ? pctAbs : `-${pctAbs}`;
  return { text: `${signedAmt} (%${signedPct})`, neutral, up };
}

/** Delta tutarı: +₺1.234 veya -$56 */
export function formatDisplaySignedMoney(
  value: number,
  currency: DisplayCurrency,
  locale: string,
  options: FormatMoneyOptions = { minimumFractionDigits: 0, maximumFractionDigits: 0 },
): string {
  const loc = displayCurrencyLocale(currency, locale);
  const prefix = displayCurrencyPrefix(currency);
  const body = Math.abs(value).toLocaleString(loc, {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
  });
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${prefix}${body}`;
}

/** Grafik ekseni: değişken ondalık hassasiyet. */
export function formatDisplayMoneyFlexible(
  value: number,
  currency: DisplayCurrency,
  locale: string,
): string {
  const abs = Math.abs(value);
  let maxDec = 2;
  if (abs > 0 && abs < 0.01) maxDec = 10;
  else if (abs >= 0.01 && abs < 1) maxDec = 6;
  else if (abs >= 1 && abs < 10) maxDec = 4;
  const loc = displayCurrencyLocale(currency, locale);
  const formatted = abs.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: maxDec });
  const trimmed = formatted.replace(/0+$/, '').replace(/[,.]$/, '');
  const prefix = displayCurrencyPrefix(currency);
  if (value < 0) return `-${prefix}${trimmed}`;
  return `${prefix}${trimmed}`;
}
