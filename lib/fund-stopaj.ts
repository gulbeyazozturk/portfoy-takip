/**
 * GVK Geçici 67 kapsamında yatırım fonu stopaj oranı (%, 0–100).
 * Hukuki tavsiye değildir; bilgi amaçlı simülasyon.
 */

import type { FundTaxClassification } from './fund-tax-classification';

/** İktisap tarihine göre “diğer menkul kıymet yatırım fonları” stopaj dönemleri (Ziraat tablosu). */
const OTHER_FUND_RATE_PERIODS: ReadonlyArray<{ from: string; rate: number }> = [
  { from: '1900-01-01', rate: 10 },
  { from: '2020-12-23', rate: 10 },
  { from: '2024-05-01', rate: 0 },
  { from: '2024-11-01', rate: 7.5 },
  { from: '2025-02-01', rate: 10 },
  { from: '2025-07-09', rate: 17.5 },
];

/** Değişken / karma / serbest (hisse yoğun değil) / döviz vb. */
const VARIABLE_LIKE_RATE_PERIODS: ReadonlyArray<{ from: string; rate: number }> = [
  { from: '1900-01-01', rate: 10 },
  { from: '2025-02-01', rate: 15 },
  { from: '2025-07-09', rate: 17.5 },
];

const NON_TEFAS_SERbest_HISSE_YOGUN_FROM = '2026-03-27';
const GYF_GSYF_LONG_TERM_DAYS = 730;

export type FundStopajSchedule = {
  referenceRatePct: number;
  periods: Array<{ from: string; ratePct: number; label: string }>;
  rules: {
    isHisseYogun: boolean;
    isSerbest: boolean;
    tefasListed: boolean;
    fundKind: string;
    gyfGsyfLongTermDays: number;
    nonTefasSerbestHisseYogunFrom: string;
  };
};

export type FundStopajInput = {
  classification: FundTaxClassification;
  acquisitionDate?: string | null;
  holdingDays?: number | null;
  asOfDate?: string;
};

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+03:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function rateFromPeriods(
  periods: ReadonlyArray<{ from: string; rate: number }>,
  acquisitionDate: string | null | undefined,
  fallbackRate: number,
): number {
  if (!acquisitionDate) return fallbackRate;
  let chosen = periods[0]?.rate ?? fallbackRate;
  for (const p of periods) {
    if (acquisitionDate >= p.from) chosen = p.rate;
  }
  return chosen;
}

function isVariableLikeFund(c: FundTaxClassification): boolean {
  const cat = (c.category ?? '').toLowerCase();
  const umbrella = (c.umbrellaType ?? '').toLowerCase();
  const name = c.fundName.toUpperCase();
  if (c.isHisseYogun) return false;
  if (c.fundKind === 'GYF' || c.fundKind === 'GSYF') return false;
  return (
    cat.includes('değişken') ||
    cat.includes('degisken') ||
    cat.includes('karma') ||
    cat.includes('serbest') ||
    cat.includes('fon sepet') ||
    cat.includes('eurobond') ||
    cat.includes('yabancı') ||
    cat.includes('yabanci') ||
    cat.includes('döviz') ||
    cat.includes('doviz') ||
    cat.includes('dış borç') ||
    cat.includes('dis borc') ||
    umbrella.includes('değişken') ||
    umbrella.includes('karma') ||
    umbrella.includes('serbest') ||
    umbrella.includes('fon sepet') ||
    name.includes('EUROBOND') ||
    name.includes('YABANCI') ||
    name.includes('DÖVİZ') ||
    name.includes('DOVIZ') ||
    name.includes('Dış BORÇ') ||
    name.includes('DIS BORC')
  );
}

/** Belirli iktisap tarihi + elde tutma süresi ile stopaj % (0–100). */
export function computeFundStopajRatePct(input: FundStopajInput): number {
  const { classification: c, acquisitionDate, holdingDays, asOfDate } = input;
  const today =
    asOfDate ??
    new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

  if (c.fundKind === 'GYF' || c.fundKind === 'GSYF') {
    const days =
      holdingDays ??
      (acquisitionDate ? daysBetween(acquisitionDate, today) : 0);
    return days >= GYF_GSYF_LONG_TERM_DAYS ? 0 : rateFromPeriods(OTHER_FUND_RATE_PERIODS, acquisitionDate, 17.5);
  }

  if (c.isHisseYogun) {
    if (c.isSerbest && !c.tefasListed) {
      if (acquisitionDate && acquisitionDate >= NON_TEFAS_SERbest_HISSE_YOGUN_FROM) {
        return 17.5;
      }
      if (!acquisitionDate) {
        return 17.5;
      }
      return 0;
    }
    return 0;
  }

  if (isVariableLikeFund(c)) {
    return rateFromPeriods(VARIABLE_LIKE_RATE_PERIODS, acquisitionDate, 17.5);
  }

  return rateFromPeriods(OTHER_FUND_RATE_PERIODS, acquisitionDate, 17.5);
}

/** DB/cache için referans stopaj + dönem tablosu (iktisap tarihi bilinmiyorsa referenceRatePct). */
export function buildFundStopajSchedule(classification: FundTaxClassification): FundStopajSchedule {
  const referenceRatePct = computeFundStopajRatePct({
    classification,
    acquisitionDate: null,
    holdingDays: 0,
  });

  const periods: FundStopajSchedule['periods'] = [];

  if (classification.fundKind === 'GYF' || classification.fundKind === 'GSYF') {
    periods.push(
      { from: '1900-01-01', ratePct: 17.5, label: '2 yıldan kısa' },
      { from: '1900-01-01', ratePct: 0, label: '2 yıl ve üzeri' },
    );
  } else if (classification.isHisseYogun) {
    if (classification.isSerbest && !classification.tefasListed) {
      periods.push(
        { from: '1900-01-01', ratePct: 0, label: '27.03.2026 öncesi iktisap' },
        { from: NON_TEFAS_SERbest_HISSE_YOGUN_FROM, ratePct: 17.5, label: 'TEFAS dışı serbest HY' },
      );
    } else {
      periods.push({ from: '1900-01-01', ratePct: 0, label: 'Hisse senedi yoğun' });
    }
  } else if (isVariableLikeFund(classification)) {
    for (const p of VARIABLE_LIKE_RATE_PERIODS) {
      periods.push({ from: p.from, ratePct: p.rate, label: 'Değişken benzeri' });
    }
  } else {
    for (const p of OTHER_FUND_RATE_PERIODS) {
      periods.push({ from: p.from, ratePct: p.rate, label: 'Diğer fon' });
    }
  }

  return {
    referenceRatePct,
    periods,
    rules: {
      isHisseYogun: classification.isHisseYogun,
      isSerbest: classification.isSerbest,
      tefasListed: classification.tefasListed,
      fundKind: classification.fundKind,
      gyfGsyfLongTermDays: GYF_GSYF_LONG_TERM_DAYS,
      nonTefasSerbestHisseYogunFrom: NON_TEFAS_SERbest_HISSE_YOGUN_FROM,
    },
  };
}

export type FundSellProceedsInput = {
  quantity: number;
  currentPrice: number;
  avgCost: number | null | undefined;
  stopajRatePct: number;
};

export type FundSellProceedsResult = {
  grossValue: number;
  costBasis: number;
  taxableGain: number;
  stopajAmount: number;
  netProceeds: number;
  stopajRatePct: number;
};

/** Bugün satış simülasyonu: brüt değer, vergi matrahı, stopaj, net ele geçen. */
export function computeFundSellProceeds(input: FundSellProceedsInput): FundSellProceedsResult {
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const currentPrice = Math.max(0, Number(input.currentPrice) || 0);
  const avgCost = input.avgCost != null && Number.isFinite(Number(input.avgCost)) ? Number(input.avgCost) : 0;
  const stopajRatePct = Math.max(0, Math.min(100, Number(input.stopajRatePct) || 0));

  const grossValue = quantity * currentPrice;
  const costBasis = quantity * avgCost;
  const taxableGain = Math.max(0, grossValue - costBasis);
  const stopajAmount = taxableGain * (stopajRatePct / 100);
  const netProceeds = grossValue - stopajAmount;

  return {
    grossValue,
    costBasis,
    taxableGain,
    stopajAmount,
    netProceeds,
    stopajRatePct,
  };
}
