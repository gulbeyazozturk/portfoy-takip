const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function readEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
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
  const url = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing env keys');
  const email = (process.argv[2] || '').toLowerCase().trim();
  if (!email) throw new Error('Usage: node scripts/inspect-user-portfolios.js <email>');

  const supabase = createClient(url, key);
  const { data: usersData, error: uErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (uErr) throw uErr;
  const user = (usersData?.users || []).find((u) => (u.email || '').toLowerCase() === email);
  if (!user) throw new Error(`User not found: ${email}`);

  const { data: portfolios, error: pErr } = await supabase
    .from('portfolios')
    .select('id,name,user_id,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (pErr) throw pErr;

  const ids = (portfolios || []).map((p) => p.id);
  const { data: holdings, error: hErr } = await supabase
    .from('holdings')
    .select('id,portfolio_id,asset_id,quantity');
  if (hErr) throw hErr;

  const perPortfolio = {};
  for (const h of holdings || []) {
    perPortfolio[h.portfolio_id] = (perPortfolio[h.portfolio_id] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        email,
        userId: user.id,
        portfolios,
        holdingsByPortfolio: perPortfolio,
        totalHoldings: (holdings || []).length,
        holdingsInUserPortfolios: (holdings || []).filter((h) => ids.includes(h.portfolio_id)).length,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
