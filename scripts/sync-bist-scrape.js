/**
 * BIST hisse senedi batch (ekran kazıma):
 * - https://www.borsa.net/hisse sayfasından HTML tabloyu çeker
 * - Kod, ad, son fiyat, son güncelleme alanlarını parse eder
 * - Supabase'de category_id = 'bist' olan assets kayıtlarını sembole göre UPSERT eder
 * - Borsa.net listesinden düşen ve holdings'te kullanılmayan eski BIST asset'leri siler
 *
 * Çalıştırma:
 *   npm run sync-bist-scrape
 *
 * Gereksinim:
 *   - Node 18+ (global fetch var)
 *   - npm install cheerio
 *   - .env içinde:
 *       EXPO_PUBLIC_SUPABASE_URL
 *       EXPO_PUBLIC_SUPABASE_ANON_KEY  (veya SUPABASE_SERVICE_ROLE_KEY)
 *
 * Not: Bu script, üçüncü parti bir sitenin HTML yapısına bağımlıdır.
 * Site yapısı değişirse selector'lar güncellenmelidir.
 *
 * Opsiyonel ortam (522 / geçici ağ için):
 *   BIST_SCRAPE_FETCH_ATTEMPTS=3
 *   BIST_SCRAPE_RETRY_DELAY_MS=2500
 *   BIST_SCRAPE_FETCH_TIMEOUT_MS=45000
 *   BIST_SCRAPE_USER_AGENT=...   (GitHub Actions IP’sinde 522 görülürse NosyAPI tabanlı sync-bist-assets.js alternatifi: NOSYAPI_KEY)
 */

const BIST_URLS = [
  'https://www.borsa.net/hisse',
  'https://www.borsa.net/borsa/hisseler',
  'https://borsa.net/hisse',
];
const BIST_SCRAPE_ALLOW_FAILURE = process.env.BIST_SCRAPE_ALLOW_FAILURE === '1';
const BIST_SCRAPE_FETCH_ATTEMPTS = Math.max(1, Number(process.env.BIST_SCRAPE_FETCH_ATTEMPTS || '3'));
const BIST_SCRAPE_RETRY_DELAY_MS = Math.max(0, Number(process.env.BIST_SCRAPE_RETRY_DELAY_MS || '2500'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function fetchHtmlOnce(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Number(process.env.BIST_SCRAPE_FETCH_TIMEOUT_MS || '45000'));
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          process.env.BIST_SCRAPE_USER_AGENT ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`BIST HTML fetch hatası ${res.status} @ ${url}: ${body.slice(0, 200)}`);
    }
    const html = await res.text();
    return { html, sourceUrl: url };
  } finally {
    clearTimeout(t);
  }
}

async function fetchHtml() {
  let lastError = null;
  for (let attempt = 1; attempt <= BIST_SCRAPE_FETCH_ATTEMPTS; attempt++) {
    for (const url of BIST_URLS) {
      try {
        if (attempt > 1 || url !== BIST_URLS[0]) {
          console.log(`BIST deneme ${attempt}/${BIST_SCRAPE_FETCH_ATTEMPTS} → ${url}`);
        }
        return await fetchHtmlOnce(url);
      } catch (e) {
        lastError = e;
      }
    }
    if (attempt < BIST_SCRAPE_FETCH_ATTEMPTS && BIST_SCRAPE_RETRY_DELAY_MS > 0) {
      console.warn(`BIST fetch denemesi ${attempt} başarısız, ${BIST_SCRAPE_RETRY_DELAY_MS}ms bekleniyor…`, lastError?.message || lastError);
      await sleep(BIST_SCRAPE_RETRY_DELAY_MS);
    }
  }
  throw lastError || new Error('BIST HTML fetch başarısız.');
}

function normalizeNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(/[^\d,.\-]/g, '').trim();
  if (!cleaned) return null;
  // Türkçe formatı (binlik nokta, ondalık virgül) normalize et
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) {
    // Örn: 1.234,56 -> 1234.56
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    // Örn: 16,89 -> 16.89
    normalized = cleaned.replace(',', '.');
  }
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseBistRows(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);

  const rows = [];

  // Sayfadaki ana BIST tablosu tek olduğu için basit selector kullanıyoruz.
  // Header yapısı: Kod | Ad | Son Fiyat | Değişim % | Hacim | Trend | Son Güncelleme
  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 4) return;

    const rawCode = $(tds[0]).text().trim();
    const code = rawCode.replace(/[\[\]\s]/g, '').toUpperCase();
    if (!code) return;

    const nameCell = $(tds[1]);
    const anchor = nameCell.find('a').first();
    const title = anchor.attr('title')?.trim();
    const linkText = anchor.text().trim();
    const cellText = nameCell.text().trim();
    const sameAsCode = (s) => !s || s.replace(/\s/g, '').toUpperCase() === code;
    // Önce title (genelde tam unvan), sonra link, sonra hücre metni
    let name = code;
    for (const c of [title, linkText, cellText]) {
      if (c && !sameAsCode(c)) {
        name = c.trim();
        break;
      }
    }
    const lastText = $(tds[2]).text().trim();
    const changeText = $(tds[3]).text().trim();
    const updatedText = tds.length >= 7 ? $(tds[6]).text().trim() : null;

    const last = normalizeNumber(lastText);
    const changePct = normalizeNumber(changeText);

    let updatedAtIso = null;
    if (updatedText) {
      const safe = updatedText.replace(' ', 'T');
      const d = new Date(safe);
      if (!Number.isNaN(d.getTime())) {
        updatedAtIso = d.toISOString();
      }
    }

    rows.push({
      code,
      name,
      last,
      changePct,
      updatedAtIso,
    });
  });

  return rows;
}

async function upsertBistAssets(supabase, rows) {
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    category_id: 'bist',
    symbol: r.code,
    name: r.name,
    currency: 'TRY',
    external_id: r.code,
    current_price: r.last,
    change_24h_pct: r.changePct,
    price_updated_at: r.updatedAtIso || now,
  }));

  const chunkSize = 500;
  let affected = 0;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const slice = payload.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from('assets')
      .upsert(slice, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });
    if (error) throw new Error('BIST upsert hatası: ' + error.message);
    if (typeof count === 'number') affected += count;
  }
  return affected || payload.length;
}

async function deleteRemovedBistAssets(supabase, validCodes) {
  const valid = new Set(validCodes.map((c) => c.toUpperCase()));

  const { data: existing, error } = await supabase
    .from('assets')
    .select('id, symbol')
    .eq('category_id', 'bist');
  if (error) throw new Error('BIST assets select hatası: ' + error.message);

  const candidates = (existing || []).filter(
    (row) => !valid.has((row.symbol || '').toUpperCase()),
  );
  if (!candidates.length) {
    return { tried: 0, deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  for (const row of candidates) {
    // Önce holdings'te kullanılıyor mu kontrol et
    const { data: holdingRows, error: hErr } = await supabase
      .from('holdings')
      .select('id')
      .eq('asset_id', row.id)
      .limit(1);
    if (hErr) {
      console.error('Holdings kontrol hatası', row.symbol, hErr.message);
      failed++;
      continue;
    }
    if (holdingRows && holdingRows.length > 0) {
      console.log(`BIST asset ${row.symbol} portföyde kullanılıyor, silinmedi.`);
      continue;
    }

    const { error: delErr } = await supabase.from('assets').delete().eq('id', row.id);
    if (delErr) {
      console.error('BIST asset silme hatası', row.symbol, delErr.message);
      failed++;
    } else {
      deleted++;
    }
  }

  return { tried: candidates.length, deleted, failed };
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

  console.log('BIST HTML çekiliyor…', BIST_URLS[0]);
  let html;
  let sourceUrl = null;
  try {
    const fetched = await fetchHtml();
    html = fetched.html;
    sourceUrl = fetched.sourceUrl;
    console.log('BIST kaynak URL:', sourceUrl);
  } catch (e) {
    if (BIST_SCRAPE_ALLOW_FAILURE) {
      console.warn(
        '[sync-bist-scrape] BIST kaynakları erişilemedi, adım soft-fail geçiliyor:',
        e?.message || e,
      );
      return;
    }
    throw e;
  }

  console.log('HTML parse ediliyor…');
  const rows = parseBistRows(html);
  console.log('Toplam satır:', rows.length);

  if (!rows.length) {
    if (BIST_SCRAPE_ALLOW_FAILURE) {
      console.warn('[sync-bist-scrape] Hiç satır parse edilemedi, adım soft-fail geçiliyor.');
      return;
    }
    console.error('Hiç satır parse edilemedi, script iptal.');
    process.exit(1);
  }

  console.log('Supabase assets (bist) upsert…');
  const affected = await upsertBistAssets(supabase, rows);
  console.log('Etkilenen asset sayısı (insert + update):', affected);

  console.log('Listede olmayan eski BIST assetleri temizleniyor…');
  const codes = rows.map((r) => r.code);
  const delStats = await deleteRemovedBistAssets(supabase, codes);
  console.log(
    'Silme özeti -> Aday:',
    delStats.tried,
    'Silinen:',
    delStats.deleted,
    'Başarısız:',
    delStats.failed,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

