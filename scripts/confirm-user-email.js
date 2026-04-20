/**
 * TEST yardımcı script'i:
 * Verilen e-posta adresindeki auth kullanıcısını "email confirmed" olarak işaretler.
 *
 * Kullanım:
 *   node scripts/confirm-user-email.js user@example.com
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

async function main() {
  loadEnv();

  const DEFAULT_TEST_EMAIL = 'hasim_o@yahoo.com';
  const email = (process.argv[2] || DEFAULT_TEST_EMAIL).trim().toLowerCase();
  if (!email) {
    console.error('Kullanim: node scripts/confirm-user-email.js <email>');
    process.exit(1);
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error('Eksik env: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const user = (data?.users || []).find((u) => (u.email || '').toLowerCase() === email);
  if (!user) {
    console.error('Kullanici bulunamadi:', email);
    process.exit(1);
  }

  const { error: updateError } = await sb.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });
  if (updateError) throw updateError;

  console.log('Email dogrulandi:', email);
}

main().catch((e) => {
  console.error('Hata:', e?.message || e);
  process.exit(1);
});
