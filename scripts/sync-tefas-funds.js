/**
 * TEFAS fon fiyat sync:
 * - tefas.gov.tr gizli API'sinden günlük fon fiyatlarını çeker
 * - Supabase'de category_id = 'fon' olan assets kayıtlarını UPSERT eder
 * - Üç fon tipi: YAT (yatırım fonu), EMK (emeklilik), BYF (borsa yatırım fonu)
 *
 * Çalıştırma: node scripts/sync-tefas-funds.js
 * Gereksinim: .env (Supabase key'leri)
 * Harici API key gerektirmez (ücretsiz).
 */

const TEFAS_BASE = 'https://www.tefas.gov.tr';
const INFO_ENDPOINT = `${TEFAS_BASE}/api/DB/BindHistoryInfo`;

const FUND_TYPES = ['YAT', 'EMK', 'BYF'];

const HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': TEFAS_BASE,
  'Referer': `${TEFAS_BASE}/TarihselVeriler.aspx`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
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

function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function initSession() {
  const res = await fetch(TEFAS_BASE, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
  const cookieHeader = res.headers.get('set-cookie') || '';
  const cookies = cookieHeader
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
  return cookies;
}

async function fetchFundsByType(fundType, cookies) {
  const today = new Date();
  // TEFAS hafta sonu/tatil için "dün" datasını döndürmeyebilir.
  // O yüzden son 3 takvim günü alıp en son 2 kayıttan günlük değişimi hesaplıyoruz.
  const start = new Date(today);
  start.setDate(start.getDate() - 3);

  const bastarih = formatDate(start);
  const bittarih = formatDate(today);

  const body = `fontip=${fundType}&fonkod=&bastarih=${bastarih}&bittarih=${bittarih}`;

  const res = await fetch(INFO_ENDPOINT, {
    method: 'POST',
    headers: HEADERS,
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TEFAS ${fundType} HTTP ${res.status}: ${text.substring(0, 200)}`);
  }

  const text = await res.text();
  if (!text || text.length < 2) return [];
  const json = JSON.parse(text);
  return json.data || [];
}

async function fetchAllFunds() {
  // code -> { _fundType, entriesByTs: Map<number, item> }
  const allFunds = new Map();

  for (const ft of FUND_TYPES) {
    console.log(`  ${ft} fonları çekiliyor...`);
    try {
      const data = await fetchFundsByType(ft);
      console.log(`  ${ft}: ${data.length} kayıt`);

      for (const item of data) {
        const code = (item.FONKODU || '').trim().toUpperCase();
        if (!code) continue;
        const ts = item.TARIH ? parseInt(item.TARIH.substring(0, 10), 10) : 0;
        if (!ts) continue;

        const existing = allFunds.get(code) || { _fundType: ft, entriesByTs: new Map() };
        existing.entriesByTs.set(ts, item);
        allFunds.set(code, existing);
      }
    } catch (err) {
      console.warn(`  ${ft} hatası:`, err.message);
    }
    await sleep(1500);
  }

  const out = [];
  for (const [code, rec] of allFunds.entries()) {
    const entries = Array.from(rec.entriesByTs.entries())
      .map(([ts, item]) => ({ ...item, _ts: ts }))
      .sort((a, b) => a._ts - b._ts);

    const last = entries[entries.length - 1];
    const prev = entries[entries.length - 2];

    const todayPrice = last?.FIYAT != null ? Number(last.FIYAT) : null;
    const prevPrice = prev?.FIYAT != null ? Number(prev.FIYAT) : null;

    const hasValid =
      todayPrice != null &&
      prevPrice != null &&
      Number.isFinite(todayPrice) &&
      Number.isFinite(prevPrice) &&
      prevPrice > 0;

    const changePct = hasValid ? ((todayPrice - prevPrice) / prevPrice) * 100 : null;

    out.push({
      ...last,
      _fundType: rec._fundType,
      _change_24h_pct: changePct,
    });
  }

  return out;
}

async function upsertFonAssets(supabase, funds) {
  const now = new Date().toISOString();

  const rows = funds.map((f) => {
    const code = (f.FONKODU || '').trim().toUpperCase();
    const change_24h_pct =
      f._change_24h_pct != null && Number.isFinite(Number(f._change_24h_pct)) ? Number(f._change_24h_pct) : null;
    return {
      category_id: 'fon',
      symbol: code,
      name: (f.FONUNVAN || code).trim(),
      currency: 'TRY',
      external_id: code,
      current_price: f.FIYAT != null ? Number(f.FIYAT) : null,
      // PIYADEGISIM TEFAS cevabında sık boş/formatlı geliyor; günlük değişimi FIYAT'tan hesaplıyoruz.
      change_24h_pct: change_24h_pct,
      price_updated_at: now,
    };
  });

  const chunkSize = 500;
  let affected = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from('assets')
      .upsert(slice, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });
    if (error) throw new Error('Fon upsert hatası: ' + error.message);
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
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env içinde olmalı.');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  console.log('TEFAS fonları çekiliyor...');
  const funds = await fetchAllFunds();
  console.log('Toplam benzersiz fon sayısı:', funds.length);

  if (funds.length === 0) {
    console.log('Veri gelmedi. Hafta sonu/tatil olabilir veya TEFAS erişimi engellenmiş olabilir.');
    return;
  }

  console.log('Fon assets upsert ediliyor (category_id = fon)...');
  const affected = await upsertFonAssets(supabase, funds);
  console.log('Etkilenen asset sayısı (insert + update):', affected);

  // Örnek: İlk 5 fon
  console.log('\nÖrnek fonlar:');
  funds.slice(0, 5).forEach((f) => {
    console.log(
      `  ${(f.FONKODU || '').padEnd(6)} ${(f.FONUNVAN || '').substring(0, 40).padEnd(42)} ` +
      `Fiyat: ${f.FIYAT ?? 'N/A'} | 24h%: ${f._change_24h_pct ?? 'N/A'}`
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
