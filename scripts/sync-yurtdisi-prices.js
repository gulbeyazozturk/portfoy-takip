/**
 * Yurtdışı hisse fiyatları (Yahoo Finance):
 * - Portföyde bulunan (holdings'teki) yurtdışı (yurtdisi) varlıkların fiyatını günceller.
 * - Yahoo Finance quote ile current_price, change_24h_pct, price_updated_at yazar.
 *
 * Çalıştırma: node scripts/sync-yurtdisi-prices.js
 * Gereksinim: .env + yahoo-finance2 (npm'de mevcut)
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

async function main() {
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

  const { data: holdings, error: holdErr } = await supabase
    .from('holdings')
    .select('asset_id, asset:assets(id, symbol, category_id)')
    .not('asset_id', 'is', null);
  if (holdErr) {
    throw new Error('Holdings select: ' + holdErr.message);
  }

  const yurtdisiSymbols = new Set();
  for (const h of holdings || []) {
    const asset = Array.isArray(h.asset) ? h.asset[0] : h.asset;
    if (asset && asset.category_id === 'yurtdisi' && asset.symbol) {
      yurtdisiSymbols.add(asset.symbol.trim().toUpperCase());
    }
  }
  const symbols = Array.from(yurtdisiSymbols);
  if (symbols.length === 0) {
    console.log('Portföyde yurtdışı hisse yok; fiyat güncellemesi atlanıyor.');
    return;
  }

  console.log('Yurtdışı fiyat güncellenecek sembol sayısı:', symbols.length, symbols.join(', '));
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
    if (i < symbols.length - 1) await sleep(220);
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
