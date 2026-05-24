#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Günlük artış bildirim eşikleri (%) — her biri günde en fazla bir kez (aynı varlık). */
const DEFAULT_RISE_TIERS = [4, 7, 10, 15];
/** Günlük düşüş bildirim eşikleri (%) — negatif; sıra dıştan içe: -4, -7, ... */
const DEFAULT_FALL_TIERS = [-4, -7, -10, -15];

function parseTierCsv(envKey, fallback) {
  const raw = process.env[envKey];
  if (raw == null || !String(raw).trim()) return [...fallback];
  const arr = String(raw)
    .split(',')
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n));
  return arr.length ? arr : [...fallback];
}

const RISE_TIERS = parseTierCsv('DAILY_GAIN_PUSH_TIERS', DEFAULT_RISE_TIERS).sort((a, b) => a - b);
const FALL_TIERS = parseTierCsv('DAILY_FALL_PUSH_TIERS', DEFAULT_FALL_TIERS).sort((a, b) => b - a);

const MIN_RISE_FOR_QUERY = Math.min(...RISE_TIERS);
const MAX_FALL_FOR_QUERY = Math.max(...FALL_TIERS);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Toz miktar / yuvarlama: pratikte sıfır sayılan holding adedi. */
const MIN_HOLDING_QTY = 1e-8;
/** Yalnızca bu hesap: push bildirimleri en son eklenen portföyden (created_at); diğer kullanıcılar etkilenmez. */
const PUSH_LATEST_PORTFOLIO_ONLY_EMAIL = 'hasimozturk@gmail.com';
const NOTIFY_HOUR_START = Number(process.env.DAILY_GAIN_PUSH_LOCAL_START_HOUR || '9');
const NOTIFY_HOUR_END_EXCLUSIVE = Number(process.env.DAILY_GAIN_PUSH_LOCAL_END_HOUR || '22');
const SUMMARY_HOUR = Number(process.env.DAILY_SUMMARY_LOCAL_HOUR || '23');
const BIST_SESSION_START_MINUTE = 10 * 60;
const BIST_SESSION_END_MINUTE = 18 * 60;
const US_SESSION_START_MINUTE = 9 * 60 + 30;
const US_SESSION_END_MINUTE = 16 * 60;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (
  !RISE_TIERS.length ||
  !FALL_TIERS.length ||
  !RISE_TIERS.every((n) => Number.isFinite(n) && n > 0) ||
  !FALL_TIERS.every((n) => Number.isFinite(n) && n < 0)
) {
  console.error(
    'DAILY_GAIN_PUSH_TIERS must be positive ascending (e.g. 4,7,10,15) and DAILY_FALL_PUSH_TIERS negative (e.g. -4,-7,-10,-15)',
  );
  process.exit(1);
}
if (RISE_TIERS.some((n, i) => i > 0 && n <= RISE_TIERS[i - 1])) {
  console.error('DAILY_GAIN_PUSH_TIERS must be strictly ascending');
  process.exit(1);
}
if (FALL_TIERS.some((n, i) => i > 0 && n >= FALL_TIERS[i - 1])) {
  console.error('DAILY_FALL_PUSH_TIERS must be strictly descending (e.g. -4 then -7)');
  process.exit(1);
}
if (
  !Number.isFinite(NOTIFY_HOUR_START) ||
  !Number.isFinite(NOTIFY_HOUR_END_EXCLUSIVE) ||
  NOTIFY_HOUR_START < 0 ||
  NOTIFY_HOUR_START > 23 ||
  NOTIFY_HOUR_END_EXCLUSIVE < 1 ||
  NOTIFY_HOUR_END_EXCLUSIVE > 24 ||
  NOTIFY_HOUR_END_EXCLUSIVE <= NOTIFY_HOUR_START
) {
  console.error('Invalid local notify hour window. Example: start=9 end=22');
  process.exit(1);
}
if (!Number.isFinite(SUMMARY_HOUR) || SUMMARY_HOUR < 0 || SUMMARY_HOUR > 23) {
  console.error('Invalid DAILY_SUMMARY_LOCAL_HOUR. Example: 23');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function isMissingPushEventLogError(error) {
  const msg = String(error?.message || '');
  return error?.code === 'PGRST205' || msg.includes("Could not find the table 'public.push_event_log'");
}

function isMissingDailyGainPushLogError(error) {
  const msg = String(error?.message || '');
  return error?.code === 'PGRST205' || msg.includes("Could not find the table 'public.daily_gain_push_log'");
}

function gainDedupeKey(userId, assetId, threshold) {
  return `${userId}:${assetId}:${threshold}`;
}

/** Günlük % için hangi eşik kademeleri aşıldı (sıra: önce düşük mutlak, sonra yüksek). */
function listCrossedAlertTiers(changePct, riseTiers, fallTiers) {
  const ch = Number(changePct);
  if (!Number.isFinite(ch)) return [];
  const out = [];
  if (ch >= riseTiers[0]) {
    for (const tier of riseTiers) {
      if (ch >= tier) out.push({ isRise: true, tier });
    }
  } else if (ch <= fallTiers[0]) {
    for (const tier of fallTiers) {
      if (ch <= tier) out.push({ isRise: false, tier });
    }
  }
  return out;
}

/** Aynı kullanıcı + varlık + eşik kademesi + İstanbul günü için en fazla bir kez uyarı (15 dk cron tekrarını keser). */
async function fetchDailyGainSentKeySet(eventDate, userIds) {
  if (!userIds.length) return new Set();
  const keys = new Set();
  for (const idChunk of chunk(userIds, 200)) {
    const { data, error } = await supabase
      .from('daily_gain_push_log')
      .select('user_id, asset_id, threshold')
      .eq('alert_date', eventDate)
      .in('user_id', idChunk)
      .limit(100000);
    if (error) {
      if (isMissingDailyGainPushLogError(error)) {
        console.warn('daily_gain_push_log table not found, per-asset dedupe is skipped.');
        return new Set();
      }
      throw new Error(`daily_gain_push_log query failed: ${error.message}`);
    }
    for (const r of data || []) {
      keys.add(gainDedupeKey(String(r.user_id), String(r.asset_id), Number(r.threshold)));
    }
  }
  return keys;
}

async function writeDailyGainLogRows(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('daily_gain_push_log').upsert(rows, {
    onConflict: 'user_id,asset_id,alert_date,threshold',
    ignoreDuplicates: true,
  });
  if (error) {
    if (isMissingDailyGainPushLogError(error)) {
      console.warn('daily_gain_push_log table not found, per-asset log write is skipped.');
      return;
    }
    throw new Error(`daily_gain_push_log upsert failed: ${error.message}`);
  }
}

function todayInIstanbul() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function resolveUserIdByEmail(email) {
  const want = String(email || '')
    .trim()
    .toLowerCase();
  if (!want) return null;
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth listUsers failed: ${error.message}`);
    const users = data?.users || [];
    const hit = users.find((u) => String(u.email || '').trim().toLowerCase() === want);
    if (hit?.id) return hit.id;
    if (users.length < 1000) break;
    page += 1;
  }
  return null;
}

function portfolioCreatedAtMs(iso) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : 0;
}

/** Kullanıcı başına en son oluşturulan portföy (created_at; eşitlikte id ile tie-break). */
function latestPortfolioIdByUser(portfolios) {
  const out = new Map();
  for (const p of portfolios || []) {
    if (!p.user_id || !p.id) continue;
    const ms = portfolioCreatedAtMs(p.created_at);
    const cur = out.get(p.user_id);
    if (!cur || ms > cur.ms || (ms === cur.ms && String(p.id) > String(cur.portfolio_id))) {
      out.set(p.user_id, { portfolio_id: p.id, ms });
    }
  }
  return out;
}

/** hasimozturk@gmail.com için { userId, latestPortfolioId } veya kullanıcı yoksa null. */
async function buildLatestPortfolioOnlyPushScope() {
  const userId = await resolveUserIdByEmail(PUSH_LATEST_PORTFOLIO_ONLY_EMAIL);
  if (!userId) {
    console.warn(
      `Push scope: ${PUSH_LATEST_PORTFOLIO_ONLY_EMAIL} auth kullanıcısı bulunamadı; genel kurallar uygulanır.`,
    );
    return null;
  }
  const { data: portfolios, error } = await supabase
    .from('portfolios')
    .select('id, user_id, created_at')
    .eq('user_id', userId)
    .limit(500);
  if (error) throw new Error(`portfolios scope query failed: ${error.message}`);
  const latest = latestPortfolioIdByUser(portfolios || []).get(userId);
  if (!latest?.portfolio_id) {
    console.warn(`Push scope: ${PUSH_LATEST_PORTFOLIO_ONLY_EMAIL} için portföy yok; bu kullanıcıya push gönderilmez.`);
    return { userId, latestPortfolioId: null };
  }
  console.log(
    `Push scope: ${PUSH_LATEST_PORTFOLIO_ONLY_EMAIL} → yalnızca portföy ${latest.portfolio_id} (en son created_at).`,
  );
  return { userId, latestPortfolioId: latest.portfolio_id };
}

function holdingAllowedForPush(userId, portfolioId, latestPortfolioOnlyScope) {
  if (!latestPortfolioOnlyScope?.userId || userId !== latestPortfolioOnlyScope.userId) {
    return true;
  }
  if (!latestPortfolioOnlyScope.latestPortfolioId) return false;
  return portfolioId === latestPortfolioOnlyScope.latestPortfolioId;
}

/**
 * Yalnızca quantity > 0 olan holding'ler — satılan (silinen / sıfırlanan) pozisyonlara push gitmez.
 * Varlık listesinden değil holding'den başlarız; "piyasada yükselen ama portföyde olmayan" eşleşme riski kalmaz.
 */
async function fetchCandidates(latestPortfolioOnlyScope) {
  const { data: portfolios, error: portfoliosError } = await supabase
    .from('portfolios')
    .select('id, user_id, created_at')
    .not('user_id', 'is', null)
    .limit(100000);
  if (portfoliosError) throw new Error(`portfolios query failed: ${portfoliosError.message}`);

  const portfolioUserMap = new Map((portfolios || []).map((p) => [p.id, p.user_id]));
  const portfolioIds = [...portfolioUserMap.keys()];
  if (!portfolioIds.length) return [];

  const out = new Map();
  for (const pidChunk of chunk(portfolioIds, 200)) {
    const { data: holdings, error: holdingsError } = await supabase
      .from('holdings')
      .select(
        'portfolio_id, quantity, asset:assets!inner(id, category_id, symbol, name, currency, current_price, change_24h_pct, price_updated_at)',
      )
      .in('portfolio_id', pidChunk)
      .gt('quantity', 0)
      .limit(100000);
    if (holdingsError) throw new Error(`holdings query failed: ${holdingsError.message}`);

    for (const h of holdings || []) {
      const userId = portfolioUserMap.get(h.portfolio_id);
      const a = h.asset;
      if (!userId || !a?.id) continue;
      if (!holdingAllowedForPush(userId, h.portfolio_id, latestPortfolioOnlyScope)) continue;

      const qty = Number(h.quantity);
      if (!Number.isFinite(qty) || qty <= MIN_HOLDING_QTY) continue;

      const change = Number(a.change_24h_pct);
      const currentPrice = a.current_price != null ? Number(a.current_price) : NaN;
      if (!Number.isFinite(change)) continue;
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;
      if (change < MIN_RISE_FOR_QUERY && change > MAX_FALL_FOR_QUERY) continue;

      const key = `${userId}:${a.id}`;
      if (out.has(key)) continue;
      out.set(key, {
        user_id: userId,
        asset_id: a.id,
        category_id: String(a.category_id || '').toLowerCase(),
        symbol: a.symbol || 'Varlik',
        name: a.name || a.symbol || 'Varlik',
        currency: String(a.currency || 'TRY').toUpperCase(),
        current_price: currentPrice,
        change_24h_pct: change,
        price_updated_at: a.price_updated_at || null,
      });
    }
  }
  return [...out.values()];
}

async function fetchTokensByUser(userIds) {
  if (!userIds.length) return new Map();
  const { data, error } = await supabase
    .from('user_push_tokens')
    .select('user_id, expo_push_token, timezone')
    .eq('enabled', true)
    .in('user_id', userIds)
    .limit(100000);

  if (error) throw new Error(`user_push_tokens query failed: ${error.message}`);
  const map = new Map();
  for (const row of data || []) {
    const userId = row.user_id;
    const token = String(row.expo_push_token || '').trim();
    const timezone = String(row.timezone || '').trim() || 'Europe/Istanbul';
    if (!token.startsWith('ExponentPushToken[')) continue;
    if (!map.has(userId)) map.set(userId, []);
    map.get(userId).push({ token, timezone });
  }
  return map;
}

function localHourInTimeZone(timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone,
    });
    const parts = fmt.formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const hour = Number(hourPart);
    return Number.isFinite(hour) ? hour : 0;
  } catch {
    // Geçersiz timezone olursa default olarak Istanbul saatine düş.
    return localHourInTimeZone('Europe/Istanbul');
  }
}

function localTimePartsInTimeZone(timeZone, now = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    });
    const parts = fmt.formatToParts(now);
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return {
      weekday,
      hour: Number.isFinite(hour) ? hour : 0,
      minute: Number.isFinite(minute) ? minute : 0,
    };
  } catch {
    if (timeZone === 'Europe/Istanbul') {
      return { weekday: 'Mon', hour: 0, minute: 0 };
    }
    return localTimePartsInTimeZone('Europe/Istanbul', now);
  }
}

function isWithinLocalWindow(timeZone, now = new Date()) {
  const { hour } = localTimePartsInTimeZone(timeZone, now);
  return hour >= NOTIFY_HOUR_START && hour < NOTIFY_HOUR_END_EXCLUSIVE;
}

function isSummaryHour(timeZone) {
  return localHourInTimeZone(timeZone) === SUMMARY_HOUR;
}

function isWeekdayInTimeZone(timeZone, now = new Date()) {
  const { weekday } = localTimePartsInTimeZone(timeZone, now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
}

function isWithinTimeRangeInTimeZone(timeZone, startMinute, endMinuteExclusive, now = new Date()) {
  const { hour, minute } = localTimePartsInTimeZone(timeZone, now);
  const totalMinute = hour * 60 + minute;
  return totalMinute >= startMinute && totalMinute < endMinuteExclusive;
}

function isWithinCategoryNotificationWindow(asset, deviceTimeZone, now = new Date()) {
  if (!isWithinLocalWindow(deviceTimeZone, now)) return false;
  const category = String(asset?.category_id || '').toLowerCase();

  if (category === 'kripto') return true;

  if (category === 'yurtdisi') {
    return (
      isWeekdayInTimeZone('America/New_York', now) &&
      isWithinTimeRangeInTimeZone('America/New_York', US_SESSION_START_MINUTE, US_SESSION_END_MINUTE, now)
    );
  }

  if (['bist', 'fon', 'mevduat'].includes(category)) {
    return (
      isWeekdayInTimeZone('Europe/Istanbul', now) &&
      isWithinTimeRangeInTimeZone('Europe/Istanbul', BIST_SESSION_START_MINUTE, BIST_SESSION_END_MINUTE, now)
    );
  }

  if (category === 'emtia') {
    return isWeekdayInTimeZone('Europe/Istanbul', now);
  }

  if (category === 'doviz') {
    return isWeekdayInTimeZone('Europe/Istanbul', now);
  }

  return true;
}

function formatNumberTr(value) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatNumberTr(Math.abs(value))}%`;
}

function currencyLabel(code) {
  if (code === 'TRY') return 'TL';
  return code || 'TL';
}

function dateInTimeZone(dateLike, timeZone) {
  const d = dateLike ? new Date(dateLike) : new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function isFreshForCategory(asset) {
  if (!asset?.price_updated_at) return false;
  const now = new Date();
  const category = String(asset.category_id || '').toLowerCase();

  // BIST/FON/emtia/doviz veri tazeliği: Istanbul takvim gününe göre bugün güncellenmiş olmalı.
  if (['bist', 'fon', 'emtia', 'doviz'].includes(category)) {
    return dateInTimeZone(asset.price_updated_at, 'Europe/Istanbul') === dateInTimeZone(now, 'Europe/Istanbul');
  }
  // Yurtdisi: New York takvim gününe göre.
  if (category === 'yurtdisi') {
    return dateInTimeZone(asset.price_updated_at, 'America/New_York') === dateInTimeZone(now, 'America/New_York');
  }
  // Kripto: UTC gününe göre taze.
  if (category === 'kripto') {
    return dateInTimeZone(asset.price_updated_at, 'UTC') === dateInTimeZone(now, 'UTC');
  }
  // Bilinmeyen kategorilerde en azından bugünün tarihine bak.
  return dateInTimeZone(asset.price_updated_at, 'Europe/Istanbul') === dateInTimeZone(now, 'Europe/Istanbul');
}

async function fetchUsdTryRate() {
  const { data, error } = await supabase
    .from('assets')
    .select('current_price')
    .eq('category_id', 'doviz')
    .eq('symbol', 'USD')
    .maybeSingle();
  if (error) throw new Error(`USD rate query failed: ${error.message}`);
  const rate = Number(data?.current_price);
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function legacyCryptoStoredUnitToUsd(unitPrice, usdTryRate, referenceUsd) {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return unitPrice;
  if (!Number.isFinite(usdTryRate) || usdTryRate < 5) return unitPrice;

  const asUsdFromTry = unitPrice / usdTryRate;
  if (unitPrice >= 500000) return asUsdFromTry;

  if (referenceUsd != null && referenceUsd > 0) {
    const distSame = Math.abs(unitPrice - referenceUsd) / referenceUsd;
    const distConverted = Math.abs(asUsdFromTry - referenceUsd) / referenceUsd;
    if (distConverted < distSame && distConverted < 0.4) return asUsdFromTry;
  }
  return unitPrice;
}

function kriptoStoredUnitToUsd(unitPrice, usdTryRate, storedCurrency, referenceUsd) {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return unitPrice;
  const c = String(storedCurrency || '')
    .trim()
    .toUpperCase();
  if (c === 'TRY' || c === 'TL') {
    if (!Number.isFinite(usdTryRate) || usdTryRate < 5) return unitPrice;
    return unitPrice / usdTryRate;
  }
  return legacyCryptoStoredUnitToUsd(unitPrice, usdTryRate, referenceUsd);
}

function fonUnitNativeTry(currentPrice, avgPrice) {
  const raw = currentPrice != null ? Number(currentPrice) : NaN;
  const avg = avgPrice != null ? Number(avgPrice) : NaN;
  const avgOk = Number.isFinite(avg) && avg > 0;
  if (raw === -100 || (Number.isFinite(raw) && raw < 0)) {
    return avgOk ? avg : 0;
  }
  if (Number.isFinite(raw) && raw > 0) return raw;
  return avgOk ? avg : 0;
}

function isUsdNativeCategory(categoryId) {
  return categoryId === 'yurtdisi' || categoryId === 'kripto';
}

function effectiveChange24hPctForSummary(categoryId, change24hPct, priceUpdatedAt, now = new Date()) {
  if (change24hPct == null) return null;
  const raw = Number(change24hPct);
  if (!Number.isFinite(raw)) return null;
  if (categoryId === 'kripto') return raw;

  let sessionTz = null;
  if (['bist', 'fon', 'emtia', 'mevduat', 'doviz'].includes(categoryId)) {
    sessionTz = 'Europe/Istanbul';
  } else if (categoryId === 'yurtdisi') {
    sessionTz = 'America/New_York';
  }
  if (!sessionTz) return raw;
  if (!priceUpdatedAt) return null;
  return dateInTimeZone(priceUpdatedAt, sessionTz) === dateInTimeZone(now, sessionTz) ? raw : null;
}

function dailyPrevValueFromChangePct(value, change24hPct) {
  const pctRaw = change24hPct ?? 0;
  const pct = Number(pctRaw);
  const pctSafe = Number.isFinite(pct) ? pct : 0;
  const denom = 1 + pctSafe / 100;
  const canUse = pctSafe !== 0 && Number.isFinite(denom) && Math.abs(denom) > 1e-9;
  const prevValue = canUse ? value / denom : value;
  const dailyDelta = canUse ? value - prevValue : 0;
  return { prevValue, dailyDelta };
}

function holdingUnitNativeForSummary(row, usdTry) {
  const categoryId = String(row.category_id || '').toLowerCase();
  const currentPrice = row.current_price != null ? Number(row.current_price) : NaN;
  const avgPrice = row.avg_price != null ? Number(row.avg_price) : NaN;
  const safeRate = usdTry > 0 ? usdTry : 1;

  if (categoryId === 'kripto') {
    if (Number.isFinite(currentPrice) && currentPrice > 0) {
      return kriptoStoredUnitToUsd(currentPrice, safeRate, row.currency);
    }
    if (Number.isFinite(avgPrice) && avgPrice > 0) {
      return legacyCryptoStoredUnitToUsd(avgPrice, safeRate);
    }
    return 0;
  }

  if (categoryId === 'fon') {
    return fonUnitNativeTry(currentPrice, avgPrice);
  }

  if (Number.isFinite(currentPrice) && currentPrice > 0) return currentPrice;
  if (Number.isFinite(avgPrice) && avgPrice > 0) return avgPrice;
  return 0;
}

async function sendExpo(messages) {
  const failed = [];
  let sent = 0;
  for (const batch of chunk(messages, 100)) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      failed.push({ status: res.status, body: JSON.stringify(body).slice(0, 240) });
      continue;
    }
    const rows = Array.isArray(body?.data) ? body.data : [];
    sent += rows.length;
  }
  return { sent, failed };
}

async function fetchSummarySentSet(eventDate) {
  const { data, error } = await supabase
    .from('push_event_log')
    .select('user_id')
    .eq('event_type', 'daily_summary')
    .eq('event_date', eventDate)
    .limit(100000);
  if (error) {
    if (isMissingPushEventLogError(error)) {
      console.warn('push_event_log table not found, summary dedupe log is skipped.');
      return new Set();
    }
    throw new Error(`push_event_log query failed: ${error.message}`);
  }
  return new Set((data || []).map((r) => String(r.user_id)));
}

async function writeSummaryLogRows(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('push_event_log').upsert(rows, {
    onConflict: 'user_id,event_type,event_date,event_ref',
    ignoreDuplicates: true,
  });
  if (error) {
    if (isMissingPushEventLogError(error)) {
      console.warn('push_event_log table not found, summary log write is skipped.');
      return;
    }
    throw new Error(`push_event_log insert failed: ${error.message}`);
  }
}

async function fetchUserHoldingsWithPrices() {
  const { data: portfolios, error: portfoliosError } = await supabase
    .from('portfolios')
    .select('id, user_id, name, created_at')
    .not('user_id', 'is', null)
    .limit(100000);
  if (portfoliosError) throw new Error(`portfolios query failed: ${portfoliosError.message}`);

  const portfolioMetaById = new Map(
    (portfolios || []).map((p) => [
      p.id,
      {
        user_id: p.user_id,
        name: p.name || 'Portfoy',
        created_at: p.created_at || '',
      },
    ]),
  );
  const portfolioIds = [...portfolioMetaById.keys()];
  if (!portfolioIds.length) return { rows: [], portfolios: portfolios || [] };

  const rows = [];
  for (const pidChunk of chunk(portfolioIds, 200)) {
    const { data: holdings, error } = await supabase
      .from('holdings')
      .select(
        'portfolio_id, quantity, avg_price, asset:assets(category_id, symbol, currency, current_price, change_24h_pct, price_updated_at)',
      )
      .in('portfolio_id', pidChunk)
      .gt('quantity', 0)
      .limit(100000);
    if (error) throw new Error(`holdings summary query failed: ${error.message}`);
    for (const h of holdings || []) {
      const portfolioMeta = portfolioMetaById.get(h.portfolio_id);
      if (!portfolioMeta?.user_id) continue;
      const qty = Number(h.quantity);
      if (!Number.isFinite(qty) || qty <= MIN_HOLDING_QTY || !h?.asset) continue;
      rows.push({
        user_id: portfolioMeta.user_id,
        portfolio_id: h.portfolio_id,
        portfolio_name: portfolioMeta.name,
        portfolio_created_at: portfolioMeta.created_at,
        quantity: qty,
        avg_price: h.avg_price != null ? Number(h.avg_price) : null,
        category_id: String(h?.asset?.category_id || '').toLowerCase(),
        symbol: String(h?.asset?.symbol || 'VARLIK').toUpperCase(),
        currency: String(h?.asset?.currency || 'TRY').toUpperCase(),
        current_price: h?.asset?.current_price != null ? Number(h.asset.current_price) : null,
        change_24h_pct:
          h?.asset?.change_24h_pct != null && Number.isFinite(Number(h.asset.change_24h_pct))
            ? Number(h.asset.change_24h_pct)
            : null,
        price_updated_at: h?.asset?.price_updated_at || null,
      });
    }
  }
  return { rows, portfolios: portfolios || [] };
}

function computePortfolioDailySummaryByUser(rows, usdTry, portfolios, latestPortfolioOnlyScope) {
  const agg = new Map();
  const now = new Date();
  for (const r of rows) {
    const unitNative = holdingUnitNativeForSummary(r, usdTry);
    if (!Number.isFinite(unitNative) || unitNative <= 0) continue;
    const isUSD = isUsdNativeCategory(r.category_id);
    const rateTL = isUSD ? usdTry : 1;
    const curTL = r.quantity * unitNative * rateTL;
    const effPct = effectiveChange24hPctForSummary(r.category_id, r.change_24h_pct, r.price_updated_at, now);
    const { dailyDelta } = dailyPrevValueFromChangePct(r.quantity * unitNative, effPct);
    const dailyDeltaTL = dailyDelta * rateTL;
    const key = `${r.user_id}:${r.portfolio_id}`;
    const entry =
      agg.get(key) || {
        user_id: r.user_id,
        portfolio_id: r.portfolio_id,
        portfolio_name: r.portfolio_name || 'Portfoy',
        portfolio_created_at: r.portfolio_created_at || '',
        total_tl: 0,
        daily_change_tl: 0,
        topRisers: new Map(),
      };
    entry.total_tl += curTL;
    entry.daily_change_tl += dailyDeltaTL;
    const oldR = entry.topRisers.get(r.symbol);
    if (!oldR || (Number.isFinite(effPct) && effPct > oldR.change_24h_pct)) {
      entry.topRisers.set(r.symbol, {
        symbol: r.symbol,
        change_24h_pct: Number.isFinite(effPct) ? effPct : -9999,
      });
    }
    agg.set(key, entry);
  }

  const latestByUser = latestPortfolioIdByUser(portfolios);
  const scopedUserId = latestPortfolioOnlyScope?.userId ?? null;
  const out = new Map();
  for (const v of agg.values()) {
    if (!Number.isFinite(v.total_tl) || v.total_tl <= 0) continue;

    const prevTL = v.total_tl - v.daily_change_tl;
    const pct =
      prevTL > 0 ? Math.round((v.daily_change_tl / prevTL) * 10000) / 100 : 0;
    const topRisers = [...v.topRisers.values()]
      .filter((x) => Number.isFinite(x.change_24h_pct) && x.change_24h_pct > 0)
      .sort((a, b) => b.change_24h_pct - a.change_24h_pct)
      .slice(0, 3)
      .map((x) => x.symbol);
    const summary = {
      portfolio_id: v.portfolio_id,
      portfolio_name: v.portfolio_name,
      total_tl: v.total_tl,
      daily_change_tl: v.daily_change_tl,
      daily_pct_tl: pct,
      topRisers,
    };

    if (scopedUserId && v.user_id === scopedUserId) {
      const latest = latestByUser.get(v.user_id);
      if (!latest || latest.portfolio_id !== v.portfolio_id) continue;
      out.set(v.user_id, summary);
      continue;
    }

    const existing = out.get(v.user_id);
    if (!existing || v.total_tl > existing.total_tl) {
      out.set(v.user_id, summary);
    }
  }
  return out;
}

async function main() {
  const eventDate = todayInIstanbul();
  const latestPortfolioOnlyScope = await buildLatestPortfolioOnlyPushScope();
  const candidates = await fetchCandidates(latestPortfolioOnlyScope);
  const targets = candidates;
  const usdTry = await fetchUsdTryRate();
  const summaryPayload = await fetchUserHoldingsWithPrices();
  const summaryRows = summaryPayload.rows;
  const summaryByUser = computePortfolioDailySummaryByUser(
    summaryRows,
    usdTry,
    summaryPayload.portfolios,
    latestPortfolioOnlyScope,
  );
  const uniqueUserIds = [...new Set([...targets.map((t) => t.user_id), ...summaryByUser.keys()])];
  const tokensByUser = await fetchTokensByUser(uniqueUserIds);

  const targetUserIds = [...new Set(targets.map((t) => t.user_id))];
  const dailyGainSentKeys = await fetchDailyGainSentKeySet(eventDate, targetUserIds);

  const pushMessages = [];
  const summaryLogRows = [];
  const dailyGainLogRows = [];

  for (const t of targets) {
    if (!isFreshForCategory(t)) continue;
    const devices = tokensByUser.get(t.user_id) || [];
    if (!devices.length) continue;

    const tierSteps = listCrossedAlertTiers(t.change_24h_pct, RISE_TIERS, FALL_TIERS);
    if (!tierSteps.length) continue;

    const pctText = formatPct(t.change_24h_pct);
    const priceText = formatNumberTr(t.current_price);
    const ccy = currencyLabel(t.currency);

    for (const { isRise, tier } of tierSteps) {
      const dedupeKey = gainDedupeKey(String(t.user_id), String(t.asset_id), tier);
      if (dailyGainSentKeys.has(dedupeKey)) continue;

      const rocket = isRise && t.change_24h_pct >= 5 ? ' 🚀' : '';
      const accent = isRise ? '🟢' : '🔴';
      const tierLabel = formatPct(tier);
      const body = isRise
        ? `${accent} ${t.symbol}, ${pctText} artisla ${priceText} ${ccy} oldu (${tierLabel} esigi).${rocket}`
        : `${accent} ${t.symbol}, ${pctText} dususle ${priceText} ${ccy} oldu (${tierLabel} esigi).`;

      let queuedForThisTier = false;
      for (const device of devices) {
        if (!isWithinCategoryNotificationWindow(t, device.timezone)) continue;
        pushMessages.push({
          to: device.token,
          sound: 'default',
          title: 'Önemli Fiyat Değişikliği',
          body,
          data: {
            type: isRise ? 'daily_gain_alert' : 'daily_fall_alert',
            assetId: t.asset_id,
            symbol: t.symbol,
            changePct: t.change_24h_pct,
            tierThreshold: tier,
          },
        });
        queuedForThisTier = true;
      }
      if (queuedForThisTier) {
        dailyGainSentKeys.add(dedupeKey);
        dailyGainLogRows.push({
          user_id: t.user_id,
          asset_id: t.asset_id,
          alert_date: eventDate,
          threshold: tier,
          change_24h_pct: t.change_24h_pct,
        });
      }
    }
  }

  // 23:00 yerel saat Günsonu Özeti (kullanıcı başına günde 1 kez; hasim → en son portföy, diğerleri → en büyük portföy)
  const summarySentSet = await fetchSummarySentSet(eventDate);
  for (const [userId, summary] of summaryByUser.entries()) {
    if (summarySentSet.has(userId)) continue;
    const devices = tokensByUser.get(userId) || [];
    if (!devices.length) continue;

    const pctText = formatPct(summary.daily_pct_tl);
    const totalText = formatNumberTr(summary.total_tl);
    const ccy = 'TL';
    const portfolioName = String(summary.portfolio_name || 'Portfoy');
    const isUp = summary.daily_change_tl >= 0;
    const accent = isUp ? '🟢' : '🔴';
    const directionText = isUp ? 'artisla' : 'dususle';
    const risersText =
      summary.topRisers.length > 0 ? ` Yukselenler ${summary.topRisers.join(',')}.` : '';
    const body = `${accent} "${portfolioName}" portfoyunuz bugun ${pctText} ${directionText} ${totalText} ${ccy} oldu.${risersText}`;

    let pushedForUser = false;
    for (const device of devices) {
      if (!isSummaryHour(device.timezone)) continue;
      pushMessages.push({
        to: device.token,
        sound: 'default',
        title: 'Gün Sonu Bilgilendirmesi',
        body,
        data: {
          type: 'daily_portfolio_summary',
          delta: summary.daily_change_tl,
          pct: summary.daily_pct_tl,
          portfolioId: summary.portfolio_id,
          eventDate,
        },
      });
      pushedForUser = true;
    }
    if (pushedForUser) {
      summaryLogRows.push({
        user_id: userId,
        event_type: 'daily_summary',
        event_date: eventDate,
        event_ref: 'portfolio_total',
        created_at: new Date().toISOString(),
      });
    }
  }

  if (!pushMessages.length) {
    console.log('No push candidate in current local time windows.');
    return;
  }

  const result = await sendExpo(pushMessages);
  if (result.failed.length) {
    console.warn('Some Expo push batches failed:', result.failed);
  }

  if (!result.failed.length && dailyGainLogRows.length) {
    await writeDailyGainLogRows(dailyGainLogRows);
  } else if (result.failed.length && dailyGainLogRows.length) {
    console.warn(
      'Skipping daily_gain_push_log write because some Expo batches failed; threshold alerts may retry on next run.',
    );
  }

  await writeSummaryLogRows(summaryLogRows);
  console.log(
    `Daily alert push done. tokens_sent=${result.sent} summary_users_logged=${summaryLogRows.length} daily_gain_logs=${dailyGainLogRows.length} candidates=${targets.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

