/**
 * Production Supabase: migration 014–018, edge functions, pg_cron jobs.
 *   node scripts/verify-supabase-production.js
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

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

function projectRefFromUrl(url) {
  const m = (url || '').match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : null;
}

async function checkTables(sb) {
  const checks = [
    { migration: '014', table: 'user_push_tokens', column: null },
    { migration: '016', table: 'user_push_tokens', column: 'timezone' },
    { migration: '015', table: 'daily_gain_push_log', column: null },
    { migration: '017', table: 'push_event_log', column: null },
    { migration: '018', table: 'us_sr_levels', column: null },
  ];
  const out = [];
  for (const c of checks) {
    let q = sb.from(c.table).select(c.column || 'id', { count: 'exact', head: true });
    const { error } = await q;
    const ok = !error;
    out.push({
      migration: c.migration,
      target: c.column ? `${c.table}.${c.column}` : c.table,
      ok,
      detail: error ? error.message : 'exists',
    });
  }
  return out;
}

async function probeEdge(url, fnName, headerName) {
  const endpoint = `${url}/functions/v1/${fnName}`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const text = await res.text();
    let body = text.slice(0, 200);
    try {
      body = JSON.stringify(JSON.parse(text));
    } catch {
      /* keep raw */
    }
    // Deployed + auth: typically 401/403 without cron header, not 404
    const deployed = res.status !== 404;
    return { fnName, status: res.status, deployed, body };
  } catch (e) {
    return { fnName, status: 0, deployed: false, body: String(e.message) };
  }
}

function checkCronViaPg(databaseUrl) {
  if (!databaseUrl) return { ok: false, detail: 'DATABASE_URL yok — pg_cron SQL kontrolü atlandı' };
  const { Client } = require('pg');
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const expectedCronGroups = [
    { key: 'tefas', names: ['tefas_sync_morning_tr'] },
    {
      key: 'portfolio',
      names: ['portfolio_github_dispatch_every_15m_v2', 'portfolio_github_dispatch_every_15m'],
    },
    { key: 'abd', names: ['abd_prices_edge_every_15m', 'abd_github_dispatch_every_15m'] },
  ];
  const expectedJobs = expectedCronGroups.flatMap((g) => g.names);
  return client
    .connect()
    .then(() =>
      client.query(
        `select jobid, jobname, schedule, active from cron.job where jobname = any($1::text[]) order by jobname`,
        [expectedJobs],
      ),
    )
    .then((r) => {
      const found = r.rows || [];
      const names = found.map((row) => row.jobname);
      const missing = expectedCronGroups
        .filter((g) => !found.some((row) => g.names.includes(row.jobname) && row.active))
        .map((g) => g.key);
      return {
        ok: missing.length === 0,
        jobs: found,
        missing,
        detail: found.length ? `${found.length} job satırı` : 'hiç job yok',
      };
    })
    .catch((e) => ({ ok: false, detail: e.message, jobs: [], missing: expectedJobs }))
    .finally(() => client.end().catch(() => {}));
}

async function listEdgeViaCli(projectRef) {
  if (!projectRef) return null;
  try {
    const raw = execSync(`npx supabase functions list --project-ref ${projectRef}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    return raw;
  } catch (e) {
    return e.stderr || e.message || null;
  }
}

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const projectRef = process.env.SUPABASE_PROJECT_REF || projectRefFromUrl(url);

  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env)');
    process.exit(1);
  }

  console.log('Supabase URL:', url);
  console.log('Project ref:', projectRef || '(bilinmiyor)');
  console.log('');

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log('=== Migrations 014–018 (tablolar) ===');
  const tables = await checkTables(sb);
  for (const t of tables) {
    console.log(`${t.ok ? 'OK' : 'FAIL'}  ${t.migration}  ${t.target}  — ${t.detail}`);
  }
  const migrationsOk = tables.every((t) => t.ok);

  console.log('\n=== Edge functions (HTTP probe — secret olmadan) ===');
  const fnNames = ['sync-tefas', 'dispatch-portfolio-sync', 'sync-abd-prices', 'send-push'];
  const edgeProbes = await Promise.all(fnNames.map((fn) => probeEdge(url, fn)));
  for (const p of edgeProbes) {
    const label = p.deployed
      ? `deployed (HTTP ${p.status}, auth beklenen)`
      : `MISSING veya erişilemiyor (HTTP ${p.status})`;
    console.log(`${p.deployed ? 'OK' : 'FAIL'}  ${p.fnName}  — ${label}`);
    if (p.body && p.status !== 404) console.log(`       ${p.body.slice(0, 120)}`);
  }
  const edgeOk = edgeProbes.every((p) => p.deployed);

  console.log('\n=== Edge functions (Supabase CLI list) ===');
  const cliList = await listEdgeViaCli(projectRef);
  if (cliList) {
    const lines = cliList.split('\n').filter((l) => /sync-tefas|dispatch-portfolio|sync-abd|send-push/i.test(l));
    if (lines.length) lines.forEach((l) => console.log(' ', l.trim()));
    else console.log(' (CLI çıktısında beklenen fonksiyon satırı yok — tam liste için dashboard)');
  } else {
    console.log(' CLI listelenemedi (login/link gerekebilir)');
  }

  console.log('\n=== pg_cron jobs ===');
  const cron = await checkCronViaPg(databaseUrl);
  if (cron.jobs?.length) {
    for (const j of cron.jobs) {
      console.log(
        `${j.active ? 'OK' : 'WARN'}  ${j.jobname}  schedule=${j.schedule}  active=${j.active}`,
      );
    }
  }
  if (cron.missing?.length) console.log('MISSING jobs:', cron.missing.join(', '));
  if (!cron.jobs?.length) console.log(' ', cron.detail);

  console.log('\n=== Özet ===');
  console.log('Migrations:', migrationsOk ? 'OK' : 'EKSİK — SQL Editor’da 014–018 uygula');
  console.log('Edge deploy:', edgeOk ? 'OK (fonksiyonlar erişilebilir)' : 'KONTROL ET — deploy gerekebilir');
  console.log(
    'pg_cron:',
    cron.ok ? 'OK' : 'EKSİK veya DATABASE_URL yok — docs/SUPABASE-*-EDGE.md SQL’lerini uygula',
  );

  if (!migrationsOk || !edgeOk || !cron.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
