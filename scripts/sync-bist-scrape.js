/**
 * BIST hisse senedi batch (ekran kazıma):
 * - Öncelik sırasıyla kaynaklar: BigPara (harf sayfaları ile geniş liste) → Uzmanpara canlı borsa
 * - Buna ek olarak herkese açık bir master BIST listesi ile birleştirilir; böylece eksik / yeni halka arz
 *   semboller de assets tablosuna düzenli düşer.
 * - Kod, ad, son fiyat, değişim %, (varsa) güncelleme alanlarını parse eder
 * - Supabase'de category_id = 'bist' olan assets kayıtlarını sembole göre UPSERT eder
 * - Eski BIST asset silme: yalnızca “tam liste” sayılırken (varsayılan ≥350 satır); kısmi yedeklerde silme yapılmaz
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
 *   BIST_SCRAPE_USER_AGENT=...
 *   BIST_SCRAPE_FULL_LIST_MIN=350   (bu sayıdan az satır “kısmi liste”; silme adımı atlanır)
 *   (Ücretli API: sync-bist-assets.js — NOSYAPI_KEY)
 */

const BIST_SCRAPE_ALLOW_FAILURE = process.env.BIST_SCRAPE_ALLOW_FAILURE === '1';
const BIST_SCRAPE_FETCH_ATTEMPTS = Math.max(1, Number(process.env.BIST_SCRAPE_FETCH_ATTEMPTS || '3'));
const BIST_SCRAPE_RETRY_DELAY_MS = Math.max(0, Number(process.env.BIST_SCRAPE_RETRY_DELAY_MS || '2500'));
const BIST_SCRAPE_FULL_LIST_MIN = Math.max(1, Number(process.env.BIST_SCRAPE_FULL_LIST_MIN || '350'));
const BIST_MASTER_LIST_URL =
  process.env.BIST_MASTER_LIST_URL ||
  'https://raw.githubusercontent.com/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos/main/bist.json';
const BIST_BIGPARA_UNIVERSE_URL =
  process.env.BIST_BIGPARA_UNIVERSE_URL ||
  'https://bigpara.hurriyet.com.tr/borsa/hisse-fiyatlari/garan-detay/';
const BIST_BIGPARA_NAME_LOOKUP_CONCURRENCY = Math.max(
  1,
  Number(process.env.BIST_BIGPARA_NAME_LOOKUP_CONCURRENCY || '8'),
);
const BIST_BIGPARA_NAME_LOOKUP_LIMIT = Math.max(
  0,
  Number(process.env.BIST_BIGPARA_NAME_LOOKUP_LIMIT || '160'),
);
const BIGPARA_NON_SYMBOL_STOPWORDS = new Set(['OCAK', 'SUBAT', 'MART', 'NISAN', 'MAYIS', 'EYLUL', 'EKIM', 'KASIM']);

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

async function fetchJsonOnce(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Number(process.env.BIST_SCRAPE_FETCH_TIMEOUT_MS || '45000'));
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          process.env.BIST_SCRAPE_USER_AGENT ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`BIST JSON fetch hatası ${res.status} @ ${url}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** @param {string[]} urls */
async function fetchHtmlFromUrlList(urls) {
  let lastError = null;
  for (let attempt = 1; attempt <= BIST_SCRAPE_FETCH_ATTEMPTS; attempt++) {
    for (const url of urls) {
      try {
        if (attempt > 1 || url !== urls[0]) {
          console.log(`BIST fetch deneme ${attempt}/${BIST_SCRAPE_FETCH_ATTEMPTS} → ${url}`);
        }
        return await fetchHtmlOnce(url);
      } catch (e) {
        lastError = e;
      }
    }
    if (attempt < BIST_SCRAPE_FETCH_ATTEMPTS && BIST_SCRAPE_RETRY_DELAY_MS > 0) {
      console.warn(
        `BIST fetch turu ${attempt} başarısız, ${BIST_SCRAPE_RETRY_DELAY_MS}ms bekleniyor…`,
        lastError?.message || lastError,
      );
      await sleep(BIST_SCRAPE_RETRY_DELAY_MS);
    }
  }
  throw lastError || new Error('BIST HTML fetch başarısız.');
}

async function fetchPublicBistMasterList() {
  let lastError = null;
  for (let attempt = 1; attempt <= BIST_SCRAPE_FETCH_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`BIST master liste deneme ${attempt}/${BIST_SCRAPE_FETCH_ATTEMPTS} → ${BIST_MASTER_LIST_URL}`);
      }
      const body = await fetchJsonOnce(BIST_MASTER_LIST_URL);
      const rows = Array.isArray(body) ? body : [];
      const out = rows
        .map((row) => ({
          code: String(row?.symbol || '')
            .trim()
            .toUpperCase(),
          name: String(row?.name || '')
            .trim(),
          last: null,
          changePct: null,
          updatedAtIso: null,
        }))
        .filter((row) => row.code.length >= 2);
      if (out.length > 0) return out;
      throw new Error('Master liste boş döndü.');
    } catch (e) {
      lastError = e;
      if (attempt < BIST_SCRAPE_FETCH_ATTEMPTS && BIST_SCRAPE_RETRY_DELAY_MS > 0) {
        await sleep(BIST_SCRAPE_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError || new Error('BIST master liste fetch başarısız.');
}

function mergeScrapedRowsWithMasterList(scrapedRows, masterRows) {
  const bySymbol = new Map();

  for (const row of masterRows) {
    const symbol = String(row.code || '').trim().toUpperCase();
    if (!symbol) continue;
    bySymbol.set(symbol, {
      code: symbol,
      name: row.name || symbol,
      last: null,
      changePct: null,
      updatedAtIso: null,
    });
  }

  for (const row of scrapedRows) {
    const symbol = String(row.code || '').trim().toUpperCase();
    if (!symbol) continue;
    const prev = bySymbol.get(symbol);
    const hasPrice = row.last != null && Number.isFinite(Number(row.last));
    const prevHasPrice = prev?.last != null && Number.isFinite(Number(prev.last));
    const merged = {
      code: symbol,
      // Master listedeki şirket adı, scrape slug'ından genelde daha temiz.
      name: prev?.name || row.name || symbol,
      last: hasPrice ? row.last : (prev?.last ?? null),
      changePct: hasPrice ? row.changePct : (prev?.changePct ?? null),
      updatedAtIso: hasPrice ? row.updatedAtIso : (prev?.updatedAtIso ?? null),
    };
    if (!prev || (!prevHasPrice && hasPrice)) {
      bySymbol.set(symbol, merged);
      continue;
    }
    if (hasPrice) bySymbol.set(symbol, merged);
  }

  return Array.from(bySymbol.values());
}

function isBigparaUniverseSymbolCandidate(symbol) {
  if (!symbol) return false;
  if (!/^[A-Z0-9]{4,5}$/.test(symbol)) return false;
  if (/^\d+$/.test(symbol)) return false;
  if (BIGPARA_NON_SYMBOL_STOPWORDS.has(symbol)) return false;
  return true;
}

function parseBigparaUniverseSymbols(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const out = new Set();
  $('option').each((_, el) => {
    const value = String($(el).attr('value') || '')
      .trim()
      .toUpperCase();
    const label = $(el).text().trim().toUpperCase();
    const symbol = value || label;
    if (!symbol || symbol !== label) return;
    if (!isBigparaUniverseSymbolCandidate(symbol)) return;
    out.add(symbol);
  });
  return Array.from(out.values()).sort();
}

async function fetchBigparaUniverseSymbols() {
  const fetched = await fetchHtmlFromUrlList([BIST_BIGPARA_UNIVERSE_URL]);
  return parseBigparaUniverseSymbols(fetched.html);
}

async function fetchExistingBistAssetNameMap(supabase) {
  const pageSize = 1000;
  let from = 0;
  const out = new Map();
  for (;;) {
    const { data, error } = await supabase
      .from('assets')
      .select('symbol, name')
      .eq('category_id', 'bist')
      .order('symbol', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`BIST mevcut asset isimleri: ${error.message}`);
    const chunk = data || [];
    for (const row of chunk) {
      const symbol = String(row.symbol || '')
        .trim()
        .toUpperCase();
      const name = String(row.name || '').trim();
      if (symbol) out.set(symbol, name);
    }
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function hasUsefulName(name, symbol) {
  const cleaned = String(name || '').trim();
  return Boolean(cleaned) && cleaned.toUpperCase() !== symbol;
}

function slugToName(symbol, location) {
  const slugMatch = String(location || '').match(/hisse-fiyatlari\/([^/?#]+)/i);
  if (!slugMatch) return symbol;
  const parts = slugMatch[1]
    .split('-')
    .filter(Boolean)
    .filter((part) => part.toLowerCase() !== 'detay');
  if (parts[0] && parts[0].toUpperCase() === symbol) parts.shift();
  const tail = parts.join(' ').trim();
  return tail ? tail.toUpperCase() : symbol;
}

async function resolveBigparaSymbolName(symbol) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Number(process.env.BIST_SCRAPE_FETCH_TIMEOUT_MS || '45000'));
  try {
    const url = `https://bigpara.hurriyet.com.tr/borsa/hisse-fiyatlari/${symbol.toLowerCase()}-detay/`;
    const res = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent':
          process.env.BIST_SCRAPE_USER_AGENT ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    const location = res.headers.get('location') || '';
    if (/\/borsa\/hisse-fiyatlari\/?$/.test(location)) return symbol;
    return slugToName(symbol, location);
  } catch {
    return symbol;
  } finally {
    clearTimeout(t);
  }
}

async function resolveBigparaUniversePlaceholderRows(symbols, existingNameMap) {
  const resolvedNameMap = new Map();
  const targets = symbols
    .filter((symbol) => !hasUsefulName(existingNameMap.get(symbol), symbol))
    .slice(0, BIST_BIGPARA_NAME_LOOKUP_LIMIT);

  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= targets.length) return;
      const symbol = targets[index];
      const name = await resolveBigparaSymbolName(symbol);
      resolvedNameMap.set(symbol, name);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BIST_BIGPARA_NAME_LOOKUP_CONCURRENCY, targets.length) }, () => worker()),
  );

  return symbols.map((symbol) => ({
    code: symbol,
    name: existingNameMap.get(symbol) || resolvedNameMap.get(symbol) || symbol,
    last: null,
    changePct: null,
    updatedAtIso: null,
  }));
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

/** BigPara canlı borsa: ul.live-stock-item (tablo değil); ~BIST100 civarı kısmi liste. */
function parseBigparaLiveRows(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const rows = [];
  $('ul.live-stock-item[data-symbol]').each((_, el) => {
    const $ul = $(el);
    const code = String($ul.attr('data-symbol') || '')
      .trim()
      .toUpperCase();
    if (!code || code.length < 2) return;
    const lastText = $ul.find(`li#h_td_fiyat_id_${code}`).text().trim();
    const changeText = $ul.find(`li#h_td_yuzde_id_${code}`).text().trim();
    const updatedText = $ul.find(`li#h_td_saat_id_${code}`).text().trim();
    const last = normalizeNumber(lastText);
    const changePct = normalizeNumber(changeText);
    let updatedAtIso = null;
    if (updatedText) {
      const safe = updatedText.replace(' ', 'T');
      const d = new Date(safe);
      if (!Number.isNaN(d.getTime())) updatedAtIso = d.toISOString();
    }
    const href = $ul.find('a[href*="/borsa/hisse-fiyatlari/"]').first().attr('href') || '';
    const slugMatch = href.match(/hisse-fiyatlari\/([^/?#]+)/i);
    let name = code;
    if (slugMatch) {
      const parts = slugMatch[1].split('-').filter(Boolean);
      const noDetay = parts.filter((p) => p.toLowerCase() !== 'detay');
      const tail = noDetay.slice(1).join(' ');
      if (tail) name = tail;
    }
    rows.push({ code, name, last, changePct, updatedAtIso });
  });
  return rows;
}

async function collectBigparaRows() {
  // BigPara ana sayfada çoğunlukla ~100 kayıt var; harf sayfaları ile evren genişletilir.
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'U', 'V', 'X', 'Y', 'Z'];
  const urls = [
    'https://bigpara.hurriyet.com.tr/borsa/canli-borsa/',
    ...letters.map((l) => `https://bigpara.hurriyet.com.tr/borsa/canli-borsa/?harf=${l}`),
  ];
  const out = [];
  for (const url of urls) {
    try {
      const { html } = await fetchHtmlFromUrlList([url]);
      const rows = parseBigparaLiveRows(html);
      if (rows.length) {
        out.push(...rows);
        console.log(`BIST BigPara sayfa: ${url} → ${rows.length} satır`);
      }
      await sleep(150);
    } catch (e) {
      console.warn(`BIST BigPara sayfa hatası ${url}:`, e?.message || e);
    }
  }
  return out;
}

/** Uzmanpara (Milliyet) canlı borsa: 5 sütunlu tablo; kısmi liste. */
function parseUzmanparaTableRows(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const rows = [];
  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length !== 5) return;
    const rawCode = $(tds[0]).text().trim();
    const code = rawCode.replace(/[\[\]\s]/g, '').toUpperCase();
    if (!code || code.length < 2) return;
    const lastText = $(tds[2]).text().trim();
    const changeText = $(tds[3]).text().trim();
    const updatedText = $(tds[4]).text().trim();
    const last = normalizeNumber(lastText);
    const changePct = normalizeNumber(changeText);
    let updatedAtIso = null;
    if (updatedText) {
      const safe = updatedText.replace(' ', 'T');
      const d = new Date(safe);
      if (!Number.isNaN(d.getTime())) updatedAtIso = d.toISOString();
    }
    rows.push({ code, name: code, last, changePct, updatedAtIso });
  });
  return rows;
}

const BIST_SCRAPE_SOURCES = [
  {
    id: 'bigpara.hurriyet.com.tr',
    collectRows: collectBigparaRows,
    minRows: 180,
    parse: parseBigparaLiveRows,
  },
  {
    id: 'uzmanpara.milliyet.com.tr',
    urls: ['https://uzmanpara.milliyet.com.tr/canli-borsa/'],
    minRows: 40,
    parse: parseUzmanparaTableRows,
  },
];

/** Sırayla kaynakları dener: fetch → parse; yeterli satır yoksa sıradaki kaynak. */
async function fetchAndParseBistChain() {
  let lastError = null;
  for (const src of BIST_SCRAPE_SOURCES) {
    try {
      console.log(`BIST kaynak: ${src.id}`);
      let rows = [];
      let sourceUrl = '';
      if (typeof src.collectRows === 'function') {
        rows = await src.collectRows();
        sourceUrl = 'multi-page';
      } else {
        const fetched = await fetchHtmlFromUrlList(src.urls);
        rows = src.parse(fetched.html);
        sourceUrl = fetched.sourceUrl;
      }
      if (rows.length >= src.minRows) {
        console.log(`BIST parse OK (${src.id}): ${rows.length} satır, URL: ${sourceUrl}`);
        return { rows, sourceUrl, sourceId: src.id };
      }
      console.warn(`BIST ${src.id}: yetersiz satır (${rows.length} < ${src.minRows}), sıradaki kaynak…`);
    } catch (e) {
      lastError = e;
      console.warn(`BIST ${src.id} başarısız:`, e?.message || e);
    }
  }
  throw lastError || new Error('Tüm BIST scrape kaynakları başarısız veya parse yetersiz.');
}

async function upsertBistAssets(supabase, rows) {
  const now = new Date().toISOString();

  // Aynı sembol birden fazla kez gelirse (sayfa tekrarları), tek satıra indir.
  const bySymbol = new Map();
  for (const r of rows) {
    const symbol = String(r.code || '')
      .trim()
      .toUpperCase();
    if (!symbol) continue;
    const prev = bySymbol.get(symbol);
    if (!prev) {
      bySymbol.set(symbol, r);
      continue;
    }
    const prevHasPrice = prev.last != null && Number.isFinite(Number(prev.last));
    const curHasPrice = r.last != null && Number.isFinite(Number(r.last));
    if (!prevHasPrice && curHasPrice) {
      bySymbol.set(symbol, r);
      continue;
    }
    if (curHasPrice) bySymbol.set(symbol, r);
  }

  const dedupedRows = Array.from(bySymbol.values());
  if (dedupedRows.length !== rows.length) {
    console.warn(
      `[sync-bist-scrape] Yinelenen semboller ayıklandı: toplam=${rows.length}, tekil=${dedupedRows.length}`,
    );
  }

  const payload = dedupedRows.map((r) => ({
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

  console.log('BIST scrape zinciri (BigPara → Uzmanpara)…');
  let rows;
  let sourceUrl = null;
  let sourceId = null;
  try {
    const parsed = await fetchAndParseBistChain();
    rows = parsed.rows;
    sourceUrl = parsed.sourceUrl;
    sourceId = parsed.sourceId;
    console.log('BIST kaynak:', sourceId, 'URL:', sourceUrl);
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

  console.log('Toplam satır:', rows.length);

  if (!rows.length) {
    if (BIST_SCRAPE_ALLOW_FAILURE) {
      console.warn('[sync-bist-scrape] Hiç satır parse edilemedi, adım soft-fail geçiliyor.');
      return;
    }
    console.error('Hiç satır parse edilemedi, script iptal.');
    process.exit(1);
  }

  let masterRows = [];
  try {
    console.log('BIST master liste çekiliyor…');
    masterRows = await fetchPublicBistMasterList();
    console.log('BIST master liste satırı:', masterRows.length);
  } catch (e) {
    console.warn('[sync-bist-scrape] BIST master liste alınamadı, scrape listesiyle devam ediliyor:', e?.message || e);
  }

  if (masterRows.length > 0) {
    rows = mergeScrapedRowsWithMasterList(rows, masterRows);
    console.log('Master liste ile birleştirilmiş toplam BIST satırı:', rows.length);
  }

  try {
    console.log('BigPara sembol evreni çekiliyor…');
    const universeSymbols = await fetchBigparaUniverseSymbols();
    console.log('BigPara sembol evreni satırı:', universeSymbols.length);
    const currentSymbols = new Set(rows.map((row) => String(row.code || '').trim().toUpperCase()).filter(Boolean));
    const missingUniverseSymbols = universeSymbols.filter((symbol) => !currentSymbols.has(symbol));
    if (missingUniverseSymbols.length > 0) {
      console.log('Master/scrape dışında kalan ek BigPara sembolleri:', missingUniverseSymbols.length);
      const existingNameMap = await fetchExistingBistAssetNameMap(supabase);
      const placeholderRows = await resolveBigparaUniversePlaceholderRows(missingUniverseSymbols, existingNameMap);
      rows = mergeScrapedRowsWithMasterList(rows, placeholderRows);
      console.log('BigPara evreni ile birleştirilmiş toplam BIST satırı:', rows.length);
    }
  } catch (e) {
    console.warn('[sync-bist-scrape] BigPara sembol evreni alınamadı, mevcut listeyle devam ediliyor:', e?.message || e);
  }

  console.log('Supabase assets (bist) upsert…');
  const affected = await upsertBistAssets(supabase, rows);
  console.log('Etkilenen asset sayısı (insert + update):', affected);

  const codes = rows.map((r) => r.code);
  const fullList = rows.length >= BIST_SCRAPE_FULL_LIST_MIN;
  if (!fullList) {
    console.warn(
      `[sync-bist-scrape] Kısmi liste (${rows.length} satır < ${BIST_SCRAPE_FULL_LIST_MIN}): ` +
        'listede olmayan BIST asset silme adımı atlandı (yedek kaynak veya eksik parse).',
    );
  } else {
    console.log('Listede olmayan eski BIST assetleri temizleniyor…');
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

