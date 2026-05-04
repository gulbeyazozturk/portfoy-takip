/**
 * BIST hisse senedi batch (ekran kazıma):
 * - Öncelik sırasıyla kaynaklar: BigPara canlı borsa → Uzmanpara canlı borsa (borsa.net kaldırıldı; sürekli 522/WAF)
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
    urls: ['https://bigpara.hurriyet.com.tr/borsa/canli-borsa/'],
    minRows: 40,
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
      const { html, sourceUrl } = await fetchHtmlFromUrlList(src.urls);
      const rows = src.parse(html);
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

