/**
 * Son BIST halka arzları — envanter tohumu (toplu yükleme / varlık listesi için zorunlu).
 * Semboller: INTET, BKRGY, TKNKA, KPEKS, VEYAS.
 *
 * Canlı fiyatı olan satırları ezmez; yalnızca eksik envanter veya fiyatsız kayıt tohumlar.
 * Periyodik portfolio-sync bu script'i BIST scrape öncesinde çalıştırır.
 *
 * Çalıştırma:
 *   npm run insert:bist-ipo-recent
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

/** @type {{ symbol: string; name: string; price?: number }[]} */
const BIST_IPO_RECENT = [
  { symbol: 'INTET', name: 'İntetra Teknoloji', price: 58.95 },
  { symbol: 'BKRGY', name: 'Bakırcı GYO', price: 12.93 },
  { symbol: 'TKNKA', name: 'Teknika Plast' },
  { symbol: 'KPEKS', name: 'Kapeks Kimya' },
  { symbol: 'VEYAS', name: 'Türker Vangölü Enerji' },
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
  const symbols = BIST_IPO_RECENT.map((row) => row.symbol);

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
  for (const row of BIST_IPO_RECENT) {
    const prev = existingBySymbol.get(row.symbol);
    const payload = {
      category_id: 'bist',
      symbol: row.symbol,
      name: row.name,
      currency: 'TRY',
      external_id: row.symbol,
    };

    if (row.price != null && (!prev || !hasPositivePrice(prev.current_price))) {
      payload.current_price = row.price;
      payload.price_updated_at = now;
    }

    toSeed.push(payload);
  }

  const { error, count } = await supabase
    .from('assets')
    .upsert(toSeed, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });

  if (error) {
    console.error('BIST IPO upsert hatası:', error.message);
    process.exit(1);
  }

  console.log(`BIST son halka arz varlıkları upsert (${count ?? toSeed.length} satır):`);
  for (const row of toSeed) {
    const priceNote =
      row.current_price != null ? `${row.current_price} TL` : 'envanter (fiyat Yahoo/scrape)';
    console.log(`  ${row.symbol} — ${row.name} — ${priceNote}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
