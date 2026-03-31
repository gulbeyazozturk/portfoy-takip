/**
 * Eksik yurtdışı fiyatlarını tamamlar (current_price null/0 olanlar).
 * - holdings'te kullanılan yurtdışı asset'leri tarar
 * - fiyatı eksik olanları Yahoo'dan batch halinde günceller
 *
 * Örnek:
 *   node scripts/sync-yurtdisi-missing-prices.js
 *   node scripts/sync-yurtdisi-missing-prices.js --limit=150 --delay=180
 */

async function loadEnv() {
  const path = require('path');
  const fs = require('fs');
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf8');
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

function parseArgs() {
  const out = { limit: 120, delayMs: 180 };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--limit=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n);
    }
    if (arg.startsWith('--delay=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) out.delayMs = Math.floor(n);
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const cfg = parseArgs();
  await loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (veya ANON_KEY) .env içinde olmalı.');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const YahooFinance = require('yahoo-finance2').default;
  const yahooFinance = new YahooFinance();
  const supabase = createClient(url, key);

  const { data: rows, error } = await supabase
    .from('holdings')
    .select('asset:assets(id,symbol,category_id,current_price)')
    .not('asset', 'is', null);
  if (error) throw new Error('Holdings select: ' + error.message);

  const missingSymbols = [];
  const seen = new Set();
  for (const h of rows || []) {
    const a = Array.isArray(h.asset) ? h.asset[0] : h.asset;
    if (!a || a.category_id !== 'yurtdisi') continue;
    const cp = Number(a.current_price ?? 0);
    if (cp > 0) continue;
    const s = String(a.symbol || '').toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    missingSymbols.push(s);
  }

  const symbols = missingSymbols.slice(0, cfg.limit);
  if (!symbols.length) {
    console.log('Eksik yurtdışı fiyatı yok.');
    return;
  }

  console.log(`Eksik yurtdışı fiyat batch: ${symbols.length} sembol`);
  const now = new Date().toISOString();
  let ok = 0;
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    try {
      const q = await yahooFinance.quote(symbol);
      const price = q?.regularMarketPrice ?? q?.regularMarketPreviousClose ?? null;
      const p = price != null ? Number(price) : null;
      const change = q?.regularMarketChangePercent != null ? Number(q.regularMarketChangePercent) : null;
      if (p != null && Number.isFinite(p) && p > 0) {
        const { error: upErr } = await supabase
          .from('assets')
          .update({
            current_price: p,
            change_24h_pct: change != null && Number.isFinite(change) ? change : null,
            price_updated_at: now,
            currency: 'USD',
          })
          .eq('category_id', 'yurtdisi')
          .eq('symbol', symbol);
        if (!upErr) ok++;
      }
    } catch (_) {
      // yoksay
    }
    if (i < symbols.length - 1) await sleep(cfg.delayMs);
  }
  console.log(`Tamamlandı: ${ok}/${symbols.length} sembol güncellendi.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

