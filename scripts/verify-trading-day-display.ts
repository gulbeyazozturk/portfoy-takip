/**
 * Günlük % takvim mantığı — hızlı doğrulama: npx tsx scripts/verify-trading-day-display.ts
 */
import {
  nextTradingDayAfter,
  shouldShowCalendarDayChange,
  shouldShowTradingDayChange,
  TZ_TR,
} from '../lib/trading-day-display';
import {
  effectiveChange24hPctForDisplay,
  holdingDailyChangePctForDisplay,
  holdingOpenedOnCurrentDisplayDay,
  isHoldingFillNewerThanQuote,
  shouldMarkHoldingAtCost,
} from '../lib/effective-change-24h';
import { holdingMarketUnitNative, type HoldingRow } from '../lib/portfolio-holdings';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(shouldShowTradingDayChange('2026-05-22', '2026-05-22', TZ_TR), 'Friday 22:00 same day');
assert(shouldShowTradingDayChange('2026-05-22', '2026-05-23', TZ_TR), 'Saturday hold Friday');
assert(!shouldShowTradingDayChange('2026-05-22', '2026-05-25', TZ_TR), 'Monday reset Friday');
assert(nextTradingDayAfter('2026-05-22', TZ_TR) === '2026-05-25', 'next trading after Fri');

const fri22 = new Date('2026-05-22T22:00:00+03:00');
const pct = effectiveChange24hPctForDisplay('bist', 1.5, '2026-05-22T17:00:00+03:00', fri22);
assert(pct === 1.5, 'BIST shows % at 22:00');

const sat = new Date('2026-05-23T12:00:00+03:00');
const satPct = effectiveChange24hPctForDisplay('bist', 1.5, '2026-05-22T17:00:00+03:00', sat);
assert(satPct === 1.5, 'BIST weekend hold');

assert(!shouldShowCalendarDayChange('2026-05-24', '2026-05-25'), 'kripto new day');
assert(shouldShowCalendarDayChange('2026-05-25', '2026-05-25'), 'kripto same day');

/** IGV: Cuma 15:40 TSİ alım, kotasyon önceki kapanış — maliyetle değerle. */
const friBuyTs = '2026-08-14T12:40:00.000Z';
const thuQuoteTs = '2026-08-13T20:00:00.000Z';
const friMorningTr = new Date('2026-08-14T15:40:00+03:00');
assert(holdingOpenedOnCurrentDisplayDay('yurtdisi', friBuyTs, friMorningTr), 'US opened today');
assert(isHoldingFillNewerThanQuote(friBuyTs, thuQuoteTs), 'fill after Thursday close');
assert(
  shouldMarkHoldingAtCost({
    categoryId: 'yurtdisi',
    priceUpdatedAt: thuQuoteTs,
    change24hPct: 1.2,
    holdingCreatedAt: friBuyTs,
    now: friMorningTr,
  }),
  'stale close vs same-day fill',
);
assert(
  holdingDailyChangePctForDisplay({
    categoryId: 'yurtdisi',
    priceUpdatedAt: thuQuoteTs,
    change24hPct: 1.2,
    holdingCreatedAt: friBuyTs,
    now: friMorningTr,
  }) === 0,
  'same-day stale quote daily % is 0',
);

/** Alımdan sonra now damgalı kotasyon ama günlük % yok (Stooq önceki kapanış). */
assert(
  shouldMarkHoldingAtCost({
    categoryId: 'yurtdisi',
    priceUpdatedAt: '2026-08-14T12:41:00.000Z',
    change24hPct: null,
    holdingCreatedAt: friBuyTs,
    now: friMorningTr,
  }),
  'same-day buy without daily %',
);

/** Seans kotasyonu alımdan sonra geldiyse piyasa fiyatı kullanılır. */
const afterOpen = new Date('2026-08-14T16:50:00-04:00');
assert(
  !shouldMarkHoldingAtCost({
    categoryId: 'yurtdisi',
    priceUpdatedAt: '2026-08-14T16:45:00-04:00',
    change24hPct: 0.4,
    holdingCreatedAt: friBuyTs,
    now: afterOpen,
  }),
  'live quote after fill',
);

/** Eski pozisyon: önceki kapanışla toplam getiri hesaplanır. */
assert(
  !shouldMarkHoldingAtCost({
    categoryId: 'yurtdisi',
    priceUpdatedAt: thuQuoteTs,
    change24hPct: 1.2,
    holdingCreatedAt: '2026-01-15T15:00:00.000Z',
    now: friMorningTr,
  }),
  'existing holding keeps last close',
);

const igvHolding: HoldingRow = {
  id: 'h1',
  quantity: 20.905996605,
  avg_price: 105.98,
  created_at: friBuyTs,
  asset: {
    id: 'a1',
    name: 'iShares Expanded Tech-software Sector ETF',
    symbol: 'IGV',
    category_id: 'yurtdisi',
    current_price: 103.08,
    change_24h_pct: null,
    price_updated_at: thuQuoteTs,
  },
};
assert(
  Math.abs(holdingMarketUnitNative(igvHolding, 40, { now: friMorningTr }).unitNative - 105.98) < 1e-9,
  'IGV unit marks at fill until session quote',
);

console.log('verify-trading-day-display: ok');
