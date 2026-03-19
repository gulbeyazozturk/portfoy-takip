/**
 * Fon holdings toplu ekleme scripti (tek seferlik).
 * Çalıştırma: node scripts/insert-fon-holdings.js
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

const FUNDS = [
  { symbol: 'YHK',  name: 'Katılım Hisse Senedi Fonu',                    quantity: 14657,  avgPrice: 1.686870 },
  { symbol: 'EC2',  name: 'Global MD Portföy Fonu',                        quantity: 149,    avgPrice: 83.616476 },
  { symbol: 'GOH',  name: 'Garanti Portföy Fonu (GOH)',                    quantity: 917,    avgPrice: 13.623101 },
  { symbol: 'GTM',  name: 'Garanti Portföy Fonu (GTM)',                    quantity: 3316,   avgPrice: 7.387351 },
  { symbol: 'HIH',  name: 'Garanti Portföy Fonu (HIH)',                    quantity: 9884,   avgPrice: 1.264590 },
  { symbol: 'IHA',  name: 'Allbatross Portföy Fonu',                       quantity: 8580,   avgPrice: 2.913431 },
  { symbol: 'IIH',  name: 'İstanbul Portföy Fonu',                         quantity: 916,    avgPrice: 32.734967 },
  { symbol: 'KHA',  name: 'Pardus Portföy Fonu',                           quantity: 5240,   avgPrice: 2.385163 },
  { symbol: 'KPU',  name: 'Kuveyt Türk Portföy Fonu',                      quantity: 8026,   avgPrice: 3.114671 },
  { symbol: 'MTH',  name: 'MT Portföy Birinci Fon',                        quantity: 15705,  avgPrice: 1.910177 },
  { symbol: 'NHY',  name: 'Neo Portföy Birinci Fon',                       quantity: 2585,   avgPrice: 4.834178 },
  { symbol: 'NLE',  name: 'Nurol Portföy Fonu',                            quantity: 9870,   avgPrice: 1.266410 },
  { symbol: 'NST',  name: 'İş Portföy İnşaat Fonu',                        quantity: 11937,  avgPrice: 1.047132 },
  { symbol: 'PRY',  name: 'Pusula Portföy Fonu',                           quantity: 570221, avgPrice: 2.379677 },
  { symbol: 'SKO',  name: 'Strateji Portföy Fonu (SKO)',                   quantity: 18869,  avgPrice: 1.589894 },
  { symbol: 'ST1',  name: 'Strateji Portföy Fonu (ST1)',                   quantity: 75,     avgPrice: 165.927600 },
  { symbol: 'TLY',  name: 'Tera Portföy Birinci Fon',                      quantity: 16,     avgPrice: 3120.3804 },
  { symbol: 'TP2',  name: 'Tera Portföy Para Piyasası Fonu',               quantity: 899858, avgPrice: 1.699536 },
  { symbol: 'VPS',  name: 'Vega Portföy Serbest Fon',                      quantity: 24778,  avgPrice: 1.210724 },
  { symbol: 'YAS',  name: 'Koç Holding İştirak Fonu',                      quantity: 910,    avgPrice: 13.729496 },
  { symbol: 'YLB',  name: 'Para Piyasası Fonu',                            quantity: 179470, avgPrice: 1.524695 },
];

async function main() {
  await loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) { console.error('Eksik env'); process.exit(1); }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  // 1) Portföy ID al
  const { data: pData, error: pErr } = await supabase.from('portfolios').select('id').limit(1).maybeSingle();
  if (pErr || !pData) { console.error('Portföy bulunamadı:', pErr?.message); process.exit(1); }
  const portfolioId = pData.id;
  console.log('Portföy:', portfolioId);

  let inserted = 0;
  let skipped = 0;

  for (const f of FUNDS) {
    // 2) Asset'i bul (TEFAS sync zaten eklemiştir)
    const { data: asset } = await supabase
      .from('assets')
      .select('id')
      .eq('category_id', 'fon')
      .eq('symbol', f.symbol)
      .maybeSingle();

    let assetId;
    if (asset) {
      assetId = asset.id;
    } else {
      // Asset yoksa oluştur
      const { data: newAsset, error: aErr } = await supabase
        .from('assets')
        .upsert({
          category_id: 'fon',
          symbol: f.symbol,
          name: f.name,
          currency: 'TRY',
        }, { onConflict: 'category_id,symbol' })
        .select('id')
        .single();
      if (aErr) { console.error(`Asset oluşturulamadı (${f.symbol}):`, aErr.message); continue; }
      assetId = newAsset.id;
      console.log(`  Yeni asset oluşturuldu: ${f.symbol}`);
    }

    // 3) Holding zaten var mı?
    const { data: existing } = await supabase
      .from('holdings')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .eq('asset_id', assetId)
      .maybeSingle();

    if (existing) {
      // Güncelle
      const { error: uErr } = await supabase
        .from('holdings')
        .update({ quantity: f.quantity, avg_price: f.avgPrice })
        .eq('id', existing.id);
      if (uErr) { console.error(`Güncelleme hatası (${f.symbol}):`, uErr.message); continue; }
      console.log(`  ${f.symbol}: güncellendi (${f.quantity} adet)`);
    } else {
      // Yeni ekle
      const { error: iErr } = await supabase
        .from('holdings')
        .insert({ portfolio_id: portfolioId, asset_id: assetId, quantity: f.quantity, avg_price: f.avgPrice });
      if (iErr) { console.error(`Insert hatası (${f.symbol}):`, iErr.message); continue; }
      console.log(`  ${f.symbol}: eklendi (${f.quantity} adet)`);
    }
    inserted++;
  }

  console.log(`\nToplam: ${inserted} fon eklendi/güncellendi, ${skipped} atlandı.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
