/**
 * Tek seferlik: kripto tablosundaki XAUT ve PAXG satırlarını emtia yapar.
 * .env: EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (veya anon).
 *
 *   node scripts/move-xaut-paxg-to-emtia.js
 *
 * Not: Günlük sync (sync-crypto-prices.js) bu taşımayı zaten otomatik yapar;
 * bu script manuel veya acil durum içindir.
 */

const path = require('path');
const fs = require('fs');

async function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const SYMBOLS = new Set(['XAUT', 'PAXG']);

async function main() {
  await loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Eksik ortam değişkeni: Supabase URL / key');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  const { data, error } = await supabase.from('assets').select('id,symbol,category_id').eq('category_id', 'kripto');
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let moved = 0;
  for (const row of data ?? []) {
    const u = (row.symbol || '').toUpperCase();
    if (!SYMBOLS.has(u)) continue;
    const { error: uerr } = await supabase.from('assets').update({ category_id: 'emtia' }).eq('id', row.id);
    if (uerr) {
      console.error('Güncellenemedi', row.symbol, uerr.message);
    } else {
      console.log('Taşındı → emtia:', row.symbol, row.id);
      moved++;
    }
  }

  if (moved === 0) console.log('Taşınacak kripto XAUT/PAXG satırı yok (zaten emtia veya yok).');
  else console.log('Toplam taşınan:', moved);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
