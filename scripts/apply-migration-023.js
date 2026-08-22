/**
 * Migration 023 — fund_tax_metadata tablosu.
 * Öncelik: supabase db query (--project-ref) → pg (DATABASE_URL) → atla (tablo var).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '..',
  'database',
  'migrations',
  '023_fund_tax_metadata.sql',
);

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

function projectRefFromUrl(url) {
  const m = (url || '').match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : null;
}

async function tableExists(supabase) {
  const { error } = await supabase.from('fund_tax_metadata').select('symbol').limit(1);
  if (!error) return true;
  const msg = String(error.message || error.code || error);
  if (/PGRST205|does not exist|schema cache|Could not find the table/i.test(msg)) return false;
  throw new Error(`fund_tax_metadata kontrol hatası: ${msg}`);
}

function applyViaCliLinked() {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  console.log('Migration 023 supabase db query (--linked) deneniyor…');
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked'], {
    input: sql,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: path.resolve(__dirname, '..'),
  });
  return r.status === 0;
}

function applyViaCliProjectRef(ref) {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  console.log(`Migration 023 supabase db query (--project-ref ${ref}) deneniyor…`);
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--project-ref', ref], {
    input: sql,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env },
  });
  return r.status === 0;
}

async function applyViaPg(dbUrl) {
  let pg;
  try {
    pg = require('pg');
  } catch {
    console.error('pg paketi yok.');
    return false;
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Migration 023 pg ile uygulandı.');
    return true;
  } finally {
    await client.end();
  }
}

async function applyViaSupabaseJs() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Migration 023: SUPABASE URL / SERVICE_ROLE_KEY gerekli.');
    return false;
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  if (await tableExists(supabase)) {
    console.log('fund_tax_metadata tablosu mevcut.');
    return true;
  }

  const ref = projectRefFromUrl(url);
  if (ref && process.env.SUPABASE_ACCESS_TOKEN && applyViaCliProjectRef(ref)) {
    if (await tableExists(supabase)) return true;
  }

  const dbUrl =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    buildPoolerUrl(ref, process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD);

  if (dbUrl && (await applyViaPg(dbUrl))) {
    return await tableExists(supabase);
  }

  console.error(
    'fund_tax_metadata tablosu oluşturulamadı.\n' +
      'Gerekli: SUPABASE_ACCESS_TOKEN + project-ref, veya DATABASE_URL / SUPABASE_DB_PASSWORD.\n' +
      'Alternatif: Supabase SQL Editor → database/migrations/023_fund_tax_metadata.sql',
  );
  return false;
}

function buildPoolerUrl(ref, password) {
  if (!ref || !password) return null;
  const region = process.env.SUPABASE_DB_REGION || 'aws-0-eu-central-1';
  const enc = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${enc}@${region}.pooler.supabase.com:6543/postgres`;
}

async function main() {
  if (!fs.existsSync(migrationPath)) {
    console.error('Migration bulunamadı:', migrationPath);
    process.exit(1);
  }

  loadEnv();

  if (applyViaCliLinked()) {
    console.log('Migration 023 tamam (CLI linked).');
    return;
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const ref = projectRefFromUrl(url);
  if (ref && process.env.SUPABASE_ACCESS_TOKEN && applyViaCliProjectRef(ref)) {
    console.log('Migration 023 tamam (CLI project-ref).');
    return;
  }

  console.warn('supabase db query başarısız — alternatif yöntem deneniyor…');
  const ok = await applyViaSupabaseJs();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
