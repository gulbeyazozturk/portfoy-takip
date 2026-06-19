/**
 * Migration 022'yi stdin ile supabase db query'ye uygular (Windows Unicode yol sorunu için).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '..',
  'database',
  'migrations',
  '022_price_history_daily_two_day_retention.sql',
);

function main() {
  if (!fs.existsSync(migrationPath)) {
    console.error('Migration bulunamadı:', migrationPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  console.log('Migration 022 stdin ile uygulanıyor…');
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked'], {
    input: sql,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: path.resolve(__dirname, '..'),
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
  console.log('Migration 022 tamam.');
}

main();
