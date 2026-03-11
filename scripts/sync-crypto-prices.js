/**
 * Kripto fiyat + ikon batch:
 * - CoinGecko'dan top coin listesini çeker
 * - Supabase'de category_id = 'kripto' olan assets kayıtlarını sembole göre UPSERT eder
 *   (mevcut asset id'leri ve onlara bağlı holdings KALIR, yeni coin'ler eklenir)
 * Günde 1 defa çalıştır (Windows Task Scheduler / cron / GitHub Actions).
 *
 * Gereksinim: .env içinde EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY
 * (veya yazma için SUPABASE_SERVICE_ROLE_KEY). Node 18+ (fetch built-in).
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

const COINGECKO_MARKETS = 'https://api.coingecko.com/api/v3/coins/markets';
const VS_CURRENCY = 'usd';

async function loadEnv() {
  const path = require('path');
  const fs = require('fs');
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

async function fetchCoinGeckoTopMarkets(pages = 3, perPage = 250) {
  const all = [];
  for (let page = 1; page <= pages; page++) {
    const url = `${COINGECKO_MARKETS}?vs_currency=${VS_CURRENCY}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('CoinGecko: ' + res.status + ' ' + (await res.text()));
    const chunk = await res.json();
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    all.push(...chunk);
  }
  return all;
}

async function upsertKriptoAssets(supabase, markets) {
  // Aynı sembolden birden fazla coin gelirse (ör: wrapped versiyonlar),
  // Postgres upsert aynı unique key'i iki kez güncellemeye çalışıp hata verir.
  // Bunu engellemek için sembole göre tekilleştiriyoruz (ilk gördüğümüz kaydı al).
  const bySymbol = new Map();
  for (const m of markets) {
    const sym = (m.symbol || '').toUpperCase();
    if (!sym) continue;
    if (!bySymbol.has(sym)) bySymbol.set(sym, m);
  }

  const rows = Array.from(bySymbol.values()).map((m) => ({
    category_id: 'kripto',
    name: m.name,
    symbol: (m.symbol || '').toUpperCase(),
    currency: 'USD',
    external_id: m.id,
    current_price: m.current_price == null ? null : Number(m.current_price),
    icon_url: m.image || null,
    price_updated_at: new Date().toISOString(),
  }));

  // Supabase upsert limitine takılmamak için batch'leyelim
  const chunkSize = 500;
  let affected = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from('assets')
      .upsert(slice, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });
    if (error) throw new Error('Upsert hatası: ' + error.message);
    if (typeof count === 'number') affected += count;
  }
  return affected || rows.length;
}

async function main() {
  await loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY (veya SUPABASE_SERVICE_ROLE_KEY) .env içinde olmalı.');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  console.log('CoinGecko top marketler çekiliyor…');
  const markets = await fetchCoinGeckoTopMarkets(1, 250); // tek sayfa, ~250 coin
  console.log('Gelen coin sayısı:', markets.length);

  console.log('Kripto assets upsert ediliyor (category_id = kripto)…');
  const affected = await upsertKriptoAssets(supabase, markets);
  console.log('Etkilenen asset sayısı (insert + update):', affected);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
