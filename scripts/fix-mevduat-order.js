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

  // Symbol'leri sıralama dostu olacak şekilde güncelle
  const updates = [
    { symbol: 'VADESIZ', newSymbol: 'M1_VADESIZ', name: 'Vadesiz Mevduat' },
    { symbol: 'VADELI',  newSymbol: 'M2_VADELI',  name: 'Vadeli Mevduat' },
    { symbol: 'BES',     newSymbol: 'M3_BES',     name: 'BES' },
    { symbol: 'KASA',    newSymbol: 'M4_KASA',    name: 'Kasa' },
    { symbol: 'DIGER',   newSymbol: 'M5_DIGER',   name: 'Diger' },
  ];

  for (const u of updates) {
    const { error } = await supabase
      .from('assets')
      .update({ symbol: u.newSymbol, name: u.name })
      .eq('category_id', 'mevduat')
      .eq('symbol', u.symbol);
    if (error) {
      console.error(u.symbol, '->', u.newSymbol, 'hata:', error.message);
    } else {
      console.log(u.symbol, '->', u.newSymbol, 'ok');
    }
  }
  console.log('Tamamlandi');
}

main().catch((e) => { console.error(e); process.exit(1); });
