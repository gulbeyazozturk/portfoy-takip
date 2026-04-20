/**
 * ABD (yurtdisi) hisse fiyatları — Yahoo Finance batch quote + assets upsert.
 * Her çağrıda en fazla 1000 sembol; `abd_sync_cursor` ile sırayla döner (baştan sona, sonra başa).
 *
 * Secrets: SERVICE_ROLE_KEY, ABD_CRON_SECRET
 * Header: x-abd-cron: <ABD_CRON_SECRET>
 *
 * Not: GitHub `us-sync.yml` ile çakıştırmamak için ayrı tetikleyici kullanın (pg_cron).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const BATCH = 1000;
const YAHOO_CHUNK = 45;
const CHUNK_DELAY_MS = 350;
const CURSOR_ID = 'yurtdisi_prices';

const YAHOO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Sıralı (symbol asc) evrende `start` ofsetinden `take` adet satır; liste sonunda başa sarar. */
async function fetchSymbolWindow(
  supabase: ReturnType<typeof createClient>,
  total: number,
  start: number,
  take: number,
): Promise<{ symbol: string; name: string | null }[]> {
  const out: { symbol: string; name: string | null }[] = [];
  let s = ((start % total) + total) % total;
  let left = take;

  while (left > 0) {
    const avail = total - s;
    const n = Math.min(left, avail);
    if (n <= 0) break;
    const { data, error } = await supabase
      .from('assets')
      .select('symbol, name')
      .eq('category_id', 'yurtdisi')
      .order('symbol', { ascending: true })
      .range(s, s + n - 1);
    if (error) throw new Error('assets range: ' + error.message);
    for (const row of data || []) {
      const sym = String(row.symbol || '')
        .trim()
        .toUpperCase();
      if (!sym) continue;
      out.push({ symbol: sym, name: row.name != null ? String(row.name) : null });
    }
    left -= n;
    s = (s + n) % total;
  }
  return out;
}

async function yahooQuotesChunk(symbols: string[]): Promise<
  {
    symbol: string;
    price: number | null;
    changePct: number | null;
    name: string;
  }[]
> {
  const url =
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=` +
    encodeURIComponent(symbols.join(','));
  const res = await fetch(url, {
    headers: { 'User-Agent': YAHOO_UA, Accept: 'application/json' },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Yahoo HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    quoteResponse?: { result?: Record<string, unknown>[] };
  };
  const results = body.quoteResponse?.result ?? [];
  const out: { symbol: string; price: number | null; changePct: number | null; name: string }[] = [];
  for (const q of results) {
    const symbol = String(q.symbol || '')
      .trim()
      .toUpperCase();
    if (!symbol) continue;
    const priceRaw = q.regularMarketPrice ?? q.regularMarketPreviousClose;
    const numPrice = priceRaw != null ? Number(priceRaw) : NaN;
    const price = Number.isFinite(numPrice) ? numPrice : null;
    const ch = q.regularMarketChangePercent;
    const changePct = ch != null && Number.isFinite(Number(ch)) ? Number(ch) : null;
    const shortName = q.shortName != null ? String(q.shortName) : '';
    const longName = q.longName != null ? String(q.longName) : '';
    const name = (shortName || longName || symbol).slice(0, 500);
    out.push({ symbol, price, changePct, name });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const expected = Deno.env.get('ABD_CRON_SECRET');
  const got = req.headers.get('x-abd-cron') || '';
  if (!expected || got !== expected) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SERVICE_ROLE_KEY');
  if (!url || !key) {
    return json({ error: 'missing_supabase_env' }, 500);
  }

  const supabase = createClient(url, key);
  const now = new Date().toISOString();

  try {
    const { count: totalCount, error: cErr } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', 'yurtdisi');
    if (cErr) throw new Error('count: ' + cErr.message);
    const total = totalCount ?? 0;
    if (total === 0) {
      return json({ ok: true, reason: 'no_assets', updated: 0, next_offset: 0 });
    }

    const { data: curRow, error: curErr } = await supabase
      .from('abd_sync_cursor')
      .select('symbol_offset')
      .eq('id', CURSOR_ID)
      .maybeSingle();
    if (curErr) throw new Error('cursor read: ' + curErr.message);
    let offset = typeof curRow?.symbol_offset === 'number' ? curRow.symbol_offset : 0;
    offset = ((offset % total) + total) % total;

    const takeCount = Math.min(BATCH, total);
    const rows = await fetchSymbolWindow(supabase, total, offset, takeCount);
    const symbols = rows.map((r) => r.symbol);
    const nameBySymbol = new Map(rows.map((r) => [r.symbol, r.name]));

    const updates: {
      category_id: string;
      symbol: string;
      name: string;
      currency: string;
      current_price: number;
      change_24h_pct: number | null;
      price_updated_at: string;
    }[] = [];

    for (let i = 0; i < symbols.length; i += YAHOO_CHUNK) {
      const chunk = symbols.slice(i, i + YAHOO_CHUNK);
      const quotes = await yahooQuotesChunk(chunk);
      for (const q of quotes) {
        if (q.price == null || !Number.isFinite(q.price)) continue;
        const fallbackName = nameBySymbol.get(q.symbol);
        updates.push({
          category_id: 'yurtdisi',
          symbol: q.symbol,
          name: (q.name && q.name !== q.symbol ? q.name : fallbackName || q.symbol).slice(0, 500),
          currency: 'USD',
          current_price: q.price,
          change_24h_pct: q.changePct,
          price_updated_at: now,
        });
      }
      if (i + YAHOO_CHUNK < symbols.length) await sleep(CHUNK_DELAY_MS);
    }

    for (const row of updates) {
      const { error: uErr } = await supabase.from('assets').upsert(row, {
        onConflict: 'category_id,symbol',
        ignoreDuplicates: false,
      });
      if (uErr) console.warn('upsert', row.symbol, uErr.message);
    }

    const nextOffset = (offset + rows.length) % total;
    const { error: upCur } = await supabase.from('abd_sync_cursor').upsert(
      { id: CURSOR_ID, symbol_offset: nextOffset, updated_at: now },
      { onConflict: 'id' },
    );
    if (upCur) throw new Error('cursor write: ' + upCur.message);

    return json({
      ok: true,
      total_yurtdisi: total,
      batch_requested: Math.min(BATCH, total),
      symbols_selected: rows.length,
      quotes_ok: updates.length,
      next_offset: nextOffset,
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});
