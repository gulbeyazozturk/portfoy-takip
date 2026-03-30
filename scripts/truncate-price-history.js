/**
 * public.price_history tablosunu TRUNCATE eder (tüm varlık geçmişi silinir).
 * Önce database/migrations/009_truncate_price_history_rpc.sql çalıştırılmış olmalı.
 *
 *   node scripts/truncate-price-history.js
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
  const { error } = await sb.rpc('truncate_price_history');
  if (error) {
    console.error('RPC hatası:', error.message);
    console.error(
      'Fonksiyon yoksa Supabase SQL Editor’da çalıştır: database/migrations/009_truncate_price_history_rpc.sql',
    );
    process.exit(1);
  }
  console.log('Tamam: price_history truncate edildi.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
