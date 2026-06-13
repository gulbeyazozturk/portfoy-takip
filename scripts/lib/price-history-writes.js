/** price_history yazımı kapalı; açmak için PRICE_HISTORY_WRITES=1 + migration 021 trigger kaldır. */

function priceHistoryWritesEnabled() {
  return process.env.PRICE_HISTORY_WRITES === '1';
}

function exitIfPriceHistoryWritesDisabled(scriptName) {
  if (priceHistoryWritesEnabled()) return;
  console.log(
    `[${scriptName}] price_history yazımı kapalı. Atlanıyor. (Tekrar açmak: PRICE_HISTORY_WRITES=1 + DB trigger kaldır)`,
  );
  process.exit(0);
}

module.exports = { priceHistoryWritesEnabled, exitIfPriceHistoryWritesDisabled };
