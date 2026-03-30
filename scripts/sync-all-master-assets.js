/**
 * Tüm varlık türleri için Supabase `assets` master listesini doldurur / günceller.
 * CSV içe aktarma bu tabloya göre eşleşir; önce bu script (veya tek tek alt scriptler) çalıştırılmalıdır.
 *
 * Sıra:
 *   1. Döviz (sync-doviz-dev)
 *   2. Yurtdışı hisse/ETF sembol listesi (sync-yurtdisi-list)
 *   3. BIST (sync-bist-scrape)
 *   4. Emtia ons metaller (sync-emtia-scrape)
 *   5. Kapalıçarşı / gram altın vb. (sync-kapalicarsi-gold)
 *   6. Kripto + XAUT/PAXG emtia (sync-crypto-prices)
 *   7. Fonlar TEFAS (sync-tefas-funds)
 *
 * Çalıştırma:
 *   npm run sync-all-master-assets
 *
 * Gereksinim: .env — EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (yazma için önerilir)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  'sync-doviz-dev.js',
  'sync-yurtdisi-list.js',
  'sync-bist-scrape.js',
  'sync-emtia-scrape.js',
  'sync-kapalicarsi-gold.js',
  'sync-crypto-prices.js',
  'sync-tefas-funds.js',
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
    console.error(`\n[sync-all-master-assets] ${filename} başarısız (kod: ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

function main() {
  console.log(
    'Master assets: döviz → yurtdışı liste → BIST → emtia → altın ürünleri → kripto → TEFAS fonlar\n',
  );
  for (const s of SCRIPTS) runScript(s);
  console.log('\n[sync-all-master-assets] Hepsi tamam. İstersen fiyatlar için: npm run sync-yurtdisi-prices');
}

main();
