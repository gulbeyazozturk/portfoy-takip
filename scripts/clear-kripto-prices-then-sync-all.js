/**
 * 1) Kripto price_history + kripto assets fiyat alanlarını temizler
 * 2) Tüm varlıklar için fiyat senkronlarını + snapshot çalıştırır
 *
 *   node scripts/clear-kripto-prices-then-sync-all.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

function run(rel) {
  const scriptPath = path.join(__dirname, rel);
  console.log(`\n>>> ${rel}\n`);
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

run('clear-kripto-price-history-and-fields.js');
run('sync-all-prices.js');
console.log('\n[Kripto temizlik + tüm fiyatlar] Bitti.');
