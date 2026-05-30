/**
 * Kullanıcı → portföy → varlık tablosu (stdout).
 *   node scripts/list-user-portfolio-assets.js
 */
const { loadEnv } = require('./lib/load-env');
const { createClient } = require('@supabase/supabase-js');

function fmtQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  if (Math.abs(x) >= 1000) return x.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  return String(x).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  const emailById = new Map(users.map((u) => [u.id, u.email || '(e-posta yok)']));

  const { data: portfolios, error: pErr } = await sb
    .from('portfolios')
    .select('id, name, user_id')
    .not('user_id', 'is', null)
    .order('name');
  if (pErr) throw pErr;

  const pids = (portfolios || []).map((p) => p.id);
  let holdings = [];
  if (pids.length) {
    const { data: h, error: hErr } = await sb.from('holdings').select('portfolio_id, asset_id, quantity').in('portfolio_id', pids);
    if (hErr) throw hErr;
    holdings = h || [];
  }

  const assetIds = [...new Set(holdings.map((h) => h.asset_id))];
  let assets = [];
  if (assetIds.length) {
    const { data: a, error: aErr } = await sb.from('assets').select('id, name, symbol, category_id').in('id', assetIds);
    if (aErr) throw aErr;
    assets = a || [];
  }
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const portById = new Map((portfolios || []).map((p) => [p.id, p]));

  const holdingsByPort = new Map();
  for (const h of holdings) {
    if (!holdingsByPort.has(h.portfolio_id)) holdingsByPort.set(h.portfolio_id, []);
    holdingsByPort.get(h.portfolio_id).push(h);
  }

  const sortedPorts = [...(portfolios || [])].sort((a, b) => {
    const ea = emailById.get(a.user_id) || '';
    const eb = emailById.get(b.user_id) || '';
    return ea.localeCompare(eb, 'tr') || a.name.localeCompare(b.name, 'tr');
  });

  console.log(`# Kullanıcı → portföy → varlıklar (${new Date().toISOString().slice(0, 10)})\n`);
  console.log(`Toplam: ${users.length} kayıtlı kullanıcı, ${portfolios?.length ?? 0} portföy, ${holdings.length} holding satırı\n`);

  let currentEmail = null;
  for (const p of sortedPorts) {
    const email = emailById.get(p.user_id) || '?';
    const hlist = holdingsByPort.get(p.id) || [];

    if (email !== currentEmail) {
      if (currentEmail !== null) console.log('');
      console.log(`## ${email}\n`);
      currentEmail = email;
    }

    console.log(`### ${p.name} (${hlist.length} varlık)\n`);
    if (!hlist.length) {
      console.log('_Bu portföyde kayıtlı varlık yok._\n');
      continue;
    }

    console.log('| Kategori | Sembol | Varlık adı | Miktar |');
    console.log('|----------|--------|------------|-------:|');
    const rows = hlist
      .map((h) => {
        const a = assetById.get(h.asset_id);
        return {
          category: a?.category_id || '?',
          symbol: a?.symbol || '?',
          name: (a?.name || '?').replace(/\|/g, '/'),
          quantity: fmtQty(h.quantity),
        };
      })
      .sort((x, y) => x.category.localeCompare(y.category) || x.symbol.localeCompare(y.symbol));

    for (const r of rows) {
      console.log(`| ${r.category} | ${r.symbol} | ${r.name} | ${r.quantity} |`);
    }
    console.log('');
  }

  const usersWithPort = new Set((portfolios || []).map((p) => p.user_id));
  const noPortfolio = users.filter((u) => !usersWithPort.has(u.id));
  if (noPortfolio.length) {
    console.log('## Portföyü olmayan kullanıcılar\n');
    for (const u of noPortfolio.sort((a, b) => (a.email || '').localeCompare(b.email || '', 'tr'))) {
      console.log(`- ${u.email || u.id}`);
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
