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
  { file: 'sync-doviz-dev.js', args: [] },
  { file: 'sync-crypto-prices.js', args: [] },
  { file: 'sync-bist-scrape.js', args: [] },
  { file: 'sync-emtia-scrape.js', args: [] },
  // Dış kaynak timeout verebilir; tüm zinciri düşürmemek için bu adım hata toleranslı.
  { file: 'sync-kapalicarsi-gold.js', args: [], continueOnError: true },
  // Full evrenden kademeli güncelleme (rate-limit dostu)
  { file: 'sync-yurtdisi-prices.js', args: ['--mode=full', '--batch=500', '--delay=180'] },
  { file: 'sync-tefas-funds.js', args: [] },
  { file: 'snapshot-prices.js', args: [] },
];

const root = path.resolve(__dirname, '..');

function runScript(job) {
  const scriptPath = path.join(__dirname, job.file);
  const args = [scriptPath, ...(job.args || [])];
  console.log(`\n${'='.repeat(60)}\n ${job.file} ${(job.args || []).join(' ')}\n${'='.repeat(60)}\n`);
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    if (job.continueOnError) {
      console.warn(`\n[sync-all-prices] ${job.file} başarısız (kod: ${r.status}) ama devam ediliyor.`);
      return;
    }
    console.error(`\n[sync-all-prices] ${job.file} başarısız (kod: ${r.status}).`);
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
