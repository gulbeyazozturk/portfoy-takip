/**
 * 5 yıllık geçmiş fiyat verilerini price_history tablosuna doldurur.
 * Tek seferlik çalıştırılması yeterlidir.
 *
 * Veri Kaynakları:
 *   - yurtdisi : Yahoo Finance (direkt sembol)
 *   - bist     : Yahoo Finance (sembol + '.IS')
 *   - doviz    : Yahoo Finance (sembol + 'TRY=X')
 *   - emtia    : Yahoo (XAU…XPD) + USDTRY; XAUT/PAXG CoinGecko market_chart (TRY)
 *   - kripto   : CoinGecko market_chart (vs_currency=try, days=1825)
 *   - fon      : TEFAS BindHistoryInfo API
 *   - mevduat  : atlanır
 *
 * Çalıştırma: node scripts/backfill-price-history.js
 */

const path = require('path');
const fs = require('fs');

async function loadEnv() {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

function fiveYearsAgo() {
  return new Date(Date.now() - FIVE_YEARS_MS);
}

function formatTefasDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

const EMTIA_YAHOO_MAP = {
  XAU: 'GC=F',
  XAG: 'SI=F',
  XPT: 'PL=F',
  XPD: 'PA=F',
};

/** Emtia kategorisinde olup fiyat geçmişi CoinGecko’dan (external_id) çekilen semboller */
const EMTIA_COINGECKO_SYMBOLS = new Set(['XAUT', 'PAXG']);

const TEFAS_BASE = 'https://www.tefas.gov.tr';
const TEFAS_ENDPOINT = `${TEFAS_BASE}/api/DB/BindHistoryInfo`;
const TEFAS_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  Origin: TEFAS_BASE,
  Referer: `${TEFAS_BASE}/TarihselVeriler.aspx`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
};

async function batchInsert(sb, rows) {
  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await sb.from('price_history').insert(slice);
    if (error) {
      console.warn(`    Insert error (offset ${i}): ${error.message}`);
    } else {
      total += slice.length;
    }
  }
  return total;
}

async function hasExistingHistory(sb, assetId) {
  const { count } = await sb
    .from('price_history')
    .select('id', { count: 'exact', head: true })
    .eq('asset_id', assetId);
  return (count || 0) > 10;
}

// ─── Yahoo Finance ─────────────────────────────────────────────
async function backfillYahoo(sb, yf, assets, symbolTransform, label, usdTryMap) {
  console.log(`\n=== ${label} (Yahoo Finance) — ${assets.length} varlık ===`);
  let done = 0, skipped = 0, failed = 0;

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const yahooSymbol = symbolTransform(asset.symbol);
    if (!yahooSymbol) { skipped++; continue; }

    if (await hasExistingHistory(sb, asset.id)) {
      skipped++;
      continue;
    }

    try {
      const data = await yf.chart(yahooSymbol, {
        period1: fiveYearsAgo(),
        period2: new Date(),
        interval: '1d',
      });

      const quotes = data?.quotes || data || [];
      if (!Array.isArray(quotes) || quotes.length === 0) {
        console.log(`  [${i + 1}/${assets.length}] ${asset.symbol}: veri yok`);
        failed++;
        await sleep(200);
        continue;
      }

      const rows = [];
      for (const q of quotes) {
        const price = q.close ?? q.adjClose;
        const date = q.date;
        if (price == null || !date) continue;

        let finalPrice = Number(price);
        if (usdTryMap && finalPrice > 0) {
          const dateKey = new Date(date).toISOString().slice(0, 10);
          const rate = usdTryMap.get(dateKey);
          if (rate) finalPrice = finalPrice * rate;
          else continue;
        }

        rows.push({
          asset_id: asset.id,
          price: finalPrice,
          recorded_at: new Date(date).toISOString(),
        });
      }

      if (rows.length > 0) {
        const inserted = await batchInsert(sb, rows);
        console.log(`  [${i + 1}/${assets.length}] ${asset.symbol}: ${inserted} gün`);
        done++;
      } else {
        console.log(`  [${i + 1}/${assets.length}] ${asset.symbol}: boş veri`);
        failed++;
      }
    } catch (err) {
      console.warn(`  [${i + 1}/${assets.length}] ${asset.symbol}: HATA — ${err.message.substring(0, 80)}`);
      failed++;
    }

    await sleep(250);
  }

  console.log(`  Özet: ${done} başarılı, ${skipped} atlandı, ${failed} hata`);
}

// ─── USDTRY historical (emtia dönüşüm için) ───────────────────
async function fetchUsdTryHistory(yf) {
  console.log('\n=== USDTRY geçmişi çekiliyor (emtia dönüşüm için) ===');
  try {
    const data = await yf.chart('USDTRY=X', {
      period1: fiveYearsAgo(),
      period2: new Date(),
      interval: '1d',
    });
    const quotes = data?.quotes || data || [];
    const map = new Map();
    for (const q of quotes) {
      if (q.close && q.date) {
        map.set(new Date(q.date).toISOString().slice(0, 10), Number(q.close));
      }
    }
    console.log(`  ${map.size} gün USDTRY verisi alındı`);
    return map;
  } catch (err) {
    console.warn('  USDTRY geçmişi çekilemedi:', err.message);
    return new Map();
  }
}

// ─── CoinGecko ─────────────────────────────────────────────────
async function backfillCoinGecko(sb, assets, sectionTitle = 'Kripto (CoinGecko)') {
  console.log(`\n=== ${sectionTitle} — ${assets.length} varlık ===`);
  let done = 0, skipped = 0, failed = 0;

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const coinId = asset.external_id;
    if (!coinId) { skipped++; continue; }

    if (await hasExistingHistory(sb, asset.id)) {
      skipped++;
      continue;
    }

    try {
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=try&days=1825`;
      const res = await fetch(url);
      if (res.status === 429) {
        console.log(`  [${i + 1}] ${asset.symbol}: Rate limit, 60s bekleniyor...`);
        await sleep(60000);
        i--;
        continue;
      }
      if (!res.ok) {
        console.warn(`  [${i + 1}] ${asset.symbol}: HTTP ${res.status}`);
        failed++;
        await sleep(2000);
        continue;
      }
      const json = await res.json();
      const prices = json.prices || [];

      const rows = prices
        .filter(([, p]) => p != null && p > 0)
        .map(([ts, p]) => ({
          asset_id: asset.id,
          price: p,
          recorded_at: new Date(ts).toISOString(),
        }));

      if (rows.length > 0) {
        const inserted = await batchInsert(sb, rows);
        console.log(`  [${i + 1}/${assets.length}] ${asset.symbol}: ${inserted} nokta`);
        done++;
      } else {
        failed++;
      }
    } catch (err) {
      console.warn(`  [${i + 1}] ${asset.symbol}: HATA — ${err.message.substring(0, 80)}`);
      failed++;
    }

    await sleep(2500);
  }

  console.log(`  Özet: ${done} başarılı, ${skipped} atlandı, ${failed} hata`);
}

// ─── TEFAS ─────────────────────────────────────────────────────
async function backfillTEFAS(sb, assets) {
  console.log(`\n=== Fon (TEFAS) — ${assets.length} varlık ===`);
  let done = 0, skipped = 0, failed = 0;

  const startDate = formatTefasDate(fiveYearsAgo());
  const endDate = formatTefasDate(new Date());
  const FUND_TYPES = ['YAT', 'EMK', 'BYF'];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];

    if (await hasExistingHistory(sb, asset.id)) {
      skipped++;
      continue;
    }

    let allData = [];
    for (const ft of FUND_TYPES) {
      try {
        const body = `fontip=${ft}&fonkod=${asset.symbol}&bastarih=${startDate}&bittarih=${endDate}`;
        const res = await fetch(TEFAS_ENDPOINT, { method: 'POST', headers: TEFAS_HEADERS, body });
        if (!res.ok) continue;
        const text = await res.text();
        if (!text || text.length < 5) continue;
        const json = JSON.parse(text);
        if (json.data && json.data.length > 0) {
          allData = json.data;
          break;
        }
      } catch (_) {}
    }

    if (allData.length === 0) {
      failed++;
      await sleep(500);
      continue;
    }

    const rows = [];
    for (const item of allData) {
      const priceVal = item.FIYAT != null ? Number(item.FIYAT) : null;
      if (priceVal == null || priceVal <= 0) continue;
      let recordedAt;
      if (item.TARIH && item.TARIH.includes('Date(')) {
        const ms = parseInt(item.TARIH.replace(/[^0-9\-]/g, ''), 10);
        recordedAt = new Date(ms).toISOString();
      } else {
        continue;
      }
      rows.push({ asset_id: asset.id, price: priceVal, recorded_at: recordedAt });
    }

    if (rows.length > 0) {
      const inserted = await batchInsert(sb, rows);
      console.log(`  [${i + 1}/${assets.length}] ${asset.symbol}: ${inserted} gün`);
      done++;
    } else {
      failed++;
    }

    await sleep(800);
  }

  console.log(`  Özet: ${done} başarılı, ${skipped} atlandı, ${failed} hata`);
}

// ─── Main ──────────────────────────────────────────────────────
async function main() {
  await loadEnv();
  const { createClient } = require('@supabase/supabase-js');
  const YahooFinance = require('yahoo-finance2').default;
  const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) { console.error('Supabase credentials missing'); process.exit(1); }
  const sb = createClient(url, key);

  // Tüm varlıkları çek
  const { data: allAssets, error } = await sb
    .from('assets')
    .select('id, symbol, category_id, external_id, current_price')
    .not('current_price', 'is', null)
    .gt('current_price', 0);

  if (error) { console.error('Assets fetch error:', error.message); process.exit(1); }
  console.log(`Toplam ${allAssets.length} varlık bulundu.`);

  const byCategory = {};
  for (const a of allAssets) {
    (byCategory[a.category_id] = byCategory[a.category_id] || []).push(a);
  }
  for (const [cat, list] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${list.length}`);
  }

  // 1) USDTRY geçmişi (emtia dönüşüm için)
  const usdTryMap = await fetchUsdTryHistory(yf);

  // 2) Yurtdışı
  if (byCategory.yurtdisi?.length) {
    await backfillYahoo(sb, yf, byCategory.yurtdisi, (sym) => sym, 'Yurtdışı');
  }

  // 3) BIST
  if (byCategory.bist?.length) {
    await backfillYahoo(sb, yf, byCategory.bist, (sym) => `${sym}.IS`, 'BIST');
  }

  // 4) Döviz
  if (byCategory.doviz?.length) {
    await backfillYahoo(sb, yf, byCategory.doviz, (sym) => `${sym}TRY=X`, 'Döviz');
  }

  // 5) Emtia: Yahoo metaller + XAUT/PAXG (CoinGecko)
  if (byCategory.emtia?.length) {
    const intlMetals = byCategory.emtia.filter((a) => EMTIA_YAHOO_MAP[a.symbol]);
    const tokenizedGold = byCategory.emtia.filter((a) =>
      EMTIA_COINGECKO_SYMBOLS.has((a.symbol || '').toUpperCase()),
    );
    const otherEmtia = byCategory.emtia.filter(
      (a) =>
        !EMTIA_YAHOO_MAP[a.symbol] &&
        !EMTIA_COINGECKO_SYMBOLS.has((a.symbol || '').toUpperCase()),
    );
    if (intlMetals.length) {
      await backfillYahoo(sb, yf, intlMetals, (sym) => EMTIA_YAHOO_MAP[sym], 'Emtia (Metal)', usdTryMap);
    }
    if (tokenizedGold.length) {
      await backfillCoinGecko(sb, tokenizedGold, 'Emtia — XAUT/PAXG (CoinGecko)');
    }
    if (otherEmtia.length) {
      console.log(`\n  Emtia (yerel / diğer): ${otherEmtia.length} varlık — geçmiş veri kaynağı yok, atlanıyor`);
    }
  }

  // 6) Kripto
  if (byCategory.kripto?.length) {
    await backfillCoinGecko(sb, byCategory.kripto);
  }

  // 7) Fon
  if (byCategory.fon?.length) {
    await backfillTEFAS(sb, byCategory.fon);
  }

  // 8) Mevduat
  if (byCategory.mevduat?.length) {
    console.log(`\n=== Mevduat: ${byCategory.mevduat.length} varlık — piyasa verisi yok, atlanıyor ===`);
  }

  console.log('\n✓ Backfill tamamlandı.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
