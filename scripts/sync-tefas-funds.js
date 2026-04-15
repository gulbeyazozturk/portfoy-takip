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

/** Tarayıcıya yakın UA; TEFAS/WAF bazen datacenter/GitHub IP’lerinde HTML “engel” sayfası döndürür. */
const HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json, text/javascript, */*;q=0.01',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: TEFAS_BASE,
  Referer: `${TEFAS_BASE}/TarihselVeriler.aspx`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

function describeFetchError(err) {
  const e = err || {};
  const parts = [];
  const msg = e.message || String(e);
  if (msg) parts.push(msg);
  const c = e.cause || {};
  if (c && typeof c === 'object') {
    if (c.code) parts.push(`code=${c.code}`);
    if (c.errno) parts.push(`errno=${c.errno}`);
    if (c.syscall) parts.push(`syscall=${c.syscall}`);
    if (c.address) parts.push(`addr=${c.address}`);
    if (c.port) parts.push(`port=${c.port}`);
  }
  return parts.join(' | ');
}

async function fetchWithRetry(url, options, cfg = {}) {
  const retries = cfg.retries ?? 3;
  const timeoutMs = cfg.timeoutMs ?? 20000;
  const backoffMs = cfg.backoffMs ?? 1200;
  let lastErr = null;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (i >= retries) break;
      await sleep(backoffMs * (i + 1));
    }
  }
  throw lastErr;
}

/** TEFAS bazen hata/eksik veride FIYAT=-100 döner; DB'ye yazma. */
function sanitizeTefasFiyat(fiyat) {
  const n = fiyat != null ? Number(fiyat) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n === -100) return null;
  return n;
}

/** Set-Cookie satırlarından name=value parçalarını toplar (aynı isim son değerle ezilir). */
function absorbSetCookiesIntoJar(res, jar) {
  const lines =
    typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const line of lines) {
    const nv = String(line).split(';')[0].trim();
    const eq = nv.indexOf('=');
    if (eq <= 0) continue;
    jar.set(nv.slice(0, eq), nv);
  }
  if (lines.length === 0) {
    const raw = res.headers.get('set-cookie');
    if (!raw) return;
    for (const part of raw.split(/,(?=[^;]+=[^;]*)/)) {
      const nv = part.split(';')[0].trim();
      const eq = nv.indexOf('=');
      if (eq <= 0) continue;
      jar.set(nv.slice(0, eq), nv);
    }
  }
}

function jarToCookieHeader(jar) {
  if (!jar || jar.size === 0) return '';
  return [...jar.values()].join('; ');
}

/**
 * Ana sayfa + TarihselVeriler GET ile çerez toplar; POST öncesi şart (aksi halde sık sık HTML hata sayfası).
 */
async function warmTefasCookies() {
  const jar = new Map();
  const ua = { 'User-Agent': HEADERS['User-Agent'], 'Accept-Language': HEADERS['Accept-Language'] };

  let r = await fetchWithRetry(
    `${TEFAS_BASE}/`,
    { redirect: 'follow', headers: ua },
    { retries: 2, timeoutMs: 15000, backoffMs: 800 },
  );
  absorbSetCookiesIntoJar(r, jar);

  r = await fetchWithRetry(
    `${TEFAS_BASE}/TarihselVeriler.aspx`,
    {
      redirect: 'follow',
      headers: {
        ...ua,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(jar.size ? { Cookie: jarToCookieHeader(jar) } : {}),
      },
    },
    { retries: 2, timeoutMs: 15000, backoffMs: 800 },
  );
  absorbSetCookiesIntoJar(r, jar);

  return jarToCookieHeader(jar);
}

async function fetchFundsByType(fundType, cookieHeader) {
  const today = new Date();
  // TEFAS hafta sonu/tatil için "dün" datasını döndürmeyebilir.
  // O yüzden son 3 takvim günü alıp en son 2 kayıttan günlük değişimi hesaplıyoruz.
  const start = new Date(today);
  start.setDate(start.getDate() - 3);

  const bastarih = formatDate(start);
  const bittarih = formatDate(today);

  const body = `fontip=${fundType}&fonkod=&bastarih=${bastarih}&bittarih=${bittarih}`;

  const headers = {
    ...HEADERS,
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };

  let res;
  try {
    res = await fetchWithRetry(
      INFO_ENDPOINT,
      {
        method: 'POST',
        headers,
        body,
      },
      { retries: 3, timeoutMs: 25000, backoffMs: 1200 },
    );
  } catch (err) {
    throw new Error(`TEFAS ${fundType} fetch failed: ${describeFetchError(err)}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TEFAS ${fundType} HTTP ${res.status}: ${text.substring(0, 200)}`);
  }

  const text = await res.text();
  if (!text || text.length < 2) return [];
  const lead = text.trimStart();
  if (lead.startsWith('<') || lead.startsWith('<!')) {
    throw new Error(
      `TEFAS ${fundType}: JSON yerine HTML döndü (WAF/bot/oturum). GitHub Actions IP’leri bazen engellenir; ` +
        `docs/SYNC-SCHEDULE.md — ilk 60 karakter: ${lead.slice(0, 60).replace(/\s+/g, ' ')}`,
    );
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`TEFAS ${fundType} JSON parse: ${e.message}`);
  }
  return json.data || [];
}

async function fetchAllFunds() {
  // code -> { _fundType, entriesByTs: Map<number, item> }
  const allFunds = new Map();

  function turkeyDateStrFromMs(ms) {
    return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  }

  const todayTurkey = turkeyDateStrFromMs(Date.now());

  let cookieHeader = '';
  try {
    cookieHeader = await warmTefasCookies();
    if (cookieHeader) console.log('  TEFAS çerez oturumu alındı.');
  } catch (e) {
    console.warn('  TEFAS çerez oturumu kurulamadı:', describeFetchError(e));
  }

  for (const ft of FUND_TYPES) {
    console.log(`  ${ft} fonları çekiliyor...`);
    let data = [];
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(2500);
          cookieHeader = await warmTefasCookies();
        }
        data = await fetchFundsByType(ft, cookieHeader);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = String((err && err.message) || err);
        if (attempt === 0 && msg.includes('HTML')) continue;
        break;
      }
    }
    if (lastErr) {
      console.warn(`  ${ft} hatası:`, describeFetchError(lastErr));
    } else {
      console.log(`  ${ft}: ${data.length} kayıt`);
      for (const item of data) {
        const code = (item.FONKODU || '').trim().toUpperCase();
        if (!code) continue;
        // item.TARIH TEFAS'ta genelde milisaniye epoch olarak geliyor.
        const tsMs = item.TARIH ? Number(item.TARIH) : 0;
        if (!tsMs) continue;

        const existing = allFunds.get(code) || { _fundType: ft, entriesByTs: new Map() };
        existing.entriesByTs.set(tsMs, item);
        allFunds.set(code, existing);
      }
    }
    await sleep(1500);
  }

  const out = [];
  for (const [code, rec] of allFunds.entries()) {
    const entries = Array.from(rec.entriesByTs.entries())
      .map(([tsMs, item]) => ({ ...item, _tsMs: tsMs }))
      .sort((a, b) => a._tsMs - b._tsMs);

    const last = entries[entries.length - 1];
    const prev = entries[entries.length - 2];

    const todayPrice = last?.FIYAT != null ? Number(last.FIYAT) : null;
    const prevPrice = prev?.FIYAT != null ? Number(prev.FIYAT) : null;

    const lastDateTurkey = last?._tsMs ? turkeyDateStrFromMs(last._tsMs) : null;
    // TEFAS fonları TR saatine göre sabah bir kez fiyatlanır.
    // Eğer son gelen kayıt "bugün" değilse (00:00-24:00 aralığında henüz güncel veri yoksa),
    // günlük %yi 0 yazarız ki stale değerler yanıltmasın.
    let changePct = 0;
    if (lastDateTurkey === todayTurkey) {
      const hasValid =
        todayPrice != null &&
        prevPrice != null &&
        Number.isFinite(todayPrice) &&
        Number.isFinite(prevPrice) &&
        prevPrice > 0;
      changePct = hasValid ? ((todayPrice - prevPrice) / prevPrice) * 100 : 0;
    }

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
      current_price: sanitizeTefasFiyat(f.FIYAT),
      // Günlük %: fetchAllFunds içinde FIYAT ile hesaplanır (PIYADEGISIM güvenilir değil).
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
