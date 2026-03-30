/**
 * Eski senkron sonrası kripto satırlarında currency=TRY kalmışsa USD yapar; ardından
 * sync-crypto-prices ile current_price'ı CoinGecko USD ile yeniler.
 *
 *   node scripts/repair-kripto-usd.js
 *
 * Gerekli: .env — EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (yazma için)
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (.env)');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const tryVariants = ['TRY', 'try', 'Try', 'TL', 'tl', 'Tl'];
  let patched = 0;
  for (const cur of tryVariants) {
    const { data: updated, error: uErr } = await sb
      .from('assets')
      .update({ currency: 'USD' })
      .eq('category_id', 'kripto')
      .eq('currency', cur)
      .select('id');
    if (uErr) {
      console.warn('Toplu güncelleme uyarısı', cur, uErr.message);
      continue;
    }
    patched += updated?.length ?? 0;
  }

  if (patched === 0) {
    console.log('Kripto satırında TRY/TL currency yok (atlandı).');
  } else {
    console.log('Toplam', patched, 'satır currency=USD yapıldı (TRY/TL → USD).');
  }

  console.log('\nCoinGecko senkronu başlıyor (sync-crypto-prices.js)…');
  const scriptPath = path.join(__dirname, 'sync-crypto-prices.js');
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error('\n[repair-kripto-usd] sync-crypto-prices başarısız (kod:', r.status, ').');
    process.exit(r.status ?? 1);
  }
  console.log('\n[repair-kripto-usd] Tamam: kripto fiyatları USD ile güncellendi.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
