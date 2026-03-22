/**
 * BIST hisse senedi batch:
 * - NosyAPI'den economy/bist/list ile BIST envanterini çeker
 * - Supabase'de category_id = 'bist' olan assets kayıtlarını code'a (symbol) göre UPSERT eder
 * - Listede olmayan ama assets'te olan hisseleri (ve holdings'i olmayanları) siler
 * - economy/bist/exchange-rate ile fiyatları çekip current_price + price_updated_at alanlarını günceller
 *
 * Gereksinim:
 * - .env içinde:
 *   - EXPO_PUBLIC_SUPABASE_URL
 *   - EXPO_PUBLIC_SUPABASE_ANON_KEY veya SUPABASE_SERVICE_ROLE_KEY
 *   - NOSYAPI_KEY (NosyAPI hesap key'in)
 *
 * Not: exchange-rate endpoint'i kredi tüketir (rowCount kadar). Ücretsiz pakette limitlere dikkat et.
 *
 * Görünen ad: `name` alanı için API'deki FullName kullanılır (kısa kod yerine şirket unvanı).
 * Eski kayıtları güncellemek için scripti yeniden çalıştırın: `node scripts/sync-bist-assets.js` (veya npm script).
 */

const NOSY_BASE = 'https://www.nosyapi.com/apiv2/service';
const BIST_LIST = `${NOSY_BASE}/economy/bist/list`;
const BIST_EXCHANGE = `${NOSY_BASE}/economy/bist/exchange-rate`;

async function loadEnv() {
  const path = require('path');
  const fs = require('fs');
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\\s*([A-Za-z0-9_]+)\\s*=\\s*(.*?)\\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^[\"']|[\"']$/g, '').trim();
    }
  }
}

async function fetchJson(url, apiKey) {
  const res = await fetch(`${url}?apiKey=${apiKey}`);
  if (!res.ok) {
    throw new Error(`NosyAPI error ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  if (body.status !== 'success') {
    throw new Error(`NosyAPI status != success: ${body.messageTR || body.message || 'unknown error'}`);
  }
  return body;
}

async function fetchBistList(apiKey) {
  const body = await fetchJson(BIST_LIST, apiKey);
  return Array.isArray(body.data) ? body.data : [];
}

async function fetchBistPrices(apiKey) {
  const body = await fetchJson(BIST_EXCHANGE, apiKey);
  return Array.isArray(body.data) ? body.data : [];
}

async function upsertBistAssets(supabase, listData, pricesData) {
  const priceByCode = new Map();
  for (const p of pricesData) {
    priceByCode.set(p.code, p);
  }

  const rows = listData.map((item) => {
    const code = (item.code || '').toUpperCase();
    const price = priceByCode.get(code);
    // FullName = şirket unvanı (örn. Tüpraş A.Ş.); ShortName çoğu kez yalnızca kod (TUPRS)
    const full = (item.FullName || '').trim();
    const short = (item.ShortName || '').trim();
    const displayName = full || short || code;
    return {
      category_id: 'bist',
      name: displayName,
      symbol: code,
      currency: 'TRY',
      external_id: code,
      current_price: price && price.latest != null ? Number(price.latest) : null,
      price_updated_at: price && price.lastupdate ? new Date(price.lastupdate).toISOString() : null,
    };
  });

  const chunkSize = 500;
  let affected = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from('assets')
      .upsert(slice, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });
    if (error) throw new Error('BIST upsert hatası: ' + error.message);
    if (typeof count === 'number') affected += count;
  }
  return affected || rows.length;
}

async function deleteRemovedBistAssets(supabase, validCodes) {
  const { data: existing, error } = await supabase
    .from('assets')
    .select('id, symbol')
    .eq('category_id', 'bist');
  if (error) throw new Error('BIST assets select hatası: ' + error.message);

  const valid = new Set(validCodes.map((c) => c.toUpperCase()));
  const toDelete = (existing || []).filter((row) => !valid.has((row.symbol || '').toUpperCase()));
  if (!toDelete.length) return { tried: 0, deleted: 0, failed: 0 };

  let deleted = 0;
  let failed = 0;
  for (const row of toDelete) {
    const { error: hErr } = await supabase.from('holdings').select('id').eq('asset_id', row.id).limit(1);
    if (hErr) {
      console.error('Holdings kontrol hatası', row.symbol, hErr.message);
      failed++;
      continue;
    }
    // Supabase JS select returns data in separate call; daha sade olması için ikinci bir delete kullanıyoruz
    const { data: holdingRows } = await supabase.from('holdings').select('id').eq('asset_id', row.id).limit(1);
    if (holdingRows && holdingRows.length > 0) {
      // Kullanıcının portföyünde var, silmiyoruz
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
  return { tried: toDelete.length, deleted, failed };
}

async function main() {
  await loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  const nosyKey = process.env.NOSYAPI_KEY;

  if (!url || !key) {
    console.error(
      'Eksik: EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY (veya SUPABASE_SERVICE_ROLE_KEY) .env içinde olmalı.',
    );
    process.exit(1);
  }
  if (!nosyKey) {
    console.error('Eksik: NOSYAPI_KEY .env içinde tanımlı olmalı.');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  console.log('NosyAPI BIST listesi çekiliyor…');
  const listData = await fetchBistList(nosyKey);
  console.log('BIST hisse sayısı (liste):', listData.length);

  console.log('NosyAPI BIST fiyatları çekiliyor…');
  const pricesData = await fetchBistPrices(nosyKey);
  console.log('BIST fiyat kaydı sayısı:', pricesData.length);

  console.log('BIST assets upsert ediliyor (category_id = bist)…');
  const affected = await upsertBistAssets(supabase, listData, pricesData);
  console.log('Etkilenen asset sayısı (insert + update):', affected);

  console.log('Listede olmayan BIST assetleri temizleniyor…');
  const codes = listData.map((d) => d.code || '').filter(Boolean);
  const delStats = await deleteRemovedBistAssets(supabase, codes);
  console.log(
    'Silme özeti -> Aday:', delStats.tried,
    'Silinen:', delStats.deleted,
    'Başarısız:', delStats.failed,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

