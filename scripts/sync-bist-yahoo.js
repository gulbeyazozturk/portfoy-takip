#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * BIST fiyatları — Yahoo Finance (ücretsiz, API anahtarı yok).
 * - Supabase'te category_id = 'bist' olan mevcut satırları günceller (current_price, change_24h_pct, price_updated_at).
 * - Sembol Yahoo'da `KOD.IS` formatındadır (örn. GARAN.IS).
 * - Yahoo gecikmeli / koşullu veri sunabilir; % değişim alanı regularMarketChangePercent ile uyumludur.
 * - Yeni hisse envanteri eklemez; liste için sync-bist-scrape veya manuel asset kullanın.
 *
 *   node scripts/sync-bist-yahoo.js
 *   BIST_YAHOO_DELAY_MS=120 node scripts/sync-bist-yahoo.js
 */

const BIST_YAHOO_DELAY_MS = Math.max(0, Number(process.env.BIST_YAHOO_DELAY_MS || '150'));
const BIST_YAHOO_BATCH_PAUSE_MS = Math.max(0, Number(process.env.BIST_YAHOO_BATCH_PAUSE_MS || '800'));
const BATCH_SIZE = Math.max(10, Math.min(200, Number(process.env.BIST_YAHOO_BATCH_SIZE || '40')));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function fetchAllBistAssets(supabase) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('assets')
      .select('id, symbol, name')
      .eq('category_id', 'bist')
      .order('symbol', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`BIST assets listesi: ${error.message}`);
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
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

  const rows = await fetchAllBistAssets(supabase);
  if (!rows.length) {
    console.log('[sync-bist-yahoo] Veritabanında BIST asset yok; çıkılıyor.');
    return;
  }

  console.log(`[sync-bist-yahoo] ${rows.length} BIST satırı, Yahoo Finance ile güncelleniyor…`);

  const now = new Date().toISOString();
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sym = String(row.symbol || '').trim().toUpperCase();
    if (!sym || sym.length < 2) {
      skip++;
      continue;
    }
    if (/^XU\d{3}$/.test(sym)) {
      skip++;
      continue;
    }
    const ySym = `${sym}.IS`;
    try {
      const q = await yahooFinance.quote(ySym);
      const price = q?.regularMarketPrice ?? q?.regularMarketPreviousClose ?? null;
      const p = price != null ? Number(price) : null;
      const change =
        q?.regularMarketChangePercent != null ? Number(q.regularMarketChangePercent) : null;
      if (p == null || !Number.isFinite(p) || p <= 0) {
        fail++;
        console.warn(`[sync-bist-yahoo] Fiyat yok: ${ySym}`);
      } else {
        const { error: upErr } = await supabase
          .from('assets')
          .update({
            current_price: p,
            change_24h_pct: change != null && Number.isFinite(change) ? change : null,
            price_updated_at: now,
            currency: 'TRY',
          })
          .eq('id', row.id)
          .eq('category_id', 'bist');
        if (upErr) {
          fail++;
          console.warn(`[sync-bist-yahoo] DB güncelleme hatası ${sym}:`, upErr.message);
        } else {
          ok++;
        }
      }
    } catch (e) {
      fail++;
      console.warn(`[sync-bist-yahoo] Yahoo hatası ${ySym}:`, e?.message || e);
    }

    if (i < rows.length - 1 && BIST_YAHOO_DELAY_MS > 0) {
      await sleep(BIST_YAHOO_DELAY_MS);
    }
    if ((i + 1) % BATCH_SIZE === 0 && i < rows.length - 1 && BIST_YAHOO_BATCH_PAUSE_MS > 0) {
      await sleep(BIST_YAHOO_BATCH_PAUSE_MS);
    }
  }

  console.log(`[sync-bist-yahoo] Bitti. güncellenen=${ok} atlanan=${skip} hata/boş=${fail} toplam=${rows.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
