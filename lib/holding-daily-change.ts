/**
 * Holding günlük %: gece taşınan pozisyon önceki kapanışa (change_24h_pct) göredir.
 * Aynı işlem/takvim gününde açılan pozisyonda günlük, ortalama maliyetten sonraki harekettir;
 * alıştan önceki piyasa artışı kâr yazılmaz.
 *
 * Alış günü: `[cost_date:YYYY-MM-DD]` varsa o; yoksa `created_at` (kategori saat dilimi).
 * Tarihsiz CSV içe aktarımında created_at bugün olduğu için bir seans boyunca maliyetten günlük
 * görünür; ertesi işlem gününde piyasa günlüğüne döner.
 */

import { legacyCryptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import {
  dailyChangeTimeZone,
  displayedDailySessionDate,
  effectiveChange24hPctForDisplay,
} from '@/lib/effective-change-24h';
import { extractCostDateFromNotes } from '@/lib/holding-notes-cost-date';
import { calendarDateInTimeZone } from '@/lib/trading-day-display';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type HoldingDailyChangeInput = {
  categoryId: string;
  change24hPct: number | null | undefined;
  priceUpdatedAt: string | null | undefined;
  /** Piyasa birim fiyatı (varlık para biriminde). */
  unitNative: number;
  avgPrice: number | null | undefined;
  createdAt: string | null | undefined;
  notes?: string | null;
  costDateIso?: string | null;
  usdTry: number;
  now?: Date;
};

function isoDateOrNull(value: string | null | undefined): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  return value;
}

/** Alış günü: nottaki cost_date, yoksa created_at (kategori saat diliminde). */
export function holdingEntryDateIso(input: {
  categoryId: string;
  createdAt?: string | null;
  notes?: string | null;
  costDateIso?: string | null;
}): string | null {
  const tagged = isoDateOrNull(input.costDateIso) ?? extractCostDateFromNotes(input.notes);
  if (tagged) return tagged;
  if (!input.createdAt) return null;
  const t = Date.parse(input.createdAt);
  if (!Number.isFinite(t)) return null;
  return calendarDateInTimeZone(new Date(t), dailyChangeTimeZone(input.categoryId));
}

export function holdingOpenedOnDisplayedSession(
  input: {
    categoryId: string;
    priceUpdatedAt?: string | null;
    createdAt?: string | null;
    notes?: string | null;
    costDateIso?: string | null;
    now?: Date;
  },
): boolean {
  const session = displayedDailySessionDate(
    input.categoryId,
    input.priceUpdatedAt,
    input.now ?? new Date(),
  );
  if (!session) return false;
  const entry = holdingEntryDateIso(input);
  return entry != null && entry === session;
}

export function holdingAvgPriceNative(
  categoryId: string,
  avgPrice: number | null | undefined,
  unitNative: number,
  usdTry: number,
): number | null {
  if (avgPrice == null) return null;
  const n = Number(avgPrice);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (categoryId === 'kripto') {
    const usd = legacyCryptoStoredUnitToUsd(n, usdTry > 0 ? usdTry : 1, unitNative > 0 ? unitNative : undefined);
    return usd > 0 && Number.isFinite(usd) ? usd : null;
  }
  return n;
}

function costBasedChangePct(unitNative: number, avgNative: number): number | null {
  if (!(unitNative > 0) || !(avgNative > 0)) return null;
  const pct = ((unitNative - avgNative) / avgNative) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/**
 * Liste / özet günlük %: aynı gün girişte maliyetten; aksi halde varlık change_24h_pct.
 * Aynı gün girişte maliyet yoksa piyasa günlük hareketi kâr yazılmaz (0).
 */
export function effectiveHoldingDailyChangePct(input: HoldingDailyChangeInput): number | null {
  const now = input.now ?? new Date();
  const market = effectiveChange24hPctForDisplay(
    input.categoryId,
    input.change24hPct,
    input.priceUpdatedAt,
    now,
  );

  if (
    !holdingOpenedOnDisplayedSession({
      categoryId: input.categoryId,
      priceUpdatedAt: input.priceUpdatedAt,
      createdAt: input.createdAt,
      notes: input.notes,
      costDateIso: input.costDateIso,
      now,
    })
  ) {
    return market;
  }

  const avgNative = holdingAvgPriceNative(
    input.categoryId,
    input.avgPrice,
    input.unitNative,
    input.usdTry,
  );
  const fromCost = avgNative != null ? costBasedChangePct(input.unitNative, avgNative) : null;
  if (fromCost != null) return fromCost;
  return 0;
}
