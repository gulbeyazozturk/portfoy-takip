/**
 * Tüm varlık türleri için güncel fiyatları çeker (listeleri doldurmaz; mevcut assets satırlarını günceller).
 * Sıra: döviz → kripto → BIST → emtia → kapalıçarşı → yurtdışı fiyat → TEFAS → price_history anlık görüntü.
 *
 *   node scripts/sync-all-prices.js
 *
 * Gerekli: .env — SUPABASE_SERVICE_ROLE_KEY (çoğu script için önerilir)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  'sync-doviz-dev.js',
  'sync-crypto-prices.js',
  'sync-bist-scrape.js',
  'sync-emtia-scrape.js',
  'sync-kapalicarsi-gold.js',
  'sync-yurtdisi-prices.js',
  'sync-tefas-funds.js',
  'snapshot-prices.js',
];

const root = path.resolve(__dirname, '..');

function runScript(filename) {
  const scriptPath = path.join(__dirname, filename);
  console.log(`\n${'='.repeat(60)}\n ${filename}\n${'='.repeat(60)}\n`);
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`\n[sync-all-prices] ${filename} başarısız (kod: ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

function main() {
  console.log(
    'Fiyat senkronu: döviz → kripto → BIST → emtia → kapalıçarşı → yurtdışı fiyat → TEFAS → snapshot\n',
  );
  for (const s of SCRIPTS) runScript(s);
  console.log('\n[sync-all-prices] Tamam.');
}

main();
