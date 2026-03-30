/**
 * Auth kullanıcısını ve ona bağlı public veriyi siler.
 * Sıra: portfolio_uploads → portfolios (holdings / allocation_snapshots cascade) → auth.admin.deleteUser
 *
 *   node scripts/delete-user-by-email.js hasimozturk@gmail.com
 *
 * Gerekli: .env içinde EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY
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

async function fetchAllAuthUsers(sb) {
  const out = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    out.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return out;
}

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const target = (process.argv[2] || '').trim().toLowerCase();

  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!target) {
    console.error('Kullanım: node scripts/delete-user-by-email.js <email>');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const users = await fetchAllAuthUsers(sb);
  const user = users.find((u) => (u.email || '').toLowerCase() === target);
  if (!user) {
    console.log('Auth’ta bu e-posta yok (zaten silinmiş olabilir):', target);
    process.exit(0);
  }

  const uid = user.id;
  console.log('Bulundu:', user.email, uid);

  const { data: uploads, error: u1 } = await sb.from('portfolio_uploads').select('id').eq('user_id', uid);
  if (u1) throw u1;
  const { error: u2 } = await sb.from('portfolio_uploads').delete().eq('user_id', uid);
  if (u2) throw u2;
  console.log('portfolio_uploads silindi:', uploads?.length ?? 0, 'satır');

  const { data: ports, error: p1 } = await sb.from('portfolios').select('id,name').eq('user_id', uid);
  if (p1) throw p1;
  const { error: p2 } = await sb.from('portfolios').delete().eq('user_id', uid);
  if (p2) throw p2;
  console.log('portfolios silindi:', ports?.length ?? 0, 'adet (holdings/allocation_snapshots cascade)');

  const { error: dAuth } = await sb.auth.admin.deleteUser(uid);
  if (dAuth) throw dAuth;
  console.log('Auth kullanıcısı silindi. Yeniden sign up yapabilirsiniz.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
