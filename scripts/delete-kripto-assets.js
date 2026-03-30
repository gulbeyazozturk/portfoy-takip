/**
 * category_id = 'kripto' olan tüm assets kayıtlarını siler.
 * Önce bu varlıklara bağlı holdings ve price_history temizlenir (FK / timeout önlemi).
 *
 *   node scripts/delete-kripto-assets.js
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

async function deleteInChunks(sb, table, column, ids, chunk = 40) {
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { error } = await sb.from(table).delete().in(column, slice);
    if (error) throw new Error(`${table} delete: ${error.message}`);
  }
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
  console.log('Kripto varlık sayısı:', ids.length);
  if (ids.length === 0) {
    console.log('Silinecek yok.');
    return;
  }

  console.log('Holdings temizleniyor…');
  await deleteInChunks(sb, 'holdings', 'asset_id', ids);
  console.log('price_history temizleniyor…');
  await deleteInChunks(sb, 'price_history', 'asset_id', ids);

  const { error: e2 } = await sb.from('assets').delete().eq('category_id', 'kripto');
  if (e2) throw e2;
  console.log('Tamam: kripto assets silindi. CSV ile yeniden ekleyin (USD birim).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
