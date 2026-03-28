/**
 * Kripto fiyat + ikon batch:
 * - CoinGecko'dan top coin listesini çeker
 * - Kripto: category_id = 'kripto' UPSERT (XAUT, PAXG bu grupta tutulmaz).
 * - Emtia: XAUT ve PAXG CoinGecko ile UPSERT (altın token’lar); önce kripto’da kalan satırlar emtia’ya taşınır (aynı id).
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
// Kripto fiyatlarını doğrudan TL olarak çekiyoruz.
const VS_CURRENCY = 'try';

/** CoinGecko’dan fiyatlanır; kripto listesinde değil, Emtia’da gösterilir (aynı CoinGecko verisi). */
const EMTIA_GOLD_TOKEN_SYMBOLS = new Set(['XAUT', 'PAXG']);

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

function marketsByUpperSymbol(markets) {
  const bySymbol = new Map();
  for (const m of markets) {
    const sym = (m.symbol || '').toUpperCase();
    if (!sym) continue;
    if (!bySymbol.has(sym)) bySymbol.set(sym, m);
  }
  return bySymbol;
}

function rowFromMarket(m, categoryId) {
  return {
    category_id: categoryId,
    name: m.name,
    symbol: (m.symbol || '').toUpperCase(),
    currency: 'TRY',
    external_id: m.id,
    current_price: m.current_price == null ? null : Number(m.current_price),
    change_24h_pct:
      m.price_change_percentage_24h == null ? null : Number(m.price_change_percentage_24h),
    icon_url: m.image || null,
    price_updated_at: new Date().toISOString(),
  };
}

/** Mevcut kripto XAUT/PAXG satırlarını aynı id ile emtia yapar (holding’ler bozulmaz). */
async function migrateGoldTokensKriptoToEmtia(supabase) {
  const { data, error } = await supabase.from('assets').select('id,symbol').eq('category_id', 'kripto');
  if (error) throw new Error('Migrate okuma: ' + error.message);
  let n = 0;
  for (const row of data ?? []) {
    const u = (row.symbol || '').toUpperCase();
    if (!EMTIA_GOLD_TOKEN_SYMBOLS.has(u)) continue;
    const { error: uerr } = await supabase.from('assets').update({ category_id: 'emtia' }).eq('id', row.id);
    if (uerr) console.warn('  Taşınamadı', row.symbol, uerr.message);
    else n++;
  }
  if (n > 0) console.log('  Kripto → Emtia taşınan (XAUT/PAXG) satır:', n);
}

async function upsertKriptoAssets(supabase, markets) {
  const bySymbol = marketsByUpperSymbol(markets);

  const rows = Array.from(bySymbol.values())
    .filter((m) => !EMTIA_GOLD_TOKEN_SYMBOLS.has((m.symbol || '').toUpperCase()))
    .map((m) => rowFromMarket(m, 'kripto'));

  if (rows.length === 0) return 0;

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

/** XAUT / PAXG: CoinGecko fiyatı, kategori emtia (eklenebilir emtia listesinde görünür). */
async function upsertEmtiaGoldTokens(supabase, markets) {
  const bySymbol = marketsByUpperSymbol(markets);
  const rows = [];
  for (const sym of EMTIA_GOLD_TOKEN_SYMBOLS) {
    const m = bySymbol.get(sym);
    if (!m) {
      console.warn('  CoinGecko listesinde yok (atlanıyor):', sym);
      continue;
    }
    rows.push(rowFromMarket(m, 'emtia'));
  }
  if (rows.length === 0) return 0;
  const { error, count } = await supabase
    .from('assets')
    .upsert(rows, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });
  if (error) throw new Error('Emtia altın token upsert: ' + error.message);
  return typeof count === 'number' ? count : rows.length;
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

  console.log('XAUT / PAXG: kripto → emtia taşıma (varsa, aynı uuid)…');
  await migrateGoldTokensKriptoToEmtia(supabase);

  console.log('CoinGecko top marketler çekiliyor…');
  const markets = await fetchCoinGeckoTopMarkets(3, 250); // XAUT/PAXG için yeterli derinlik
  console.log('Gelen coin sayısı:', markets.length);

  console.log('Kripto assets upsert (XAUT/PAXG hariç)…');
  const affectedKripto = await upsertKriptoAssets(supabase, markets);
  console.log('Kripto etkilenen satır:', affectedKripto);

  console.log('Emtia altın token (XAUT, PAXG) CoinGecko ile upsert…');
  const affectedEmtia = await upsertEmtiaGoldTokens(supabase, markets);
  console.log('Emtia altın token etkilenen satır:', affectedEmtia);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
