/**
 * Yurtdışı (ABD) hisse + ETF listesi – eksiksiz, resmi kaynak:
 * - NASDAQ Trader resmi listeleri: nasdaqtraded.txt (NASDAQ işlem gören tüm menkul kıymetler) ve
 *   otherlisted.txt (NYSE, AMEX ve diğer borsalar). Test senetleri hariç tutulur.
 * - Hepsi category_id = 'yurtdisi' olarak assets'a UPSERT edilir. Fiyat sync-yurtdisi-prices.js ile güncellenir.
 *
 * Çalıştırma: node scripts/sync-yurtdisi-list.js
 * Gereksinim: .env EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (veya ANON_KEY)
 */

const SOURCES = {
  /** NASDAQ'da işlem gören tüm semboller (hisse, ETF, vb.) – günlük güncellenir */
  nasdaqtraded: 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt',
  /** NYSE, AMEX ve diğer borsalardaki tüm semboller */
  otherlisted: 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt',
  /** Ek kaynak: sadece ETF listesi (resmi listede bazen gecikmeyle çıkanlar için) */
  etfsCsv: 'https://raw.githubusercontent.com/paulperry/quant/master/ETFs.csv',
  etfsCsv2: 'https://raw.githubusercontent.com/echuvyrov/TrackingETFs/master/etfs.csv',
};

/** Resmi listelerde bazen eksik kalan veya aranıp bulunamayan popüler ETF'ler – her sync'te listeye eklenir. */
const EXTRA_ETFS = [
  { symbol: 'GNOM', name: 'Global X Genomics & Biotechnology ETF' },
  { symbol: 'SOXL', name: 'Direxion Daily Semiconductor Bull 3X Shares' },
  { symbol: 'SOXS', name: 'Direxion Daily Semiconductor Bear 3X Shares' },
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ' },
  { symbol: 'SQQQ', name: 'ProShares UltraPro Short QQQ' },
  { symbol: 'UPRO', name: 'ProShares UltraPro S&P 500' },
  { symbol: 'SPXU', name: 'ProShares UltraPro Short S&P 500' },
  { symbol: 'TECL', name: 'Direxion Daily Technology Bull 3X Shares' },
  { symbol: 'FNGU', name: 'MicroSectors FANG+ Index 3X Leveraged ETN' },
  { symbol: 'FNGD', name: 'MicroSectors FANG+ Index -3X Inverse Leveraged ETN' },
  { symbol: 'BULZ', name: 'MicroSectors Solactive FANG & Innovation 3X Leveraged ETN' },
  { symbol: 'BITS', name: 'Global X Blockchain & Bitcoin Strategy ETF' },
  { symbol: 'BITO', name: 'ProShares Bitcoin Strategy ETF' },
  { symbol: 'HODL', name: 'VanEck Bitcoin Strategy ETF' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF' },
  { symbol: 'ARKG', name: 'ARK Genomic Revolution ETF' },
  { symbol: 'ARKW', name: 'ARK Next Generation Internet ETF' },
  { symbol: 'LABU', name: 'Direxion Daily S&P Biotech Bull 3X Shares' },
  { symbol: 'LABD', name: 'Direxion Daily S&P Biotech Bear 3X Shares' },
  { symbol: 'HIBL', name: 'Direxion Daily S&P 500 High Beta Bull 3X Shares' },
  { symbol: 'SPHB', name: 'Invesco S&P 500 High Beta ETF' },
  { symbol: 'TNA', name: 'Direxion Daily Small Cap Bull 3X Shares' },
  { symbol: 'TZA', name: 'Direxion Daily Small Cap Bear 3X Shares' },
  { symbol: 'UDOW', name: 'ProShares UltraPro Dow30' },
  { symbol: 'SDOW', name: 'ProShares UltraPro Short Dow30' },
  { symbol: 'YINN', name: 'Direxion Daily China Bull 3X Shares' },
  { symbol: 'YANG', name: 'Direxion Daily China Bear 3X Shares' },
  { symbol: 'NVDL', name: 'GraniteShares 2x Long NVDA Daily ETF' },
  { symbol: 'NVDS', name: 'GraniteShares 2x Short NVDA Daily ETF' },
  { symbol: 'TSLL', name: 'Direxion Daily TSLA Bull 2X Shares' },
  { symbol: 'TSLS', name: 'Direxion Daily TSLA Bear 2X Shares' },
  { symbol: 'AMPL', name: 'Direxion Daily AMZN Bull 2X Shares' },
  { symbol: 'AMZD', name: 'Direxion Daily AMZN Bear 2X Shares' },
  { symbol: 'WEBL', name: 'Direxion Daily Dow Jones Internet Bull 3X Shares' },
  { symbol: 'WEBS', name: 'Direxion Daily Dow Jones Internet Bear 3X Shares' },
  { symbol: 'ROM', name: 'ProShares Ultra Technology' },
  { symbol: 'REW', name: 'ProShares UltraShort Technology' },
  { symbol: 'USO', name: 'United States Oil Fund' },
  { symbol: 'UNG', name: 'United States Natural Gas Fund' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund' },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund' },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund' },
  { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR Fund' },
  { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund' },
  { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR Fund' },
  { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund' },
  { symbol: 'XLC', name: 'Communication Services Select Sector SPDR Fund' },
  // Ülke / bölge endeks ETF'leri (iShares MSCI vb.)
  { symbol: 'EWJ', name: 'iShares MSCI Japan ETF' },
  { symbol: 'EWY', name: 'iShares MSCI South Korea ETF' },
  { symbol: 'KDEF', name: 'PLUS Korea Defense Industry Index ETF' },
  { symbol: 'EWG', name: 'iShares MSCI Germany ETF' },
  { symbol: 'EWC', name: 'iShares MSCI Canada ETF' },
  { symbol: 'EWU', name: 'iShares MSCI United Kingdom ETF' },
  { symbol: 'EWQ', name: 'iShares MSCI France ETF' },
  { symbol: 'EWZ', name: 'iShares MSCI Brazil ETF' },
  { symbol: 'EWA', name: 'iShares MSCI Australia ETF' },
  { symbol: 'EWH', name: 'iShares MSCI Hong Kong ETF' },
  { symbol: 'EWT', name: 'iShares MSCI Taiwan ETF' },
  { symbol: 'EWW', name: 'iShares MSCI Mexico ETF' },
  { symbol: 'EWI', name: 'iShares MSCI Italy ETF' },
  { symbol: 'EWP', name: 'iShares MSCI Spain ETF' },
  { symbol: 'EWL', name: 'iShares MSCI Switzerland ETF' },
  { symbol: 'EWN', name: 'iShares MSCI Netherlands ETF' },
  { symbol: 'EWD', name: 'iShares MSCI Sweden ETF' },
  { symbol: 'EWK', name: 'iShares MSCI Belgium ETF' },
  { symbol: 'INDA', name: 'iShares MSCI India ETF' },
  { symbol: 'EWM', name: 'iShares MSCI Malaysia ETF' },
  { symbol: 'EWS', name: 'iShares MSCI Singapore ETF' },
  { symbol: 'IDX', name: 'VanEck Indonesia Index ETF' },
  { symbol: 'THD', name: 'iShares MSCI Thailand ETF' },
  { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF' },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF' },
  { symbol: 'VEA', name: 'Vanguard FTSE Developed Markets ETF' },
  { symbol: 'EFA', name: 'iShares MSCI EAFE ETF' },
  { symbol: 'IEMG', name: 'iShares Core MSCI Emerging Markets ETF' },
  { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF' },
  { symbol: 'IXUS', name: 'iShares Core MSCI Total International Stock ETF' },
];

const USER_AGENT = 'Mozilla/5.0 (compatible; PortfoyTakip/1.0; yurtdisi list)';

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

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} ${res.status}: ${await res.text()}`);
  return res.text();
}

/** Pipe ile ayrılmış satır. nasdaqtraded 12 sütun: ..., Security Name(2), ..., Test Issue(7), ... */
function parseNasdaqTraded(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('|').map((p) => p.trim());
    if (parts.length < 8) continue;
    const symbol = parts[1];
    const testIssue = (parts[parts.length >= 12 ? parts.length - 5 : 7] || '').toUpperCase();
    if (!symbol || testIssue === 'Y') continue;
    const name =
      parts.length > 12 ? parts.slice(2, parts.length - 5).join('|').trim() : (parts[2] || symbol);
    rows.push({ symbol, name: name || symbol });
  }
  return rows;
}

/** otherlisted: 8 sütun. ACT Symbol(0), Security Name(1), ..., Test Issue(6). */
function parseOtherListed(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('|').map((p) => p.trim());
    if (parts.length < 7) continue;
    const symbol = parts[0];
    const testIssue = (parts[parts.length >= 8 ? parts.length - 2 : 6] || '').toUpperCase();
    if (!symbol || testIssue === 'Y') continue;
    const name =
      parts.length > 8 ? parts.slice(1, parts.length - 6).join('|').trim() : (parts[1] || symbol);
    rows.push({ symbol, name: name || symbol });
  }
  return rows;
}

/** Virgülle ayrılmış CSV satırı; tırnak içi virgülleri korur. İlk iki sütun: symbol, name. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if ((c === ',' || c === '\t') && !inQuotes) {
      out.push(cur.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      cur = '';
    } else cur += c;
  }
  if (cur.length) out.push(cur.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  return out;
}

/** Paulperry/quant ETFs.csv: Symbol,Name,Index,... (header var) */
function parseEtfCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const symbol = cols[0]?.trim();
    const name = cols[1]?.trim();
    if (!symbol) continue;
    rows.push({ symbol, name: name || symbol });
  }
  return rows;
}

/** TrackingETFs etfs.csv: Symbol,Name (header yok) */
function parseEtfCsv2(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const symbol = cols[0]?.trim();
    const name = cols[1]?.trim();
    if (!symbol) continue;
    rows.push({ symbol, name: name || symbol });
  }
  return rows;
}

function mergeIntoMap(map, rows) {
  for (const r of rows) {
    const sym = (r.symbol || '').toString().trim();
    if (!sym) continue;
    const name = (r.name || sym).toString().trim();
    const key = sym.toUpperCase();
    if (!map.has(key) || (name && name.length > (map.get(key).name || '').length)) {
      map.set(key, { symbol: sym, name: name || sym });
    }
  }
}

async function upsertYurtdisiAssets(supabase, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    category_id: 'yurtdisi',
    symbol: r.symbol,
    name: (r.name || r.symbol || '').slice(0, 500),
    currency: 'USD',
    current_price: null,
    price_updated_at: null,
    change_24h_pct: null,
  }));

  const chunkSize = 200;
  let total = 0;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from('assets')
      .upsert(chunk, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });
    if (error) throw new Error('Yurtdışı list upsert: ' + error.message);
    if (typeof count === 'number') total += count;
  }
  return total || payload.length;
}

async function main() {
  await loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (veya ANON_KEY) .env içinde olmalı.');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  // Önce el ile eklenen ETF’leri kesin yaz (GNOM, SOXL, KDEF, EWJ, EWY vb.)
  if (EXTRA_ETFS.length > 0) {
    const extraPayload = EXTRA_ETFS.map((r) => ({
      category_id: 'yurtdisi',
      symbol: r.symbol,
      name: (r.name || r.symbol || '').slice(0, 500),
      currency: 'USD',
      current_price: null,
      price_updated_at: null,
      change_24h_pct: null,
    }));
    const { error: extraErr } = await supabase
      .from('assets')
      .upsert(extraPayload, { onConflict: 'category_id,symbol', ignoreDuplicates: false });
    if (extraErr) console.warn('EXTRA_ETFS upsert uyarısı:', extraErr.message);
    else console.log('EXTRA_ETFS yazıldı:', extraPayload.length, 'sembol');
  }

  const map = new Map();

  console.log('NASDAQ Trader: nasdaqtraded.txt (tüm NASDAQ sembolleri) çekiliyor…');
  const nasdaqText = await fetchText(SOURCES.nasdaqtraded);
  mergeIntoMap(map, parseNasdaqTraded(nasdaqText));
  console.log('  Satır:', parseNasdaqTraded(nasdaqText).length);

  console.log('NASDAQ Trader: otherlisted.txt (NYSE, AMEX, diğer) çekiliyor…');
  const otherText = await fetchText(SOURCES.otherlisted);
  mergeIntoMap(map, parseOtherListed(otherText));
  console.log('  Satır:', parseOtherListed(otherText).length);

  try {
    console.log('Ek kaynak: ETF listesi (quant/ETFs.csv) çekiliyor…');
    const etfText = await fetchText(SOURCES.etfsCsv);
    const etfRows = parseEtfCsv(etfText);
    mergeIntoMap(map, etfRows);
    console.log('  Satır:', etfRows.length);
  } catch (e) {
    console.warn('  ETF listesi atlandı:', e?.message || e);
  }

  try {
    console.log('Ek kaynak: ETF listesi 2 (TrackingETFs) çekiliyor…');
    const etfText2 = await fetchText(SOURCES.etfsCsv2);
    const etfRows2 = parseEtfCsv2(etfText2);
    mergeIntoMap(map, etfRows2);
    console.log('  Satır:', etfRows2.length);
  } catch (e) {
    console.warn('  ETF listesi 2 atlandı:', e?.message || e);
  }

  console.log('El ile eklenen ETF’ler (GNOM, SOXL, KDEF, vb.) birleştiriliyor…');
  mergeIntoMap(map, EXTRA_ETFS);

  const rows = Array.from(map.values());
  console.log('Toplam benzersiz sembol:', rows.length);

  const affected = await upsertYurtdisiAssets(supabase, rows);
  console.log('Güncellenen/eklenen yurtdışı asset:', affected);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
