/**
 * TEFAS fon stopaj metadata sync → fund_tax_metadata
 *
 * Çalıştırma: npm run sync-fund-tax-metadata
 * Günde 1 kez (TEFAS fiyat sync sonrası).
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

import {
  classifyFundTax,
  inferCategoryFromName,
  inferCategoryFromUmbrella,
  normalizeFundSymbol,
  parseTefasListedStatus,
  type FundKind,
} from '../lib/fund-tax-classification';
import { buildFundStopajSchedule } from '../lib/fund-stopaj';

const TEFAS_BASE = 'https://www.tefas.gov.tr';
const BULK_URL = `${TEFAS_BASE}/api/funds/fonGetiriBazliBilgiGetir`;
const INFO_URL = `${TEFAS_BASE}/api/funds/fonBilgiGetir`;
const PROFILE_URL = `${TEFAS_BASE}/api/funds/fonProfilBilgiGetir`;

const FUND_TYPES: FundKind[] = ['YAT', 'EMK', 'BYF', 'GYF', 'GSYF'];

const HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Content-Type': 'application/json',
  Origin: TEFAS_BASE,
  Referer: `${TEFAS_BASE}/tr/fon-verileri`,
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

type BulkRow = {
  fonKodu?: string;
  fonUnvan?: string;
  fonTurAciklama?: string;
  fonKategori?: string;
  tefasDurum?: boolean | string | null;
};

type RegistryEntry = {
  fundKind: FundKind;
  bulk: BulkRow | null;
  fundName: string;
  umbrellaType: string | null;
};

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, options: RequestInit, cfg: { retries?: number; timeoutMs?: number; backoffMs?: number } = {}) {
  const retries = cfg.retries ?? 3;
  const timeoutMs = cfg.timeoutMs ?? 25000;
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

async function postTefas<T>(url: string, body: Record<string, unknown>): Promise<{ resultList?: T[] }> {
  const res = await fetchWithRetry(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TEFAS HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(`TEFAS HTML yanıt (WAF): ${text.slice(0, 80)}`);
  }
  return JSON.parse(text) as { resultList?: T[] };
}

async function fetchBulkByKind(fundKind: FundKind) {
  return postTefas<BulkRow>(BULK_URL, {
    dil: 'TR',
    fonTipi: fundKind,
    kurucuKodu: null,
    sfonTurKod: null,
    fonTurAciklama: null,
    islem: 1,
    fonTurKod: null,
    fonGrubu: null,
    donemGetiri1a: '1',
    donemGetiri3a: '1',
    donemGetiri6a: '1',
    donemGetiri1y: '1',
    donemGetiriyb: '1',
    donemGetiri3y: '1',
    donemGetiri5y: '1',
    basTarih: null,
    bitTarih: null,
    calismaTipi: 2,
    getiriOrani: '1',
  });
}

async function fetchFundCategory(fundKind: FundKind, symbol: string) {
  const json = await postTefas<{ fonKategori?: string }>(INFO_URL, {
    fonTipi: fundKind,
    fonKodu: symbol,
    dil: 'TR',
  });
  const row = json.resultList?.[0];
  return row?.fonKategori ? String(row.fonKategori).trim() : null;
}

async function fetchTefasProfileStatus(fundKind: FundKind, symbol: string) {
  const json = await postTefas<{ tefasDurum?: string }>(PROFILE_URL, {
    fonTipi: fundKind,
    fonKodu: symbol,
    dil: 'TR',
  });
  return json.resultList?.[0]?.tefasDurum ?? null;
}

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('Eksik: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env içinde olmalı.');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const interKindMs = Math.max(0, Number(process.env.TEFAS_INTER_KIND_DELAY_MS || '11000'));
  const detailDelayMs = Math.max(1000, Number(process.env.FUND_TAX_DETAIL_DELAY_MS || '11000'));
  const enrichAll = process.env.FUND_TAX_ENRICH_ALL === '1';

  console.log('TEFAS toplu fon metadata çekiliyor...');
  const registry = new Map<string, RegistryEntry>();

  for (let fi = 0; fi < FUND_TYPES.length; fi++) {
    const kind = FUND_TYPES[fi];
    console.log(`  ${kind}...`);
    try {
      const json = await fetchBulkByKind(kind);
      const rows = json.resultList ?? [];
      console.log(`  ${kind}: ${rows.length} fon`);
      for (const row of rows) {
        const symbol = normalizeFundSymbol(row.fonKodu);
        if (!symbol) continue;
        registry.set(symbol, {
          fundKind: kind,
          bulk: row,
          fundName: String(row.fonUnvan || symbol).trim(),
          umbrellaType: row.fonTurAciklama ? String(row.fonTurAciklama).trim() : null,
        });
      }
    } catch (err) {
      console.warn(`  ${kind} bulk hatası:`, err instanceof Error ? err.message : err);
    }
    if (fi < FUND_TYPES.length - 1 && interKindMs > 0) await sleep(interKindMs);
  }

  console.log('Supabase fon assets listesi okunuyor...');
  const assetBySymbol = new Map<string, { id: string; name: string }>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('assets')
      .select('id, symbol, name')
      .eq('category_id', 'fon')
      .order('symbol')
      .range(from, from + pageSize - 1);
    if (error) throw new Error('assets okunamadı: ' + error.message);
    for (const row of data ?? []) {
      const sym = normalizeFundSymbol(row.symbol);
      if (!sym) continue;
      assetBySymbol.set(sym, { id: row.id, name: row.name });
      if (!registry.has(sym)) {
        registry.set(sym, {
          fundKind: 'YAT',
          bulk: null,
          fundName: String(row.name || sym).trim(),
          umbrellaType: null,
        });
      }
    }
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`  assets fon: ${assetBySymbol.size}, registry: ${registry.size}`);

  const now = new Date().toISOString();
  const upsertRows: Array<Record<string, unknown>> = [];
  let detailCalls = 0;
  let idx = 0;

  for (const [symbol, rec] of registry.entries()) {
    idx++;
    const bulk = rec.bulk;
    let category = bulk?.fonKategori ? String(bulk.fonKategori).trim() : null;
    if (!category) category = inferCategoryFromName(rec.fundName);
    if (!category) category = inferCategoryFromUmbrella(rec.umbrellaType);
    if (!category && rec.fundKind === 'GYF') category = 'Gayrimenkul Yatırım Fonları';
    if (!category && rec.fundKind === 'GSYF') category = 'Girişim Sermayesi Yatırım Fonları';

    let tefasListed = parseTefasListedStatus(bulk?.tefasDurum);
    const hisseYogunCandidate = /HİSSE\s*SENEDİ\s*YOĞUN/i.test(rec.fundName);
    const serbestCandidate = /\bSERBEST\b/i.test(rec.fundName);

    // Profil API yalnızca TEFAS durumu belirsiz veya TEFAS dışı serbest HY için gerekli.
    const needsProfile =
      enrichAll ||
      (tefasListed == null && !bulk) ||
      (tefasListed == null && serbestCandidate && hisseYogunCandidate);

    // Kategori API yalnızca bulk'ta olmayan (DB'de kalmış) fonlar için.
    const needsCategory = enrichAll || (!category && !bulk);

    if (needsProfile || needsCategory) {
      if (detailCalls > 0) await sleep(detailDelayMs);
      try {
        if (needsCategory) {
          const apiCat = await fetchFundCategory(rec.fundKind, symbol);
          detailCalls++;
          if (apiCat) category = apiCat;
          if (needsProfile) await sleep(detailDelayMs);
        }
        if (needsProfile) {
          const status = await fetchTefasProfileStatus(rec.fundKind, symbol);
          detailCalls++;
          const parsed = parseTefasListedStatus(status);
          if (parsed != null) tefasListed = parsed;
        }
      } catch (err) {
        console.warn(`  ${symbol} detay API:`, err instanceof Error ? err.message : err);
      }
    }

    const classification = classifyFundTax({
      symbol,
      fundKind: rec.fundKind,
      fundName: rec.fundName,
      umbrellaType: rec.umbrellaType,
      category,
      tefasListed,
    });

    const schedule = buildFundStopajSchedule(classification);
    const asset = assetBySymbol.get(symbol);

    upsertRows.push({
      symbol,
      asset_id: asset?.id ?? null,
      fund_kind: classification.fundKind,
      fund_name: classification.fundName,
      umbrella_type: classification.umbrellaType,
      category: classification.category,
      is_hisse_yogun: classification.isHisseYogun,
      is_serbest: classification.isSerbest,
      tefas_listed: classification.tefasListed,
      stopaj_pct_reference: schedule.referenceRatePct,
      stopaj_schedule: schedule,
      source_updated_at: now,
    });

    if (idx % 250 === 0) {
      console.log(`  sınıflandırma: ${idx}/${registry.size} (detay API: ${detailCalls})`);
    }
  }

  console.log(`fund_tax_metadata upsert (${upsertRows.length} satır)...`);
  const chunkSize = 300;
  let affected = 0;
  for (let i = 0; i < upsertRows.length; i += chunkSize) {
    const slice = upsertRows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from('fund_tax_metadata')
      .upsert(slice, { onConflict: 'symbol', ignoreDuplicates: false, count: 'exact' });
    if (error) throw new Error('fund_tax_metadata upsert: ' + error.message);
    if (typeof count === 'number') affected += count;
  }

  const ref0 = upsertRows.filter((r) => r.stopaj_pct_reference === 0).length;
  const ref175 = upsertRows.filter((r) => r.stopaj_pct_reference === 17.5).length;
  console.log('Tamamlandı.');
  console.log(`  upsert: ${affected || upsertRows.length}`);
  console.log(`  referans %0: ${ref0}, referans %17.5: ${ref175}, diğer: ${upsertRows.length - ref0 - ref175}`);
  console.log(`  detay API çağrısı: ${detailCalls}`);

  console.log('\nÖrnekler:');
  for (const sample of upsertRows.filter((r) => ['AAL', 'HFR', 'CAH', 'TN1'].includes(String(r.symbol)))) {
    console.log(
      `  ${String(sample.symbol).padEnd(5)} ${String(sample.category ?? '').slice(0, 22).padEnd(24)} ` +
        `TEFAS:${sample.tefas_listed ? 'Y' : 'N'} ref:%${sample.stopaj_pct_reference}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
