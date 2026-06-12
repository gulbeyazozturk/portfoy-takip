/**
 * Kullanıcının portföylerini temizler; belirtilen isim(ler) hariç tüm portföyler silinir.
 * holdings + allocation_snapshots CASCADE ile gider. Master `assets` tablosuna dokunulmaz.
 *
 * Önizleme:
 *   node scripts/cleanup-user-portfolios-except-name.js hasimozturk@gmail.com --keep-name "5 Haziran"
 *
 * Silme (önizleme sonrası):
 *   node scripts/cleanup-user-portfolios-except-name.js hasimozturk@gmail.com --keep-name "5 Haziran" --apply --yes
 *
 * Gerekli: .env → EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

function normalizeName(s) {
  return (s ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFC');
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const keepNames = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--keep-name' && argv[i + 1]) {
      keepNames.push(argv[i + 1].trim());
      i += 1;
    } else if (argv[i].startsWith('--keep-name=')) {
      keepNames.push(argv[i].slice('--keep-name='.length).trim());
    }
  }
  return {
    email: (positional[0] || '').trim().toLowerCase(),
    keepNames,
    apply: flags.has('--apply'),
    yes: flags.has('--yes'),
  };
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
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!args.email) {
    console.error(
      'Kullanım: node scripts/cleanup-user-portfolios-except-name.js <email> --keep-name "Portföy Adı" [--apply --yes]',
    );
    process.exit(1);
  }
  if (args.keepNames.length === 0) {
    console.error('En az bir --keep-name gerekli (ör. --keep-name "5 Haziran")');
    process.exit(1);
  }
  if (args.apply && !args.yes) {
    console.error('Silme için --apply ile birlikte --yes gerekli.');
    process.exit(1);
  }

  const keepSet = new Set(args.keepNames.map(normalizeName));

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const users = await fetchAllAuthUsers(sb);
  const user = users.find((u) => (u.email || '').toLowerCase() === args.email);
  if (!user) {
    console.error('Auth kullanıcısı bulunamadı:', args.email);
    process.exit(1);
  }

  const { data: ports, error: pErr } = await sb
    .from('portfolios')
    .select('id,name,created_at,currency')
    .eq('user_id', user.id)
    .order('name');
  if (pErr) throw pErr;

  const keep = [];
  const del = [];

  for (const p of ports || []) {
    const { data: holdings, error: hErr } = await sb
      .from('holdings')
      .select('id,quantity,avg_price,created_at,asset_id, assets(symbol,name,category_id)')
      .eq('portfolio_id', p.id)
      .order('created_at');
    if (hErr) throw hErr;

    const { count: snapCount } = await sb
      .from('allocation_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('portfolio_id', p.id);

    const row = {
      id: p.id,
      name: p.name,
      created_at: p.created_at,
      currency: p.currency,
      holdings: (holdings || []).map((h) => ({
        id: h.id,
        symbol: h.assets?.symbol ?? '?',
        name: h.assets?.name ?? '',
        category: h.assets?.category_id ?? '',
        quantity: h.quantity,
        avg_price: h.avg_price,
        created_at: h.created_at,
      })),
      allocationSnapshots: snapCount ?? 0,
    };

    if (keepSet.has(normalizeName(p.name))) keep.push(row);
    else del.push(row);
  }

  const { data: uploads } = await sb
    .from('portfolio_uploads')
    .select('id,filename,created_at')
    .eq('user_id', user.id)
    .order('created_at');

  const plan = {
    user: { id: user.id, email: user.email },
    keepPortfolioNames: args.keepNames,
    keep,
    delete: del,
    portfolioUploads: uploads || [],
    summary: {
      portfoliosKeep: keep.length,
      portfoliosDelete: del.length,
      holdingsKeep: keep.reduce((n, p) => n + p.holdings.length, 0),
      holdingsDelete: del.reduce((n, p) => n + p.holdings.length, 0),
      snapshotsDelete: del.reduce((n, p) => n + p.allocationSnapshots, 0),
      portfolioUploads: (uploads || []).length,
    },
    notes: [
      'Master assets (katalog) silinmez.',
      'portfolio_uploads bu scriptte silinmez; isterseniz ayrıca temizlenir.',
    ],
  };

  console.log(JSON.stringify(plan, null, 2));
  console.log('\n=== ÖNİZLEME ===');
  console.log('Kullanıcı:', plan.user.email);
  console.log('Korunacak portföy isimleri:', plan.keepPortfolioNames.join(', '));
  console.log('');
  console.log('KALACAK (' + plan.summary.portfoliosKeep + ' portföy, ' + plan.summary.holdingsKeep + ' holding):');
  for (const p of keep) {
    console.log('  ✓', p.name, `(${p.holdings.length} pozisyon)`);
    for (const h of p.holdings) {
      console.log('      -', h.symbol, h.category, 'adet', h.quantity);
    }
  }
  console.log('');
  console.log('SİLİNECEK (' + plan.summary.portfoliosDelete + ' portföy, ' + plan.summary.holdingsDelete + ' holding):');
  for (const p of del) {
    console.log('  ✗', p.name, `[${p.id}]`, `(${p.holdings.length} pozisyon, ${p.allocationSnapshots} snapshot)`);
    for (const h of p.holdings) {
      console.log('      -', h.symbol, h.category, 'adet', h.quantity);
    }
  }
  if (plan.summary.portfoliosKeep === 0) {
    console.log('\n⚠ UYARI: Korunacak isimle eşleşen portföy yok. Silme yapılmayacak (--apply olsa bile).');
  }

  if (!args.apply) {
    console.log('\nBu önizleme. Onayınızdan sonra: --apply --yes');
    return;
  }

  if (plan.summary.portfoliosKeep === 0) {
    console.error('\nİptal: korunacak portföy bulunamadı.');
    process.exit(1);
  }
  if (del.length === 0) {
    console.log('\nSilinecek portföy yok.');
    return;
  }

  for (const p of del) {
    const { error } = await sb.from('portfolios').delete().eq('id', p.id).eq('user_id', user.id);
    if (error) throw new Error(`portfolios delete (${p.name}): ${error.message}`);
    console.log('Silindi:', p.name);
  }

  console.log('\nTamamlandı. Korunan:', keep.map((p) => p.name).join(', '));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
