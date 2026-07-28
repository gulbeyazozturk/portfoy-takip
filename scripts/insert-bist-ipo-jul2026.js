/**
 * Temmuz 2026 BIST halka arzları — assets tablosuna upsert.
 * Semboller ve halka arz baz fiyatları:
 *   ALBTN 38,60 | KARCL 35,00 | MASFN 45,68 | METEN 20,00 TL
 *
 * Not: Kardemir Çelik borsa kodu KARCL (KARCK değil).
 *
 * Çalıştırma:
 *   npm run insert:bist-ipo-jul2026
 */

async function loadEnv() {
  const path = require('path');
  const fs = require('fs');
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf8');
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

const BIST_IPO_JUL2026 = [
  { symbol: 'ALBTN', name: 'Albayrak Hazır Beton', price: 38.6 },
  { symbol: 'KARCL', name: 'Kardemir Çelik Sanayi', price: 35 },
  { symbol: 'MASFN', name: 'Masfen Enerji', price: 45.68 },
  { symbol: 'METEN', name: 'Metgün Enerji Yatırımları', price: 20 },
];

async function main() {
  await loadEnv();

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error(
      'Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (veya anon key) .env içinde olmalı.',
    );
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);
  const now = new Date().toISOString();

  const assets = BIST_IPO_JUL2026.map((row) => ({
    category_id: 'bist',
    symbol: row.symbol,
    name: row.name,
    currency: 'TRY',
    external_id: row.symbol,
    current_price: row.price,
    price_updated_at: now,
  }));

  const { error, count } = await supabase
    .from('assets')
    .upsert(assets, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });

  if (error) {
    console.error('BIST IPO upsert hatası:', error.message);
    process.exit(1);
  }

  console.log(`BIST halka arz varlıkları upsert edildi (${count ?? assets.length} satır):`);
  for (const row of BIST_IPO_JUL2026) {
    console.log(`  ${row.symbol} — ${row.name} — ${row.price} TL`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
