/**
 * Tüm varlıkların mevcut fiyatlarını price_history tablosuna kaydeder.
 * Sync scriptleri çalıştıktan sonra çağrılmalıdır.
 *
 * Çalıştırma: node scripts/snapshot-prices.js
 */

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

async function main() {
  await loadEnv();
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Supabase credentials missing');
    process.exit(1);
  }
  const sb = createClient(url, key);

  const pageSize = 1000;
  const assets = [];
  for (let from = 0; ; from += pageSize) {
    const { data: chunk, error } = await sb
      .from('assets')
      .select('id, current_price')
      .not('current_price', 'is', null)
      .gt('current_price', 0)
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('Asset fetch error:', error.message);
      process.exit(1);
    }
    if (!chunk?.length) break;
    assets.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  if (assets.length === 0) {
    console.log('No assets with prices found.');
    return;
  }

  const rows = assets.map((a) => ({
    asset_id: a.id,
    price: a.current_price,
  }));

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error: insErr } = await sb.from('price_history').insert(batch);
    if (insErr) {
      console.error(`Insert batch error (offset ${i}):`, insErr.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`Snapshot complete: ${inserted}/${assets.length} prices recorded.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
