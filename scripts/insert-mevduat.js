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
  const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error: catErr } = await supabase
    .from('categories')
    .upsert({ id: 'mevduat', name: 'TL Mevduat', subtitle: 'Mevduat ve Nakit', sort_order: 7 }, { onConflict: 'id' });
  if (catErr) { console.error('Kategori hatasi:', catErr.message); return; }
  console.log('Kategori eklendi: mevduat');

  const assets = [
    { category_id: 'mevduat', symbol: 'VADESIZ', name: 'Vadesiz Mevduat', currency: 'TRY', current_price: 1 },
    { category_id: 'mevduat', symbol: 'VADELI',  name: 'Vadeli Mevduat',  currency: 'TRY', current_price: 1 },
    { category_id: 'mevduat', symbol: 'BES',     name: 'BES',             currency: 'TRY', current_price: 1 },
    { category_id: 'mevduat', symbol: 'KASA',    name: 'Kasa',            currency: 'TRY', current_price: 1 },
    { category_id: 'mevduat', symbol: 'DIGER',   name: 'Diger',           currency: 'TRY', current_price: 1 },
  ];
  const { error: aErr } = await supabase
    .from('assets')
    .upsert(assets, { onConflict: 'category_id,symbol', ignoreDuplicates: false });
  if (aErr) { console.error('Asset hatasi:', aErr.message); return; }
  console.log('5 mevduat varligi eklendi');
}

main().catch((e) => { console.error(e); process.exit(1); });
