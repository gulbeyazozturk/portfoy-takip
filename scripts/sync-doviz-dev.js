/**
 * Döviz kurları (doviz.dev + open.er-api.com):
 * - Birincil: https://doviz.dev/v1/try.json (TRY bazlı, yüksek hassasiyet)
 * - İkincil: https://open.er-api.com/v6/latest/USD (166 döviz, USD->TRY üzerinden hesaplama)
 * - Supabase'de category_id = 'doviz' olan assets kayıtlarını sembole göre UPSERT eder
 *
 * Çalıştırma:
 *   node scripts/sync-doviz-dev.js
 *
 * Gereksinim:
 *   - Node 18+ (fetch)
 *   - .env: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (veya EXPO_PUBLIC_SUPABASE_ANON_KEY)
 *
 * Zamanlama: 15 dakikada bir (GitHub Actions); gece 24'ten bu yana degisim anlik guncellenir.
 */

const DOVIZ_DEV_TRY = 'https://doviz.dev/v1/try.json';
const ER_API_URL = 'https://open.er-api.com/v6/latest/USD';

function getTurkeyDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

const FOREX_PAIRS = [
  // doviz.dev'den direkt TRY bazli
  { key: 'USDTRY', symbol: 'USD', name: 'ABD Doları', source: 'doviz' },
  { key: 'EURTRY', symbol: 'EUR', name: 'Euro', source: 'doviz' },
  { key: 'GBPTRY', symbol: 'GBP', name: 'İngiliz Sterlini', source: 'doviz' },
  { key: 'CHFTRY', symbol: 'CHF', name: 'İsviçre Frangı', source: 'doviz' },
  { key: 'JPYTRY', symbol: 'JPY', name: 'Japon Yeni', source: 'doviz' },
  { key: 'AUDTRY', symbol: 'AUD', name: 'Avustralya Doları', source: 'doviz' },
  { key: 'CADTRY', symbol: 'CAD', name: 'Kanada Doları', source: 'doviz' },
  { key: 'DKKTRY', symbol: 'DKK', name: 'Danimarka Kronu', source: 'doviz' },
  { key: 'PLNTRY', symbol: 'PLN', name: 'Polonya Zlotisi', source: 'doviz' },
  { key: 'KWDTRY', symbol: 'KWD', name: 'Kuveyt Dinarı', source: 'doviz' },
  { key: 'NOKTRY', symbol: 'NOK', name: 'Norveç Kronu', source: 'doviz' },
  { key: 'SARTRY', symbol: 'SAR', name: 'Suudi Riyali', source: 'doviz' },
  { key: 'SEKTRY', symbol: 'SEK', name: 'İsveç Kronu', source: 'doviz' },

  // open.er-api.com uzerinden USD->TRY donusumle
  { symbol: 'BGN', name: 'Bulgar Levası', source: 'erapi' },
  { symbol: 'CNY', name: 'Çin Yuanı', source: 'erapi' },
  { symbol: 'HKD', name: 'Hong Kong Doları', source: 'erapi' },
  { symbol: 'KRW', name: 'Güney Kore Wonu', source: 'erapi' },
  { symbol: 'RUB', name: 'Rus Rublesi', source: 'erapi' },
  { symbol: 'AED', name: 'BAE Dirhemi', source: 'erapi' },
  { symbol: 'QAR', name: 'Katar Riyali', source: 'erapi' },
  { symbol: 'INR', name: 'Hint Rupisi', source: 'erapi' },
  { symbol: 'BRL', name: 'Brezilya Reali', source: 'erapi' },
  { symbol: 'MXN', name: 'Meksika Pesosu', source: 'erapi' },
  { symbol: 'SGD', name: 'Singapur Doları', source: 'erapi' },
  { symbol: 'THB', name: 'Tayland Bahtı', source: 'erapi' },
  { symbol: 'NZD', name: 'Yeni Zelanda Doları', source: 'erapi' },
  { symbol: 'ZAR', name: 'Güney Afrika Randı', source: 'erapi' },
  { symbol: 'HUF', name: 'Macar Forinti', source: 'erapi' },
  { symbol: 'CZK', name: 'Çek Korunası', source: 'erapi' },
  { symbol: 'RON', name: 'Romen Leyi', source: 'erapi' },
  { symbol: 'ILS', name: 'İsrail Şekeli', source: 'erapi' },
  { symbol: 'EGP', name: 'Mısır Lirası', source: 'erapi' },
  { symbol: 'GEL', name: 'Gürcistan Larisi', source: 'erapi' },
  { symbol: 'AZN', name: 'Azerbaycan Manatı', source: 'erapi' },
  { symbol: 'UAH', name: 'Ukrayna Grivnası', source: 'erapi' },
  { symbol: 'PKR', name: 'Pakistan Rupisi', source: 'erapi' },
  { symbol: 'PHP', name: 'Filipin Pesosu', source: 'erapi' },
  { symbol: 'IDR', name: 'Endonezya Rupisi', source: 'erapi' },
  { symbol: 'MYR', name: 'Malezya Ringgiti', source: 'erapi' },
  { symbol: 'TWD', name: 'Tayvan Doları', source: 'erapi' },
  { symbol: 'VND', name: 'Vietnam Dongu', source: 'erapi' },
  { symbol: 'RSD', name: 'Sırp Dinarı', source: 'erapi' },
];

const FLAG_BY_SYMBOL = {
  USD: 'us', EUR: 'eu', GBP: 'gb', CHF: 'ch', JPY: 'jp', AUD: 'au',
  CAD: 'ca', DKK: 'dk', PLN: 'pl', KWD: 'kw', NOK: 'no', SAR: 'sa',
  SEK: 'se', BGN: 'bg', CNY: 'cn', HKD: 'hk', KRW: 'kr', RUB: 'ru',
  AED: 'ae', QAR: 'qa', INR: 'in', BRL: 'br', MXN: 'mx', SGD: 'sg',
  THB: 'th', NZD: 'nz', ZAR: 'za', HUF: 'hu', CZK: 'cz', RON: 'ro',
  ILS: 'il', EGP: 'eg', GEL: 'ge', AZN: 'az', UAH: 'ua', PKR: 'pk',
  PHP: 'ph', IDR: 'id', MYR: 'my', TWD: 'tw', VND: 'vn', RSD: 'rs',
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

async function fetchErApiRates() {
  const res = await fetch(ER_API_URL, {
    headers: { 'User-Agent': 'PortfoyTakip/1.0 (doviz sync)' },
  });
  if (!res.ok) {
    throw new Error(`open.er-api.com ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (data.result !== 'success') {
    throw new Error('open.er-api.com result: ' + data.result);
  }
  return data.rates || {};
}

async function getExistingDovizMidnight(supabase) {
  const { data, error } = await supabase
    .from('assets')
    .select('symbol, price_at_midnight, price_midnight_date')
    .eq('category_id', 'doviz');
  if (error) throw new Error('Doviz mevcut kayitlar: ' + error.message);
  const map = new Map();
  for (const row of data || []) {
    map.set((row.symbol || '').toUpperCase(), {
      price_at_midnight: row.price_at_midnight,
      price_midnight_date: row.price_midnight_date,
    });
  }
  return map;
}

async function upsertDovizAssets(supabase, dovizRates, erApiRates, todayTurkey, existingMidnight) {
  const now = new Date().toISOString();
  const rows = [];

  const usdTry = dovizRates['USDTRY'] || erApiRates['TRY'] || null;

  for (const pair of FOREX_PAIRS) {
    let currentPrice = null;

    if (pair.key) {
      const raw = dovizRates[pair.key];
      if (raw != null && typeof raw === 'number' && Number.isFinite(raw)) {
        currentPrice = raw;
      }
    }

    if (currentPrice == null && usdTry) {
      const rateVsUsd = erApiRates[pair.symbol];
      if (rateVsUsd != null && rateVsUsd > 0) {
        currentPrice = usdTry / rateVsUsd;
      }
    }

    if (currentPrice == null) {
      console.log(`  - ${pair.symbol} (${pair.name}): kur bulunamadi, atlaniyor.`);
      continue;
    }

    const ex = existingMidnight.get(pair.symbol) || {};
    const midnightDate = ex.price_midnight_date;
    const isNewDay = !midnightDate || String(midnightDate) < todayTurkey;
    const priceAtMidnight = isNewDay ? currentPrice : (ex.price_at_midnight ?? currentPrice);
    const priceMidnightDate = isNewDay ? todayTurkey : midnightDate;
    const changePct =
      priceAtMidnight && priceAtMidnight > 0
        ? ((currentPrice - priceAtMidnight) / priceAtMidnight) * 100
        : null;

    const flagCode = FLAG_BY_SYMBOL[pair.symbol];
    const iconUrl = flagCode ? `https://flagcdn.com/w40/${flagCode}.png` : null;

    rows.push({
      category_id: 'doviz',
      symbol: pair.symbol,
      name: pair.name,
      currency: pair.symbol,
      current_price: currentPrice,
      icon_url: iconUrl,
      price_updated_at: now,
      price_at_midnight: priceAtMidnight,
      price_midnight_date: priceMidnightDate,
      change_24h_pct: changePct,
    });
  }

  if (rows.length === 0) {
    console.log('Uyari: hicbir kur bulunamadi.');
    return 0;
  }

  const { error, count } = await supabase
    .from('assets')
    .upsert(rows, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });

  if (error) throw new Error('Doviz upsert: ' + error.message);
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
      'Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (veya EXPO_PUBLIC_SUPABASE_ANON_KEY) .env icinde olmali.',
    );
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  const todayTurkey = getTurkeyDateStr();
  console.log('Turkiye gunu:', todayTurkey);

  console.log('doviz.dev kurlari cekiliyor...');
  const dovizRates = await fetchDovizDevRates();
  const meta = dovizRates._meta || {};
  console.log('  doviz.dev:', meta.source || '-', '|', meta.updated_at || '-');

  console.log('open.er-api.com kurlari cekiliyor...');
  let erApiRates = {};
  try {
    erApiRates = await fetchErApiRates();
    console.log('  open.er-api.com: OK (' + Object.keys(erApiRates).length + ' doviz)');
  } catch (e) {
    console.log('  open.er-api.com HATA (sadece doviz.dev kullanilacak):', e.message);
  }

  const existingMidnight = await getExistingDovizMidnight(supabase);
  console.log('Doviz assets upsert ediliyor...');
  const affected = await upsertDovizAssets(supabase, dovizRates, erApiRates, todayTurkey, existingMidnight);
  console.log('Guncellenen/eklenen doviz sayisi:', affected);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
