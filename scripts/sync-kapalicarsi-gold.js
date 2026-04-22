/**
 * Fiziki altın fiyatları (gram, çeyrek, yarım, tam, cumhuriyet):
 * - https://finans.truncgil.com/v3/today.json (Trunçgil Finans) üzerinden ALIŞ fiyatlarını çeker
 * - Supabase'de category_id = 'emtia' olan assets kayıtlarını sembole göre UPSERT eder
 *   (current_price TL; günlük % TSİ gece yarısı referansı — scripts/emtia-midnight-tr.js, döviz ile aynı mantık)
 *
 * Çalıştırma:
 *   node scripts/sync-kapalicarsi-gold.js
 *
 * Gereksinim:
 *   - Node 18+ (global fetch)
 *   - .env: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (veya EXPO_PUBLIC_SUPABASE_ANON_KEY)
 */

const TRUNC_GIL_URL = 'https://finans.truncgil.com/v3/today.json';
const TRUNCGIL_TIMEOUT_MS = Number(process.env.TRUNCGIL_TIMEOUT_MS || 20000);
const TRUNCGIL_RETRY_COUNT = Number(process.env.TRUNCGIL_RETRY_COUNT || 3);
const TRUNCGIL_RETRY_DELAY_MS = Number(process.env.TRUNCGIL_RETRY_DELAY_MS || 2000);
const TRUNCGIL_CONNECT_TIMEOUT_MS = Number(process.env.TRUNCGIL_CONNECT_TIMEOUT_MS || 30000);

// Trunçgil API anahtarı -> symbol + görünen isim (alış fiyatı kullanılıyor)
const GOLD_KEYS = {
  'gram-altin': { symbol: 'GAU_TRY', name: 'Gram Altın' },
  'gram-has-altin': { symbol: 'KULCE_ALTIN', name: 'Külçe Altın (Gram)' },
  'gumus': { symbol: 'GUMUS_GRAM', name: 'Gram Gümüş' },
  'ceyrek-altin': { symbol: 'CEYREK_YENI', name: 'Çeyrek Altın' },
  'yarim-altin': { symbol: 'YARIM_YENI', name: 'Yarım Altın' },
  'tam-altin': { symbol: 'TAM_YENI', name: 'Tam Altın' },
  'cumhuriyet-altini': { symbol: 'CUMHURIYET_YENI', name: 'Cumhuriyet Altını' },
  '22-ayar-bilezik': { symbol: 'ALTIN_22_AYAR_BILEZIK', name: '22 Ayar Bilezik' },
  '14-ayar-altin': { symbol: 'ALTIN_14_AYAR', name: '14 Ayar Altın' },
  '18-ayar-altin': { symbol: 'ALTIN_18_AYAR', name: '18 Ayar Altın' },
  'ata-altin': { symbol: 'ATA_ALTIN', name: 'Ata Altın' },
  'ikibucuk-altin': { symbol: 'IKIBUCUK_ALTIN', name: 'İkibuçuk Altın' },
  'besli-altin': { symbol: 'BESLI_ALTIN', name: 'Beşli Altın' },
  'gremse-altin': { symbol: 'GREMSE_ALTIN', name: 'Gremse Altın' },
  'resat-altin': { symbol: 'RESAT_ALTIN', name: 'Reşat Altın' },
  'hamit-altin': { symbol: 'HAMIT_ALTIN', name: 'Hamit Altın' },
};

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

// TR format: "7.337,18" veya "$5.176,99" -> sayı
function toNumber(val) {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const cleaned = String(val)
    .replace(/\$/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.\-]/g, '')
    .trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

async function fetchTruncGilData() {
  const { Agent } = require('undici');
  const dispatcher = new Agent({
    connect: { timeout: TRUNCGIL_CONNECT_TIMEOUT_MS },
  });
  let lastError = null;

  for (let attempt = 1; attempt <= TRUNCGIL_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRUNCGIL_TIMEOUT_MS);
    try {
      const res = await fetch(TRUNC_GIL_URL, {
        headers: { 'User-Agent': 'PortfoyTakip/1.0 (altin sync)' },
        signal: controller.signal,
        dispatcher,
      });

      if (!res.ok) {
        throw new Error(`Trunçgil API hatası ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      if (!data || typeof data !== 'object') {
        throw new Error('Trunçgil API beklenen formatta değil.');
      }
      return data;
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === TRUNCGIL_RETRY_COUNT;
      if (isLastAttempt) break;
      console.warn(
        `Trunçgil istek denemesi ${attempt}/${TRUNCGIL_RETRY_COUNT} başarısız: ${err?.message || err}. ${
          TRUNCGIL_RETRY_DELAY_MS
        }ms sonra tekrar denenecek...`,
      );
      await new Promise((resolve) => setTimeout(resolve, TRUNCGIL_RETRY_DELAY_MS));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (process.env.TRUNCGIL_ALLOW_FAILURE === '1') {
    console.warn(
      `[kapalicarsi-gold] Trunçgil geçici olarak erişilemedi (son hata: ${
        lastError?.message || lastError
      }). TRUNCGIL_ALLOW_FAILURE=1 olduğu için adım hata vermeden geçiliyor.`,
    );
    return {};
  }

  throw lastError || new Error('Trunçgil verisi alınamadı.');
}

async function upsertKapalicarsiGold(supabase, apiData) {
  const {
    getTurkeyDateStr,
    loadEmtiaMidnightBySymbol,
    computeEmtiaChangeWithTrMidnight,
  } = require('./emtia-midnight-tr');

  const now = new Date().toISOString();
  const todayTurkey = getTurkeyDateStr();
  const midnightMap = await loadEmtiaMidnightBySymbol(supabase);
  const payload = [];

  for (const [key, meta] of Object.entries(GOLD_KEYS)) {
    const row = apiData[key];
    if (!row || typeof row !== 'object') continue;

    const buying = row.Buying != null ? toNumber(row.Buying) : null;
    if (buying == null) continue;

    const mid = computeEmtiaChangeWithTrMidnight(buying, meta.symbol, midnightMap, todayTurkey);

    payload.push({
      category_id: 'emtia',
      symbol: meta.symbol,
      name: meta.name,
      currency: 'TRY',
      current_price: buying,
      change_24h_pct: mid.change_24h_pct,
      price_at_midnight: mid.price_at_midnight,
      price_midnight_date: mid.price_midnight_date,
      price_updated_at: now,
    });
  }

  if (!payload.length) {
    console.log('Altın: eşleşen varlık bulunamadı.');
    return 0;
  }

  const { error, count } = await supabase
    .from('assets')
    .upsert(payload, {
      onConflict: 'category_id,symbol',
      ignoreDuplicates: false,
      count: 'exact',
    });
  if (error) throw new Error('Altın emtia upsert hatası: ' + error.message);
  return typeof count === 'number' ? count : payload.length;
}

async function main() {
  await loadEnv();

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error(
      'Eksik: EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY (veya SUPABASE_SERVICE_ROLE_KEY) .env içinde olmalı.',
    );
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key);

  console.log('Fiziki altın verisi çekiliyor (Trunçgil)…');
  const data = await fetchTruncGilData();
  const goldKeys = Object.keys(GOLD_KEYS).filter((k) => data[k]);
  console.log('Eşleşen altın türü:', goldKeys.length, goldKeys.join(', '));

  const affected = await upsertKapalicarsiGold(supabase, data);
  console.log('Güncellenen/eklenen fiziki altın satırı:', affected);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

