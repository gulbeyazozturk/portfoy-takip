/**
 * price_history yazımı yalnızca günlük bakım RPC/script ile (migration 022).
 * Eski snapshot/backfill script'leri bu modülü kullanmamalı.
 */

function priceHistoryWritesEnabled() {
  return process.env.PRICE_HISTORY_WRITES === '1';
}

function exitIfPriceHistoryWritesDisabled(scriptName) {
  if (priceHistoryWritesEnabled()) return;
  console.log(
    `[${scriptName}] price_history toplu yazım devre dışı. Günlük bakım: npm run daily-price-history`,
  );
  process.exit(0);
}

module.exports = { priceHistoryWritesEnabled, exitIfPriceHistoryWritesDisabled };
