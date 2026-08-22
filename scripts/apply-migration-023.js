/**
 * Migration 023'ü stdin ile supabase db query'ye uygular.
 * Supabase CLI bağlı değilse: tablo yoksa migration SQL'ini service role ile uygular (PostgREST değil, pg).
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

async function tableExists(supabase) {
  const { error } = await supabase.from('fund_tax_metadata').select('symbol', { head: true, count: 'exact' });
  if (!error) return true;
  const msg = String(error.message || error);
  return !/does not exist|schema cache|Could not find the table/i.test(msg);
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
    console.log('fund_tax_metadata zaten mevcut — migration atlandı.');
    return true;
  }

  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(
      'fund_tax_metadata tablosu yok ve SUPABASE_DB_URL tanımlı değil.\n' +
        'Supabase Dashboard → SQL Editor → database/migrations/023_fund_tax_metadata.sql çalıştırın\n' +
        'veya ortama SUPABASE_DB_URL (postgres connection string) ekleyin.',
    );
    return false;
  }

  let pg;
  try {
    pg = require('pg');
  } catch {
    console.error('pg paketi yok; npm install pg veya Supabase SQL Editor kullanın.');
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

function applyViaCli() {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  console.log('Migration 023 supabase db query ile uygulanıyor…');
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked'], {
    input: sql,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: path.resolve(__dirname, '..'),
  });
  return r.status === 0;
}

async function main() {
  if (!fs.existsSync(migrationPath)) {
    console.error('Migration bulunamadı:', migrationPath);
    process.exit(1);
  }

  if (applyViaCli()) {
    console.log('Migration 023 tamam (CLI).');
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
