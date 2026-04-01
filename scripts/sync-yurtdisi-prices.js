/**
 * Yurtdışı hisse fiyatları (Yahoo Finance):
 * - holdings modu: yalnızca portföyde bulunan yurtdışı hisseleri günceller (eski davranış)
 * - full modu: assets(category_id='yurtdisi') içinden batch halinde günceller
 *   (en eski price_updated_at öne alınır, holdings'tekilere öncelik verilir)
 *
 * Örnek:
 *   node scripts/sync-yurtdisi-prices.js
 *   node scripts/sync-yurtdisi-prices.js --mode=full --batch=120 --delay=250
 *
 * Gereksinim: .env + yahoo-finance2
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const out = {
    mode: 'holdings',
    batch: 100,
    delayMs: 220,
    cycleWindow: 0,
    cycleEveryMinutes: 10,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--mode=')) out.mode = arg.split('=')[1] || out.mode;
    if (arg.startsWith('--batch=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) out.batch = Math.floor(n);
    }
    if (arg.startsWith('--delay=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) out.delayMs = Math.floor(n);
    }
    if (arg.startsWith('--cycle-window=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) out.cycleWindow = Math.floor(n);
    }
    if (arg.startsWith('--cycle-every-min=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) out.cycleEveryMinutes = Math.floor(n);
    }
  }
  if (out.mode !== 'holdings' && out.mode !== 'full') out.mode = 'holdings';
  return out;
}

async function getHoldingSymbols(supabase) {
  const { data: holdings, error } = await supabase
    .from('holdings')
    .select('asset:assets(symbol, category_id)')
    .not('asset', 'is', null);
  if (error) throw new Error('Holdings select: ' + error.message);
  const set = new Set();
  for (const h of holdings || []) {
    const a = Array.isArray(h.asset) ? h.asset[0] : h.asset;
    if (a && a.category_id === 'yurtdisi' && a.symbol) set.add(a.symbol.trim().toUpperCase());
  }
  return set;
}

async function getSymbolsForMode(supabase, mode, batch) {
  const holdingSet = await getHoldingSymbols(supabase);
  if (mode === 'holdings') return Array.from(holdingSet);

  const symbols = [];

  // 1) Önce portföydekileri (en eski güncellenen önce)
  if (holdingSet.size > 0) {
    const holdingSymbols = Array.from(holdingSet);
    const { data: inHoldings, error: hErr } = await supabase
      .from('assets')
      .select('symbol, price_updated_at')
      .eq('category_id', 'yurtdisi')
      .in('symbol', holdingSymbols)
      .order('price_updated_at', { ascending: true, nullsFirst: true });
    if (hErr) throw new Error('Assets (holdings) select: ' + hErr.message);
    for (const row of inHoldings || []) {
      if (!row.symbol) continue;
      symbols.push(String(row.symbol).toUpperCase());
      if (symbols.length >= batch) return symbols;
    }
  }

  // 2) Sonra tüm evrenden (en eski güncellenen önce)
  const needed = batch - symbols.length;
  const pageSize = Math.max(needed * 4, 400);
  let from = 0;
  while (symbols.length < batch) {
    const { data: rows, error } = await supabase
      .from('assets')
      .select('symbol, price_updated_at')
      .eq('category_id', 'yurtdisi')
      .order('price_updated_at', { ascending: true, nullsFirst: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error('Assets (full) select: ' + error.message);
    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      const s = String(row.symbol || '').toUpperCase();
      if (!s) continue;
      if (symbols.includes(s)) continue;
      symbols.push(s);
      if (symbols.length >= batch) break;
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return symbols.slice(0, batch);
}

async function getRotatingFullSymbols(supabase, batch, cycleWindow, cycleEveryMinutes) {
  const windowSize = cycleWindow > 0 ? cycleWindow : batch;
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data: rows, error } = await supabase
      .from('assets')
      .select('symbol, price_updated_at')
      .eq('category_id', 'yurtdisi')
      .order('price_updated_at', { ascending: true, nullsFirst: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error('Assets (rotate full) select: ' + error.message);
    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      const s = String(row.symbol || '').toUpperCase();
      if (s) all.push(s);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  if (!all.length) return [];
  const chunkCount = Math.max(1, Math.ceil(all.length / windowSize));
  const now = Date.now();
  const everyMs = Math.max(1, cycleEveryMinutes) * 60 * 1000;
  const slot = Math.floor(now / everyMs);
  const chunkIndex = slot % chunkCount;
  const start = chunkIndex * windowSize;
  const selected = all.slice(start, start + windowSize);

  console.log(
    `Rotating full batch: total=${all.length}, window=${windowSize}, groups=${chunkCount}, activeGroup=${chunkIndex + 1}/${chunkCount}, slot=${slot}`
  );
  return selected.slice(0, batch);
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

  const symbols =
    cfg.mode === 'full' && cfg.cycleWindow > 0
      ? await getRotatingFullSymbols(supabase, cfg.batch, cfg.cycleWindow, cfg.cycleEveryMinutes)
      : await getSymbolsForMode(supabase, cfg.mode, cfg.batch);
  if (symbols.length === 0) {
    console.log('Güncellenecek yurtdışı sembol bulunamadı.');
    return;
  }

  console.log(
    `Yurtdışı fiyat sync modu=${cfg.mode}, batch=${cfg.batch}, delay=${cfg.delayMs}ms, secilen=${symbols.length}`
  );
  console.log(symbols.join(', '));
  const now = new Date().toISOString();
  const updates = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    try {
      const q = await yahooFinance.quote(symbol);
      const price = q?.regularMarketPrice ?? q?.regularMarketPreviousClose ?? null;
      const numPrice = price != null ? Number(price) : null;
      const changePct = q?.regularMarketChangePercent != null ? Number(q.regularMarketChangePercent) : null;
      if (numPrice != null && Number.isFinite(numPrice)) {
        const shortName = q?.shortName || q?.longName || symbol;
        updates.push({
          category_id: 'yurtdisi',
          symbol,
          name: (shortName && typeof shortName === 'string' ? shortName : symbol).slice(0, 500),
          current_price: numPrice,
          change_24h_pct: changePct != null && Number.isFinite(changePct) ? changePct : null,
          price_updated_at: now,
        });
      }
    } catch (err) {
      console.warn('Yahoo quote hatası', symbol, err?.message || err);
    }
    if (i < symbols.length - 1) await sleep(cfg.delayMs);
  }

  if (updates.length === 0) {
    console.log('Güncellenecek fiyat bulunamadı.');
    return;
  }

  for (const row of updates) {
    const { error } = await supabase.from('assets').upsert(
      {
        category_id: 'yurtdisi',
        symbol: row.symbol,
        name: row.name || row.symbol,
        currency: 'USD',
        current_price: row.current_price,
        change_24h_pct: row.change_24h_pct,
        price_updated_at: row.price_updated_at,
      },
      { onConflict: 'category_id,symbol', ignoreDuplicates: false }
    );
    if (error) console.warn('Upsert hatası', row.symbol, error.message);
  }
  console.log('Güncellenen/eklenen yurtdışı hisse sayısı:', updates.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
