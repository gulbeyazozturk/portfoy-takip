/**
 * TEFAS fon geçmiş fiyat backfill (5 yıl).
 * Çalıştırma: node scripts/backfill-fon.js
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

function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

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
    if (error) console.warn(`    Insert error: ${error.message}`);
    else total += slice.length;
  }
  return total;
}

async function main() {
  await loadEnv();
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) { console.error('Supabase credentials missing'); process.exit(1); }
  const sb = createClient(url, key);

  const { data: fonAssets, error } = await sb
    .from('assets')
    .select('id, symbol, name')
    .eq('category_id', 'fon')
    .not('current_price', 'is', null)
    .gt('current_price', 0);

  if (error) { console.error(error.message); process.exit(1); }
  console.log(`Fon sayısı: ${fonAssets.length}`);

  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 5);
  const bastarih = formatDate(startDate);
  const bittarih = formatDate(new Date());
  const FUND_TYPES = ['YAT', 'EMK', 'BYF'];

  let done = 0, skipped = 0, failed = 0;

  for (let i = 0; i < fonAssets.length; i++) {
    const asset = fonAssets[i];

    const { count } = await sb
      .from('price_history')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', asset.id);
    if ((count || 0) > 10) { skipped++; continue; }

    let allData = [];
    for (const ft of FUND_TYPES) {
      try {
        const body = `fontip=${ft}&fonkod=${asset.symbol}&bastarih=${bastarih}&bittarih=${bittarih}`;
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
      await sleep(300);
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
      console.log(`  [${i + 1}/${fonAssets.length}] ${asset.symbol}: ${inserted} gün`);
      done++;
    } else {
      failed++;
    }

    await sleep(500);
  }

  console.log(`\nÖzet: ${done} başarılı, ${skipped} atlandı, ${failed} hata`);
}

main().catch((e) => { console.error(e); process.exit(1); });
