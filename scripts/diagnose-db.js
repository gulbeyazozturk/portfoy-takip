/**
 * Supabase’te portföy / holding / varlık durumunu özetler (service role).
 * Kurtarma adımlarına karar vermek için çalıştırın:
 *   node scripts/diagnose-db.js [email]
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

async function countHead(sb, table, filter) {
  let q = sb.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) return { error: error.message };
  return { count: count ?? 0 };
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

  const email = (process.argv[2] || '').trim().toLowerCase();
  let userId = null;
  if (email) {
    const { data: udata, error: uerr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (uerr) throw uerr;
    const u = (udata?.users || []).find((x) => (x.email || '').toLowerCase() === email);
    if (!u) {
      console.error('Kullanıcı bulunamadı:', email);
      process.exit(1);
    }
    userId = u.id;
    console.log('Kullanıcı:', email, '→', userId);
  }

  console.log('\n--- Tablo satır sayıları ---');
  for (const [label, table, filt] of [
    ['portfolios (toplam)', 'portfolios', null],
    ['portfolios (user_id NULL)', 'portfolios', (q) => q.is('user_id', null)],
    ['holdings', 'holdings', null],
    ['assets', 'assets', null],
    ['price_history', 'price_history', null],
  ]) {
    const r = await countHead(sb, table, filt);
    console.log(label + ':', r.error ?? r.count);
  }

  if (userId) {
    const pc = await countHead(sb, 'portfolios', (q) => q.eq('user_id', userId));
    const { data: ports } = await sb.from('portfolios').select('id,name').eq('user_id', userId);
    console.log('\nBu kullanıcıya ait portföy sayısı:', pc.error ?? pc.count);
    if (ports?.length) {
      console.log('Portföyler:', ports.map((p) => `${p.name} (${p.id.slice(0, 8)}…)`).join(', '));
      const pids = ports.map((p) => p.id);
      const { count: hc, error: he } = await sb
        .from('holdings')
        .select('id', { count: 'exact', head: true })
        .in('portfolio_id', pids);
      console.log('Bu portföylerdeki holding sayısı:', he ? he.message : hc ?? 0);
    } else {
      console.log('UYARI: Bu kullanıcıda hiç portföy yok. Uygulama girişte "Ana Portföy" oluşturmayı dener; RLS engelliyorsa oluşmaz.');
    }
  }

  console.log('\n--- Önerilen komutlar (özet) ---');
  console.log('1) Portföy 0 ise: npm run ensure-portfolio -- <email>');
  console.log('2) Sahipsiz portföy varsa: node scripts/assign-user-data.js <email> --include-null-portfolios');
  console.log('3) Kripto seed (sadece Hasim, diğer veriye dokunmaz): npm run seed-hasim -- <email>');
  console.log('4) Varlık fiyatlarını güncelle: npm run sync-crypto (ve BIST/döviz scriptleri gerektiği gibi)');
  console.log('5) Bugünden price_history biriktir: node scripts/snapshot-prices.js');
  console.log('6) Geçmiş grafikleri yeniden doldurmak (uzun): node scripts/backfill-price-history.js');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
