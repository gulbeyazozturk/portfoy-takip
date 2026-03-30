/**
 * Sadece kullanıcıya ait, adı "Hasim" olan portföy(ler)i ve bağlı holding’leri siler;
 * bu 14 kripto/emtia varlığını assets’te upsert eder (mevcut uuid korunur, price_history
 * ve BIST/döviz vb. diğer verilere dokunulmaz). Yeni "Hasim" portföyü + pozisyonlar eklenir.
 *
 * Tam veritabanı silme (eski davranış) için: SEED_NUKE_ALL=1
 *
 * Gerekli: EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Hedef kullanıcı: argv e-posta | SEED_USER_EMAIL | Auth’ta tek kullanıcı
 *
 *   npm run seed-hasim
 *   npm run seed-hasim -- kullanici@ornek.com
 */

const path = require('path');
const fs = require('fs');

async function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

/** Tablo (Portföy Hasim, Kripto). XAUT uygulamada emtia kategorisinde tutulur. */
const ROWS = [
  { symbol: 'AVAX', name: 'Avalanche', categoryId: 'kripto', qty: 31.93999, avgUsd: 10.28, externalId: 'avalanche-2' },
  { symbol: 'BNB', name: 'BNB', categoryId: 'kripto', qty: 0.63572, avgUsd: 610.9, externalId: 'binancecoin' },
  { symbol: 'BTC', name: 'Bitcoin', categoryId: 'kripto', qty: 0.0716098, avgUsd: 92807.3, externalId: 'bitcoin' },
  { symbol: 'DOGE', name: 'Dogecoin', categoryId: 'kripto', qty: 638.00073, avgUsd: 0.092295, externalId: 'dogecoin' },
  { symbol: 'ETH', name: 'Ethereum', categoryId: 'kripto', qty: 1.4660197, avgUsd: 2144.11, externalId: 'ethereum' },
  { symbol: 'FET', name: 'Artificial Superintelligence Alliance', categoryId: 'kripto', qty: 718.6317668, avgUsd: 10.76, externalId: 'fetch-ai' },
  { symbol: 'FLOKI', name: 'FLOKI', categoryId: 'kripto', qty: 663632, avgUsd: 0.00002922, externalId: 'floki' },
  { symbol: 'JASMY', name: 'JasmyCoin', categoryId: 'kripto', qty: 3595.849635, avgUsd: 0.238, externalId: 'jasmycoin' },
  { symbol: 'MANA', name: 'Decentraland', categoryId: 'kripto', qty: 97.11275, avgUsd: 0.08636, externalId: 'decentraland' },
  { symbol: 'POL', name: 'Polygon', categoryId: 'kripto', qty: 52.60077, avgUsd: 0.096235, externalId: 'polygon-ecosystem-token' },
  { symbol: 'RENDER', name: 'Render', categoryId: 'kripto', qty: 15.78866, avgUsd: 1.75, externalId: 'render-token' },
  { symbol: 'SOL', name: 'Solana', categoryId: 'kripto', qty: 17.48462978, avgUsd: 88.65, externalId: 'solana' },
  {
    symbol: 'XAUT',
    name: 'Tether Gold',
    categoryId: 'emtia',
    qty: 3.56155491,
    avgUsd: 234376.56,
    externalId: 'tether-gold',
    currency: 'TRY',
  },
  { symbol: 'XRP', name: 'XRP', categoryId: 'kripto', qty: 11.82, avgUsd: 2.08, externalId: 'ripple' },
];

const PORTFOLIO_NAME = 'Hasim';

async function fetchAllAuthUsers(supabase) {
  const out = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    out.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return out;
}

/** Yalnızca bu kullanıcının "Hasim" adlı portföyü; CASCADE ile holdings + allocation_snapshots gider. */
async function removeHasimPortfolios(supabase, userId) {
  const { data: ports, error: e1 } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .eq('name', PORTFOLIO_NAME);
  if (e1) throw new Error(`portfolios select: ${e1.message}`);
  if (!ports?.length) {
    console.log(`  → "${PORTFOLIO_NAME}" adlı eski portföy yok (atlandı)`);
    return;
  }
  const ids = ports.map((p) => p.id);
  const { error: e2 } = await supabase.from('portfolios').delete().in('id', ids);
  if (e2) throw new Error(`portfolios delete: ${e2.message}`);
  console.log(`  → "${PORTFOLIO_NAME}" portföy silindi (${ids.length}); holdings/allocation_snapshots cascade`);
}

/** Önce RPC truncate (migration 009); yoksa veya hata verirse parça parça sil. */
async function wipePriceHistoryTruncateOrChunks(supabase) {
  const { error: rpcErr } = await supabase.rpc('truncate_price_history');
  if (!rpcErr) {
    console.log('  → price_history: TRUNCATE (rpc) tamam');
    return;
  }
  console.warn('  → truncate_price_history RPC yok veya hata:', rpcErr.message);
  console.warn('     Parça silmeye düşülüyor. Kalıcı çözüm: 009_truncate_price_history_rpc.sql çalıştırın.');
  const sel = 600;
  const delChunk = 28;
  let total = 0;
  let cycles = 0;
  for (;;) {
    const { data, error } = await supabase.from('price_history').select('id').limit(sel);
    if (error) throw new Error(`price_history: ${error.message}`);
    if (!data?.length) break;
    for (let i = 0; i < data.length; i += delChunk) {
      const slice = data.slice(i, i + delChunk).map((r) => r.id);
      const { error: derr } = await supabase.from('price_history').delete().in('id', slice);
      if (derr) throw new Error(`price_history delete: ${derr.message}`);
      total += slice.length;
    }
    cycles += 1;
    if (cycles % 40 === 0) process.stdout.write(`\r     …${total} satır silindi`);
  }
  if (total > 0) console.log(`\r  → price_history: ${total} satır silindi          `);
  else console.log('  → price_history: zaten boş');
}

/** Eski tam silme modu (dikkat: tüm portföyler, uploads, assets, price_history). */
async function wipeEverything(supabase) {
  const epoch = '1970-01-01T00:00:00.000Z';
  console.log('  [SEED_NUKE_ALL] portfolio_uploads …');
  let { error } = await supabase.from('portfolio_uploads').delete().gte('created_at', epoch);
  if (error) throw new Error(`portfolio_uploads: ${error.message}`);
  console.log('  [SEED_NUKE_ALL] portfolios …');
  ({ error } = await supabase.from('portfolios').delete().gte('created_at', epoch));
  if (error) throw new Error(`portfolios: ${error.message}`);
  await wipePriceHistoryTruncateOrChunks(supabase);
  console.log('  [SEED_NUKE_ALL] assets …');
  ({ error } = await supabase.from('assets').delete().gte('created_at', epoch));
  if (error) throw new Error(`assets: ${error.message}`);
}

async function main() {
  await loadEnv();

  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (.env veya ortam).');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const allUsers = await fetchAllAuthUsers(supabase);
  let emailRaw = (process.argv[2] || process.env.SEED_USER_EMAIL || '').trim();
  if (!emailRaw) {
    const withEmail = allUsers.filter((u) => (u.email || '').trim());
    if (withEmail.length === 1) {
      emailRaw = withEmail[0].email.trim();
      console.log(`E-posta verilmedi; Auth’taki tek kullanıcı kullanılıyor: ${emailRaw}`);
    } else if (withEmail.length === 0) {
      console.error(
        'E-posta verilmedi ve Auth’ta e-postalı kullanıcı yok.\n  npm run seed-hasim -- siz@email.com\n  veya .env içine SEED_USER_EMAIL=siz@email.com',
      );
      process.exit(1);
    } else {
      console.error(
        'Birden fazla kullanıcı var; hedefi belirtin:\n  npm run seed-hasim -- siz@email.com\n\nKayıtlı e-postalar:',
      );
      for (const u of withEmail) console.error(' ', u.email);
      process.exit(1);
    }
  }

  const email = emailRaw.toLowerCase();
  const user = allUsers.find((u) => (u.email || '').toLowerCase() === email);
  if (!user) {
    console.error(`Kullanıcı bulunamadı: ${emailRaw}`);
    process.exit(1);
  }
  const userId = user.id;

  const nukeAll = process.env.SEED_NUKE_ALL === '1' || process.env.SEED_NUKE_ALL === 'true';
  if (nukeAll) {
    console.log('SEED_NUKE_ALL: tüm portföy / uploads / assets / price_history siliniyor…');
    await wipeEverything(supabase);
  } else {
    console.log(`Yalnızca "${PORTFOLIO_NAME}" portföyü yenilenecek; diğer varlık ve price_history korunur.`);
    await removeHasimPortfolios(supabase, userId);
  }

  console.log('Varlıklar upsert (category_id+symbol)…');
  const upsertPayload = ROWS.map((row) => ({
    category_id: row.categoryId,
    name: row.name,
    symbol: row.symbol,
    currency: row.currency || 'USD',
    external_id: row.externalId,
  }));
  const { data: assetRows, error: upsertErr } = await supabase
    .from('assets')
    .upsert(upsertPayload, { onConflict: 'category_id,symbol', ignoreDuplicates: false })
    .select('id, symbol');
  if (upsertErr) throw new Error(`assets upsert: ${upsertErr.message}`);
  const symbolToAssetId = new Map((assetRows || []).map((r) => [r.symbol, r.id]));
  for (const row of ROWS) {
    if (!symbolToAssetId.has(row.symbol)) {
      throw new Error(`upsert sonrası symbol eksik: ${row.symbol}`);
    }
  }

  const { data: portRow, error: pErr } = await supabase
    .from('portfolios')
    .insert({ name: PORTFOLIO_NAME, user_id: userId, currency: 'USD' })
    .select('id')
    .single();
  if (pErr) throw new Error(`portfolio: ${pErr.message}`);
  const portfolioId = portRow.id;

  console.log(`Portföy oluşturuldu: "${PORTFOLIO_NAME}" (${portfolioId})`);

  const holdingRows = ROWS.map((row) => ({
    portfolio_id: portfolioId,
    asset_id: symbolToAssetId.get(row.symbol),
    quantity: row.qty,
    avg_price: row.avgUsd,
  }));

  const { error: hErr } = await supabase.from('holdings').insert(holdingRows);
  if (hErr) throw new Error(`holdings: ${hErr.message}`);

  console.log(`Tamam: ${holdingRows.length} pozisyon eklendi. Fiyatlar için: npm run sync-crypto`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
