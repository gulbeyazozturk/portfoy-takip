/**
 * Kripto varlıklarına ait tüm price_history kayıtlarını siler (timeout olmaması için küçük partiler).
 * Ardından category_id = 'kripto' assets satırlarında fiyat alanlarını NULL yapar (sync yeniden doldurur).
 *
 *   node scripts/clear-kripto-price-history-and-fields.js
 *
 * Gerekli: SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_URL
 */
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  let c = fs.readFileSync(envPath, 'utf8');
  if (c.charCodeAt(0) === 0xfeff) c = c.slice(1);
  for (const line of c.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const SEL = 400;

async function wipeHistoryForCryptoAssets(sb, assetIds) {
  let total = 0;
  for (const aid of assetIds) {
    let batch;
    do {
      const { data, error } = await sb.from('price_history').select('id').eq('asset_id', aid).limit(SEL);
      if (error) throw new Error(`price_history select: ${error.message}`);
      batch = data ?? [];
      if (batch.length === 0) break;
      const ids = batch.map((r) => r.id);
      const { error: dErr } = await sb.from('price_history').delete().in('id', ids);
      if (dErr) throw new Error(`price_history delete: ${dErr.message}`);
      total += ids.length;
      process.stdout.write(`\r  … ${aid.substring(0, 8)}…  kripto geçmişi: +${total} satır silindi`);
    } while (batch.length === SEL);
  }
  if (total > 0) process.stdout.write('\n');
  console.log('  Toplam price_history (kripto):', total, 'satır silindi.');
}

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: kripto, error: e1 } = await sb.from('assets').select('id,symbol').eq('category_id', 'kripto');
  if (e1) throw e1;
  const ids = (kripto ?? []).map((r) => r.id);
  console.log('Kripto asset sayısı:', ids.length);

  if (ids.length > 0) {
    console.log('Kripto price_history temizleniyor…');
    await wipeHistoryForCryptoAssets(sb, ids);
  } else {
    console.log('Kripto asset yok, price_history atlandı.');
  }

  const { error: e2 } = await sb
    .from('assets')
    .update({
      current_price: null,
      change_24h_pct: null,
      price_updated_at: null,
      price_at_midnight: null,
      price_midnight_date: null,
    })
    .eq('category_id', 'kripto');
  if (e2) throw new Error(`assets kripto fiyat alanları: ${e2.message}`);
  console.log('Kripto assets: current_price / günlük alanlar NULL yapıldı (ikon, external_id, isim korunur).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
