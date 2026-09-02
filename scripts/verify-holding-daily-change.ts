/**
 * Aynı gün alışta günlük % — hızlı doğrulama: npx tsx scripts/verify-holding-daily-change.ts
 */
import { effectiveChange24hPctForDisplay } from '../lib/effective-change-24h';
import { effectiveHoldingDailyChangePct } from '../lib/holding-daily-change';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

const friSession = new Date('2026-05-22T14:00:00+03:00');
const friPriceAt = '2026-05-22T14:00:00+03:00';
const sat = new Date('2026-05-23T12:00:00+03:00');
const mondayMorning = new Date('2026-05-25T09:00:00+03:00');

const marketUp5 = 5;
const current = 105;

assert(
  effectiveChange24hPctForDisplay('bist', marketUp5, friPriceAt, friSession) === 5,
  'market daily still +5 on Friday',
);

const boughtNow = effectiveHoldingDailyChangePct({
  categoryId: 'bist',
  change24hPct: marketUp5,
  priceUpdatedAt: friPriceAt,
  unitNative: current,
  avgPrice: current,
  createdAt: '2026-05-22T14:05:00+03:00',
  usdTry: 40,
  now: friSession,
});
assert(boughtNow != null && almost(boughtNow, 0), `same-day buy at spot must be ~0 daily, got ${boughtNow}`);

const boughtMidMove = effectiveHoldingDailyChangePct({
  categoryId: 'bist',
  change24hPct: marketUp5,
  priceUpdatedAt: friPriceAt,
  unitNative: current,
  avgPrice: 102,
  createdAt: '2026-05-22T11:00:00+03:00',
  usdTry: 40,
  now: friSession,
});
const expectedMid = ((current - 102) / 102) * 100;
assert(
  boughtMidMove != null && almost(boughtMidMove, expectedMid),
  `same-day mid-session buy must use cost, got ${boughtMidMove} expected ${expectedMid}`,
);

const overnight = effectiveHoldingDailyChangePct({
  categoryId: 'bist',
  change24hPct: marketUp5,
  priceUpdatedAt: friPriceAt,
  unitNative: current,
  avgPrice: 80,
  createdAt: '2026-05-15T10:00:00+03:00',
  usdTry: 40,
  now: friSession,
});
assert(overnight === 5, `overnight holding keeps market daily, got ${overnight}`);

const csvHistorical = effectiveHoldingDailyChangePct({
  categoryId: 'bist',
  change24hPct: marketUp5,
  priceUpdatedAt: friPriceAt,
  unitNative: current,
  avgPrice: 80,
  createdAt: '2026-05-22T09:00:00+03:00',
  notes: '[cost_date:2026-05-15]',
  usdTry: 40,
  now: friSession,
});
assert(csvHistorical === 5, `CSV cost_date in the past keeps market daily, got ${csvHistorical}`);

const csvToday = effectiveHoldingDailyChangePct({
  categoryId: 'bist',
  change24hPct: marketUp5,
  priceUpdatedAt: friPriceAt,
  unitNative: current,
  avgPrice: 102,
  createdAt: '2026-05-22T09:00:00+03:00',
  costDateIso: '2026-05-22',
  usdTry: 40,
  now: friSession,
});
assert(
  csvToday != null && almost(csvToday, expectedMid),
  `CSV cost_date today uses cost, got ${csvToday}`,
);

const noCostSameDay = effectiveHoldingDailyChangePct({
  categoryId: 'bist',
  change24hPct: marketUp5,
  priceUpdatedAt: friPriceAt,
  unitNative: current,
  avgPrice: null,
  createdAt: '2026-05-22T14:05:00+03:00',
  usdTry: 40,
  now: friSession,
});
assert(noCostSameDay === 0, `same-day without avg cost must not take market +5, got ${noCostSameDay}`);

const weekendHold = effectiveHoldingDailyChangePct({
  categoryId: 'bist',
  change24hPct: marketUp5,
  priceUpdatedAt: friPriceAt,
  unitNative: current,
  avgPrice: current,
  createdAt: '2026-05-22T14:05:00+03:00',
  usdTry: 40,
  now: sat,
});
assert(weekendHold != null && almost(weekendHold, 0), `weekend still treats Friday entry as same session, got ${weekendHold}`);

const mondayAfterFridayBuy = effectiveHoldingDailyChangePct({
  categoryId: 'bist',
  change24hPct: 1.2,
  priceUpdatedAt: '2026-05-25T09:30:00+03:00',
  unitNative: 106.26,
  avgPrice: 105,
  createdAt: '2026-05-22T14:05:00+03:00',
  usdTry: 40,
  now: mondayMorning,
});
assert(mondayAfterFridayBuy === 1.2, `next trading day uses market daily, got ${mondayAfterFridayBuy}`);

const usSameDay = effectiveHoldingDailyChangePct({
  categoryId: 'yurtdisi',
  change24hPct: 5,
  priceUpdatedAt: '2026-05-22T10:00:00-04:00',
  unitNative: 210,
  avgPrice: 210,
  createdAt: '2026-05-22T10:05:00-04:00',
  usdTry: 40,
  now: new Date('2026-05-22T10:30:00-04:00'),
});
assert(usSameDay != null && almost(usSameDay, 0), `US same-session buy ~0, got ${usSameDay}`);

console.log('verify-holding-daily-change: ok');
