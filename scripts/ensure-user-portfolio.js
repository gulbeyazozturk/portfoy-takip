/**
 * Kullanıcıda hiç portföy yoksa bir tane oluşturur (service role, RLS bypass).
 * Diagnose çıktısı "portföy 0" ise bunu çalıştırın.
 *
 *   node scripts/ensure-user-portfolio.js hasimozturk@gmail.com
 *   node scripts/ensure-user-portfolio.js hasimozturk@gmail.com "Ana Portföy"
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

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = (process.argv[2] || '').trim().toLowerCase();
  const name = (process.argv[3] || 'Ana Portföy').trim() || 'Ana Portföy';

  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!email) {
    console.error('Kullanım: node scripts/ensure-user-portfolio.js <email> ["Portföy adı"]');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: usersData, error: uerr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (uerr) throw uerr;
  const user = (usersData?.users || []).find((u) => (u.email || '').toLowerCase() === email);
  if (!user) {
    console.error('Auth’ta kullanıcı yok:', email);
    process.exit(1);
  }

  const { data: existing, error: e1 } = await sb
    .from('portfolios')
    .select('id,name')
    .eq('user_id', user.id);
  if (e1) throw e1;

  if (existing?.length > 0) {
    console.log('Zaten portföy var:', existing.length, 'adet');
    existing.forEach((p) => console.log(' ', p.name, p.id));
    return;
  }

  const { data: row, error: e2 } = await sb
    .from('portfolios')
    .insert({ user_id: user.id, name, currency: 'USD' })
    .select('id,name')
    .single();
  if (e2) throw e2;

  console.log('Oluşturuldu:', row.name, row.id);
  console.log('Uygulamayı yenile / tekrar aç; pozisyonlar için: npm run seed-hasim --', email, 'veya CSV.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
