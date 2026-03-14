/**
 * Emtia fiyatları (XAU, XAG, XPT, XPD) – site kazıma:
 * - https://goldbroker.com/widget/table/XAU,XAG,XPD,XPT?currency=USD sayfasındaki tabloyu çeker
 * - Altın (Gold), Gümüş (Silver), Platin (Platinum), Paladyum (Palladium) için USD bazlı fiyatları okur
 * - Supabase'de category_id = 'emtia' olan assets kayıtlarını sembole göre UPSERT eder
 *   (current_price TL cinsinden: ons fiyatı USD * USDTRY)
 *
 * Çalıştırma:
 *   node scripts/sync-emtia-scrape.js
 *
 * Gereksinim:
 *   - Node 18+ (global fetch)
 *   - npm install cheerio (zaten projede var)
 *   - .env içinde:
 *       EXPO_PUBLIC_SUPABASE_URL
 *       EXPO_PUBLIC_SUPABASE_ANON_KEY  (veya SUPABASE_SERVICE_ROLE_KEY)
 *
 * Not: Bu script, üçüncü parti bir sitenin HTML yapısına bağımlıdır.
 * Site yapısı değişirse selector/parsing fonksiyonu güncellenmelidir.
 */

const GOLD_BROKER_URL =
  'https://goldbroker.com/widget/table/XAU,XAG,XPD,XPT?currency=USD';

const METAL_NAME_TO_SYMBOL = {
  Gold: { symbol: 'XAU', name: 'Altın (ons)' },
  Silver: { symbol: 'XAG', name: 'Gümüş (ons)' },
  Platinum: { symbol: 'XPT', name: 'Platin (ons)' },
  Palladium: { symbol: 'XPD', name: 'Paladyum (ons)' },
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

function normalizeEnNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(/[^\d,.\-]/g, '').trim();
  if (!cleaned) return null;
  // US format: 1,234.56
  const normalized = cleaned.replace(/,/g, '');
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

async function fetchGoldBrokerHtml() {
  const res = await fetch(GOLD_BROKER_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PortfoyTakipBot/1.0)',
    },
  });
  if (!res.ok) {
    throw new Error(
      `GoldBroker HTML fetch hatası ${res.status}: ${await res.text()}`,
    );
  }
  return res.text();
}

function parseMetalRows(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);

  const rows = [];

  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 3) return;

    const nameText = $(tds[0]).text().trim();
    const bidText = $(tds[1]).text().trim();
    const askText = $(tds[2]).text().trim();
    const perfText = tds.length >= 4 ? $(tds[3]).text().trim() : '';

    if (!nameText) return;

    let meta = null;
    for (const [key, val] of Object.entries(METAL_NAME_TO_SYMBOL)) {
      if (nameText.includes(key)) {
        meta = val;
        break;
      }
    }
    if (!meta) return;

    const bid = normalizeEnNumber(bidText);
    const ask = normalizeEnNumber(askText);
    // Portföy maliyetini daha konservatif görmek için alış (bid) fiyatını baz al.
    const priceUsd = bid ?? ask ?? null;
    if (priceUsd == null) return;

    const changePct = normalizeEnNumber(perfText);

    rows.push({
      symbol: meta.symbol,
      name: meta.name,
      priceUsd,
      change_24h_pct: changePct != null ? changePct : null,
    });
  });

  return rows;
}

async function getUsdTryFromAssets(supabase) {
  const { data, error } = await supabase
    .from('assets')
    .select('current_price')
    .eq('category_id', 'doviz')
    .eq('symbol', 'USD')
    .maybeSingle();
  if (error) {
    console.error('USDTRY okuma hatası (assets):', error.message);
  }
  const val = data?.current_price;
  const num = val == null ? null : Number(val);
  if (num && Number.isFinite(num) && num > 0) return num;
  console.warn('USDTRY bulunamadı, 1 olarak varsayılıyor.');
  return 1;
}

async function upsertEmtiaAssets(supabase, rows) {
  if (!rows.length) {
    console.log('Uyarı: metal tablosunda kullanılabilir satır bulunamadı.');
    return 0;
  }
  const usdTry = await getUsdTryFromAssets(supabase);
  const now = new Date().toISOString();

  const payload = rows.map((r) => {
    const priceTl = Number(r.priceUsd) * usdTry;
    return {
      category_id: 'emtia',
      symbol: r.symbol,
      name: r.name,
      currency: 'TRY',
      current_price: priceTl,
      change_24h_pct: r.change_24h_pct ?? null,
      price_updated_at: now,
    };
  });

  const { error, count } = await supabase
    .from('assets')
    .upsert(payload, {
      onConflict: 'category_id,symbol',
      ignoreDuplicates: false,
      count: 'exact',
    });

  if (error) throw new Error('Emtia upsert hatası: ' + error.message);
  return typeof count === 'number' ? count : payload.length;
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
      'Eksik: EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY (veya SUPABASE_SERVICE_ROLE_KEY) .env içinde olmalı.',
    );
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  console.log('GoldBroker metal tablosu çekiliyor…');
  const html = await fetchGoldBrokerHtml();
  const rows = parseMetalRows(html);
  console.log(
    'Parse edilen metal sayısı:',
    rows.length,
    rows.map((r) => r.symbol).join(', '),
  );

  const affected = await upsertEmtiaAssets(supabase, rows);
  console.log('Güncellenen/eklenen emtia satırı sayısı:', affected);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

