/**
 * Migration 022 uygular (truncate + 2 günlük model + pg_cron) ve ilk günlük snapshot'ı çalıştırır.
 *
 *   node scripts/setup-daily-price-history-supabase.mjs
 *
 * Önkoşul: npx supabase link (proje bağlı)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function main() {
  const migration = resolve(__dirname, '..', 'database', 'migrations', '022_price_history_daily_two_day_retention.sql');
  if (!existsSync(migration)) {
    console.error('Migration bulunamadı:', migration);
    process.exit(1);
  }

  console.log('Migration 022 uygulanıyor (TRUNCATE + 2 gün + cron 23:55 TSİ)…\n');

  run('node', [resolve(__dirname, 'apply-migration-022.js')]);

  console.log('\nİlk günlük snapshot çalıştırılıyor…');
  run('node', [resolve(__dirname, 'daily-price-history-maintenance.js')]);

  console.log('\nKurulum tamam.');
  console.log('- Otomatik: pg_cron her gün 23:55 TSİ');
  console.log('- Manuel: npm run daily-price-history');
}

main();
