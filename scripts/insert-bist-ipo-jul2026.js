/**
 * Temmuz 2026 BIST halka arzları — yalnızca eksik envanter tohumu.
 * Semboller: ALBTN, KARCL, MASFN, METEN.
 *
 * Canlı fiyatı olan satırları ezmez. Periyodik portfolio-sync bu script'i
 * çalıştırmaz; fiyat scrape + Yahoo ile gelir.
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

function hasPositivePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

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
  const symbols = BIST_IPO_JUL2026.map((row) => row.symbol);

  const { data: existing, error: selectError } = await supabase
    .from('assets')
    .select('symbol, current_price')
    .eq('category_id', 'bist')
    .in('symbol', symbols);
  if (selectError) {
    console.error('BIST IPO mevcut kayıt okunamadı:', selectError.message);
    process.exit(1);
  }

  const existingBySymbol = new Map(
    (existing || []).map((row) => [String(row.symbol || '').trim().toUpperCase(), row]),
  );

  const toSeed = [];
  for (const row of BIST_IPO_JUL2026) {
    const prev = existingBySymbol.get(row.symbol);
    if (prev && hasPositivePrice(prev.current_price)) {
      console.log(`  ${row.symbol} — canlı fiyat korunuyor (${prev.current_price})`);
      continue;
    }
    toSeed.push({
      category_id: 'bist',
      symbol: row.symbol,
      name: row.name,
      currency: 'TRY',
      external_id: row.symbol,
      current_price: row.price,
      price_updated_at: now,
    });
  }

  if (!toSeed.length) {
    console.log('BIST halka arz varlıkları zaten canlı fiyatlı; seed atlandı.');
    return;
  }

  const { error, count } = await supabase
    .from('assets')
    .upsert(toSeed, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });

  if (error) {
    console.error('BIST IPO upsert hatası:', error.message);
    process.exit(1);
  }

  console.log(`BIST halka arz varlıkları tohumlandı (${count ?? toSeed.length} satır):`);
  for (const row of toSeed) {
    console.log(`  ${row.symbol} — ${row.name} — ${row.current_price} TL`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
