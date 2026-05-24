/**
 * TEFAS fon fiyatları → Supabase `assets` (category_id = fon) upsert.
 * Node script `scripts/sync-tefas-funds.js` ile aynı mantık (Deno / Edge).
 *
 * Gizliler: Dashboard veya `supabase secrets set` (CLI `SUPABASE_` prefix’li isimlere izin vermez):
 *   SERVICE_ROLE_KEY   (zorunlu; Dashboard’taki service_role ile aynı değer — upsert için)
 *   TEFAS_CRON_SECRET  (zorunlu; dışarıdan rastgele çağrıyı engeller)
 *
 * İstek: POST + header `x-tefas-cron: <TEFAS_CRON_SECRET>` (pg_net örneği dokümanda).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const TEFAS_BASE = 'https://www.tefas.gov.tr';
const TEFAS_INFO_URL = `${TEFAS_BASE}/api/funds/fonGnlBlgSiraliGetir`;
const FUND_TYPES = ['YAT', 'EMK', 'BYF', 'GYF', 'GSYF'] as const;

const HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Content-Type': 'application/json',
  Origin: TEFAS_BASE,
  Referer: `${TEFAS_BASE}/tr/fon-verileri`,
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

const TEFAS_INTER_KIND_MS = Math.max(0, Number(Deno.env.get('TEFAS_INTER_KIND_DELAY_MS') || '11000'));

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function describeFetchError(err: unknown): string {
  const e = err as { message?: string; cause?: Record<string, unknown> };
  const parts: string[] = [];
  if (e?.message) parts.push(String(e.message));
  const c = e?.cause;
  if (c && typeof c === 'object') {
    for (const k of ['code', 'errno', 'syscall', 'address', 'port'] as const) {
      if (c[k] != null) parts.push(`${k}=${c[k]}`);
    }
  }
  return parts.join(' | ') || String(err);
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  cfg: { retries?: number; timeoutMs?: number; backoffMs?: number } = {},
): Promise<Response> {
  const retries = cfg.retries ?? 3;
  const timeoutMs = cfg.timeoutMs ?? 20000;
  const backoffMs = cfg.backoffMs ?? 1200;
  let lastErr: unknown = null;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (i >= retries) break;
      await sleep(backoffMs * (i + 1));
    }
  }
  throw lastErr;
}

function sanitizeTefasFiyat(fiyat: unknown): number | null {
  const n = fiyat != null ? Number(fiyat) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n === -100) return null;
  return n;
}

function formatYmd(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${yyyy}${mm}${dd}`;
}

type TefasInfoRow = {
  fonKodu?: string;
  fonUnvan?: string;
  tarih?: string;
  fiyat?: number;
};

type TefasInfoResponse = {
  errorCode?: string | number;
  errorMessage?: string;
  resultList?: TefasInfoRow[];
};

async function fetchFundsByType(fundType: string): Promise<Record<string, unknown>[]> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 3);
  const basTarih = formatYmd(start);
  const bitTarih = formatYmd(today);

  const body = JSON.stringify({
    fonTipi: fundType,
    fonKodu: null,
    aramaMetni: null,
    fonTurKod: null,
    fonGrubu: null,
    sfonTurKod: null,
    fonTurAciklama: null,
    kurucuKod: null,
    basTarih,
    bitTarih,
    basSira: 1,
    bitSira: 100000,
    dil: 'TR',
    sFonTurKod: '',
    fonKod: '',
    fonGrup: '',
    fonUnvanTip: '',
  });

  let res: Response;
  try {
    res = await fetchWithRetry(
      TEFAS_INFO_URL,
      { method: 'POST', headers: HEADERS, body },
      { retries: 3, timeoutMs: 25000, backoffMs: 1200 },
    );
  } catch (err) {
    throw new Error(`TEFAS ${fundType} fetch failed: ${describeFetchError(err)}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TEFAS ${fundType} HTTP ${res.status}: ${text.substring(0, 200)}`);
  }

  const text = await res.text();
  if (!text || text.length < 2) return [];
  const lead = text.trimStart();
  if (lead.startsWith('<') || lead.startsWith('<!')) {
    throw new Error(
      `TEFAS ${fundType}: JSON yerine HTML (WAF). İlk 60: ${lead.slice(0, 60).replace(/\s+/g, ' ')}`,
    );
  }
  let json: TefasInfoResponse;
  try {
    json = JSON.parse(text) as TefasInfoResponse;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(`TEFAS ${fundType} JSON parse: ${m}`);
  }

  const errMsg = json.errorMessage ? String(json.errorMessage) : '';
  const emptyOk = errMsg && /out of bounds|veri bulunamadı/i.test(errMsg.toLowerCase());
  if ((json.errorCode || errMsg) && !emptyOk) {
    throw new Error(`TEFAS ${fundType} API: ${errMsg || json.errorCode}`);
  }

  const rows = json.resultList || [];
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const tarihStr = row.tarih ? String(row.tarih).trim() : '';
    const tsMs = tarihStr ? new Date(`${tarihStr}T12:00:00+03:00`).getTime() : 0;
    const code = (row.fonKodu || '').trim();
    if (!code || !tsMs) continue;
    out.push({
      FONKODU: row.fonKodu,
      FONUNVAN: row.fonUnvan,
      FIYAT: row.fiyat,
      TARIH: tsMs,
    });
  }
  return out;
}

type FundEntry = Record<string, unknown> & { _tsMs: number };

async function fetchAllFunds(): Promise<FundEntry[]> {
  const allFunds = new Map<string, { _fundType: string; entriesByTs: Map<number, Record<string, unknown>> }>();

  function turkeyDateStrFromMs(ms: number) {
    return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  }

  const todayTurkey = turkeyDateStrFromMs(Date.now());

  for (let fi = 0; fi < FUND_TYPES.length; fi++) {
    const ft = FUND_TYPES[fi];
    let data: Record<string, unknown>[] = [];
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await sleep(2500);
        data = await fetchFundsByType(ft);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = String((err as Error)?.message || err);
        if (attempt === 0 && msg.includes('HTML')) continue;
        break;
      }
    }
    if (lastErr) {
      console.warn(`${ft} hatası:`, describeFetchError(lastErr));
    } else {
      for (const item of data) {
        const code = String(item.FONKODU || '')
          .trim()
          .toUpperCase();
        const tsMs = item.TARIH ? Number(item.TARIH) : 0;
        if (!code || !tsMs) continue;
        const existing = allFunds.get(code) || { _fundType: ft, entriesByTs: new Map() };
        existing.entriesByTs.set(tsMs, item);
        allFunds.set(code, existing);
      }
    }
    if (fi < FUND_TYPES.length - 1 && TEFAS_INTER_KIND_MS > 0) await sleep(TEFAS_INTER_KIND_MS);
  }

  const out: FundEntry[] = [];
  for (const [code, rec] of allFunds.entries()) {
    const entries = [...rec.entriesByTs.entries()]
      .map(([tsMs, item]) => ({ ...item, _tsMs: tsMs }))
      .sort((a, b) => a._tsMs - b._tsMs);

    const last = entries[entries.length - 1];
    const prev = entries[entries.length - 2];
    const lastRec = (last ?? null) as Record<string, unknown> | null;
    const prevRec = (prev ?? null) as Record<string, unknown> | null;
    const todayPriceRaw = lastRec?.['FIYAT'];
    const prevPriceRaw = prevRec?.['FIYAT'];
    const todayPrice = todayPriceRaw != null ? Number(todayPriceRaw) : null;
    const prevPrice = prevPriceRaw != null ? Number(prevPriceRaw) : null;
    const lastDateTurkey = last?._tsMs ? turkeyDateStrFromMs(last._tsMs) : null;

    let changePct = 0;
    if (lastDateTurkey === todayTurkey) {
      const hasValid =
        todayPrice != null &&
        prevPrice != null &&
        Number.isFinite(todayPrice) &&
        Number.isFinite(prevPrice) &&
        prevPrice > 0;
      changePct = hasValid ? ((todayPrice - prevPrice) / prevPrice) * 100 : 0;
    }

    out.push({
      ...last,
      FONKODU: code,
      _fundType: rec._fundType,
      _change_24h_pct: changePct,
    });
  }
  return out;
}

async function upsertFonAssets(
  supabase: any,
  funds: FundEntry[],
): Promise<number> {
  const now = new Date().toISOString();
  const symbols = Array.from(
    new Set(
      funds
        .map((f) => String(f.FONKODU || '').trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  const prevPriceBySymbol = new Map<string, number>();
  if (symbols.length) {
    const lookupChunk = 200;
    for (let i = 0; i < symbols.length; i += lookupChunk) {
      const slice = symbols.slice(i, i + lookupChunk);
      const { data: existing, error: exErr } = await supabase
        .from('assets')
        .select('symbol, current_price')
        .eq('category_id', 'fon')
        .in('symbol', slice);
      if (exErr) throw new Error('Fon mevcut fiyatları okunamadı: ' + exErr.message);
      for (const row of existing || []) {
        const s = String(row.symbol || '')
          .trim()
          .toUpperCase();
        const p = row.current_price != null ? Number(row.current_price) : NaN;
        if (s && Number.isFinite(p) && p > 0) prevPriceBySymbol.set(s, p);
      }
    }
  }

  const rows = funds.map((f) => {
    const code = String(f.FONKODU || '')
      .trim()
      .toUpperCase();
    const ch = f._change_24h_pct;
    const apiChange =
      ch != null && Number.isFinite(Number(ch)) ? Number(ch) : null;
    const nextPrice = sanitizeTefasFiyat(f.FIYAT);
    let change_24h_pct = apiChange;
    const prevPrice = prevPriceBySymbol.get(code);
    if (
      (change_24h_pct == null || Math.abs(change_24h_pct) < 1e-12) &&
      nextPrice != null &&
      prevPrice != null &&
      Number.isFinite(prevPrice) &&
      prevPrice > 0
    ) {
      change_24h_pct = ((nextPrice - prevPrice) / prevPrice) * 100;
    }
    return {
      category_id: 'fon',
      symbol: code,
      name: String(f.FONUNVAN || code).trim(),
      currency: 'TRY',
      external_id: code,
      current_price: nextPrice,
      change_24h_pct,
      price_updated_at: now,
    };
  });

  const chunkSize = 500;
  let affected = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from('assets')
      .upsert(slice, { onConflict: 'category_id,symbol', ignoreDuplicates: false, count: 'exact' });
    if (error) throw new Error('Fon upsert hatası: ' + error.message);
    if (typeof count === 'number') affected += count;
  }
  return affected || rows.length;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const expected = Deno.env.get('TEFAS_CRON_SECRET');
  const got = req.headers.get('x-tefas-cron') || '';
  if (!expected || got !== expected) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  // CLI `supabase secrets set` SUPABASE_* isimlerine izin vermez; service_role burada.
  const key = Deno.env.get('SERVICE_ROLE_KEY');
  if (!url || !key) {
    return json({ error: 'missing_supabase_env' }, 500);
  }

  try {
    const supabase = createClient(url, key);
    const funds = await fetchAllFunds();
    if (!funds.length) {
      return json({ ok: false, reason: 'no_funds', funds: 0 });
    }
    const affected = await upsertFonAssets(supabase, funds);
    return json({ ok: true, funds: funds.length, affected });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
});
