/**
 * Günlük % takvim mantığı — hızlı doğrulama: npx tsx scripts/verify-trading-day-display.ts
 */
import {
  calendarDateInTimeZone,
  nextTradingDayAfter,
  shouldShowCalendarDayChange,
  shouldShowTradingDayChange,
  TZ_TR,
} from '../lib/trading-day-display';
import { effectiveChange24hPctForDisplay } from '../lib/effective-change-24h';

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

console.log('verify-trading-day-display: ok');
