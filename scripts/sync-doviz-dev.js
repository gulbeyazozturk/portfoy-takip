/**
 * Döviz kurları (doviz.dev):
 * - https://doviz.dev/v1/try.json ile TRY bazlı kurları çeker
 * - Supabase'de category_id = 'doviz' olan assets kayıtlarını sembole göre UPSERT eder
 *   (liste + current_price TL; gece 00:00 TR açılış kuru saklanır, günlük değişim % hesaplanır)
 *
 * Çalıştırma:
 *   node scripts/sync-doviz-dev.js
 *
 * Gereksinim:
 *   - Node 18+ (fetch)
 *   - .env: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (veya EXPO_PUBLIC_SUPABASE_ANON_KEY)
 *
 * Zamanlama: 15 dakikada bir (GitHub Actions); gece 24'ten bu yana değişim anlık güncellenir.
 */

const DOVIZ_DEV_TRY = 'https://doviz.dev/v1/try.json';

function getTurkeyDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

const FOREX_PAIRS = [
  { key: 'USDTRY', symbol: 'USD', name: 'ABD Doları' },
  { key: 'EURTRY', symbol: 'EUR', name: 'Euro' },
  { key: 'GBPTRY', symbol: 'GBP', name: 'İngiliz Sterlini' },
  { key: 'CHFTRY', symbol: 'CHF', name: 'İsviçre Frangı' },
  { key: 'JPYTRY', symbol: 'JPY', name: 'Japon Yeni' },
  { key: 'AUDTRY', symbol: 'AUD', name: 'Avustralya Doları' },
  { key: 'CADTRY', symbol: 'CAD', name: 'Kanada Doları' },
  { key: 'DKKTRY', symbol: 'DKK', name: 'Danimarka Kronu' },
  { key: 'PLNTRY', symbol: 'PLN', name: 'Polonya Zlotisi' },
];

// ISO ülke / bölge kodları; bayrak ikonları için kullanılır.
// flagcdn.com altında 40px PNG kullanıyoruz (örn: https://flagcdn.com/w40/us.png)
const FLAG_BY_SYMBOL = {
  USD: 'us',
  EUR: 'eu',
  GBP: 'gb',
  CHF: 'ch',
  JPY: 'jp',
  AUD: 'au',
  CAD: 'ca',
  DKK: 'dk',
  PLN: 'pl',
};

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

async function fetchDovizDevRates() {
  const res = await fetch(DOVIZ_DEV_TRY, {
    headers: { 'User-Agent': 'PortfoyTakip/1.0 (doviz sync)' },
  });
  if (!res.ok) {
    throw new Error(`doviz.dev ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function getExistingDovizMidnight(supabase) {
  const { data, error } = await supabase
    .from('assets')
    .select('symbol, price_at_midnight, price_midnight_date')
    .eq('category_id', 'doviz');
  if (error) throw new Error('Döviz mevcut kayıtlar: ' + error.message);
  const map = new Map();
  for (const row of data || []) {
    map.set((row.symbol || '').toUpperCase(), {
      price_at_midnight: row.price_at_midnight,
      price_midnight_date: row.price_midnight_date,
    });
  }
  return map;
}

async function upsertDovizAssets(supabase, rates, todayTurkey, existingMidnight) {
  const now = new Date().toISOString();
  const rows = [];

  for (const { key, symbol, name } of FOREX_PAIRS) {
    const raw = rates[key];
    const currentPrice = raw != null && typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    if (currentPrice == null) continue;

    const ex = existingMidnight.get(symbol) || {};
    const midnightDate = ex.price_midnight_date;
    const isNewDay = !midnightDate || String(midnightDate) < todayTurkey;
    const priceAtMidnight = isNewDay ? currentPrice : (ex.price_at_midnight ?? currentPrice);
    const priceMidnightDate = isNewDay ? todayTurkey : midnightDate;
    const changePct =
      priceAtMidnight && priceAtMidnight > 0
        ? ((currentPrice - priceAtMidnight) / priceAtMidnight) * 100
        : null;

    const flagCode = FLAG_BY_SYMBOL[symbol];
    const iconUrl = flagCode ? `https://flagcdn.com/w40/${flagCode}.png` : null;

    rows.push({
      category_id: 'doviz',
      symbol,
      name,
      currency: symbol,
      current_price: currentPrice,
      icon_url: iconUrl,
      price_updated_at: now,
      price_at_midnight: priceAtMidnight,
      price_midnight_date: priceMidnightDate,
      change_24h_pct: changePct,
    });
  }

  if (rows.length === 0) {
    console.log('Uyarı: doviz.dev yanıtında hiçbir kur bulunamadı.');
    return 0;
  }

  const { error, count } = await supabase
    .from('assets')
    .upsert(rows, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });

  if (error) throw new Error('Döviz upsert: ' + error.message);
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
    console.error(
      'Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (veya EXPO_PUBLIC_SUPABASE_ANON_KEY) .env içinde olmalı.',
    );
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  const todayTurkey = getTurkeyDateStr();
  console.log('Türkiye günü:', todayTurkey, '| doviz.dev kurları çekiliyor…');
  const rates = await fetchDovizDevRates();
  const meta = rates._meta || {};
  console.log('Kaynak:', meta.source || '—', 'Güncelleme:', meta.updated_at || '—');

  const existingMidnight = await getExistingDovizMidnight(supabase);
  console.log('Döviz assets upsert ediliyor (gece 00:00’dan bu yana değişim % ile)…');
  const affected = await upsertDovizAssets(supabase, rates, todayTurkey, existingMidnight);
  console.log('Güncellenen/eklenen döviz sayısı:', affected);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
