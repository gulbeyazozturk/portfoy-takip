const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function readEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, 'utf8');
  const out = {};
  raw.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  });
  return out;
}

async function main() {
  const env = readEnvFile();
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    env.EXPO_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const targetEmail = (process.argv[2] || '').trim().toLowerCase();
  if (!targetEmail) {
    throw new Error('Usage: node scripts/assign-user-data.js <email>');
  }

  const supabase = createClient(url, serviceRole);

  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersError) throw usersError;

  const user = (usersData?.users || []).find((u) => (u.email || '').toLowerCase() === targetEmail);
  if (!user) {
    throw new Error(`User not found: ${targetEmail}`);
  }

  const userId = user.id;

  const { data: portfolios, error: pErr } = await supabase.from('portfolios').select('id,user_id');
  if (pErr) throw pErr;
  const nullPortfolios = (portfolios || []).filter((p) => !p.user_id);

  const { error: updPortErr } = await supabase.from('portfolios').update({ user_id: userId }).is('user_id', null);
  if (updPortErr) throw updPortErr;

  const { data: uploads, error: uErr } = await supabase.from('portfolio_uploads').select('id,user_id');
  if (uErr) throw uErr;
  const nullUploads = (uploads || []).filter((u) => !u.user_id);

  const { error: updUploadErr } = await supabase
    .from('portfolio_uploads')
    .update({ user_id: userId })
    .is('user_id', null);
  if (updUploadErr) throw updUploadErr;

  console.log(
    JSON.stringify(
      {
        targetEmail,
        userId,
        updatedPortfolios: nullPortfolios.length,
        updatedUploads: nullUploads.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
