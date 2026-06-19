/**
 * Günlük price_history bakımı: assets.current_price → bugünkü satır (upsert), 2 günden eski sil.
 * Supabase RPC: run_daily_price_history_maintenance (migration 022).
 *
 *   node scripts/daily-price-history-maintenance.js
 *   node scripts/setup-daily-price-history-supabase.mjs   # migration + ilk çalıştırma
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

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb.rpc('run_daily_price_history_maintenance');
  if (error) {
    console.error('RPC hatası:', error.message);
    console.error(
      'Migration 022 uygulanmamış olabilir: node scripts/setup-daily-price-history-supabase.mjs',
    );
    process.exit(1);
  }

  console.log('price_history günlük bakım tamam:', JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
