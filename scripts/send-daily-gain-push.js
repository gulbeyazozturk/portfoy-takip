#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RISE_THRESHOLD = Number(process.env.DAILY_GAIN_PUSH_THRESHOLD || '2');
const FALL_THRESHOLD = Number(process.env.DAILY_FALL_PUSH_THRESHOLD || '-3');
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const NOTIFY_HOUR_START = Number(process.env.DAILY_GAIN_PUSH_LOCAL_START_HOUR || '9');
const NOTIFY_HOUR_END_EXCLUSIVE = Number(process.env.DAILY_GAIN_PUSH_LOCAL_END_HOUR || '22');
const SUMMARY_HOUR = Number(process.env.DAILY_SUMMARY_LOCAL_HOUR || '23');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!Number.isFinite(RISE_THRESHOLD) || !Number.isFinite(FALL_THRESHOLD)) {
  console.error('DAILY_GAIN_PUSH_THRESHOLD and DAILY_FALL_PUSH_THRESHOLD must be numbers');
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

async function fetchCandidates() {
  const { data: assets, error: assetsError } = await supabase
    .from('assets')
    .select('id, category_id, symbol, name, currency, current_price, change_24h_pct, price_updated_at')
    .or(`change_24h_pct.gte.${RISE_THRESHOLD},change_24h_pct.lte.${FALL_THRESHOLD}`)
    .limit(10000);
  if (assetsError) throw new Error(`assets query failed: ${assetsError.message}`);
  if (!assets?.length) return [];

  const assetMap = new Map();
  for (const a of assets) {
    const id = a.id;
    const change = Number(a.change_24h_pct);
    if (!id || !Number.isFinite(change)) continue;
    if (change < RISE_THRESHOLD && change > FALL_THRESHOLD) continue;
    assetMap.set(id, {
      asset_id: id,
      category_id: String(a.category_id || '').toLowerCase(),
      symbol: a.symbol || 'Varlik',
      name: a.name || a.symbol || 'Varlik',
      currency: String(a.currency || 'TRY').toUpperCase(),
      current_price: Number(a.current_price),
      change_24h_pct: change,
      price_updated_at: a.price_updated_at || null,
    });
  }
  const assetIds = [...assetMap.keys()];
  if (!assetIds.length) return [];

  const { data: portfolios, error: portfoliosError } = await supabase
    .from('portfolios')
    .select('id, user_id')
    .not('user_id', 'is', null)
    .limit(100000);
  if (portfoliosError) throw new Error(`portfolios query failed: ${portfoliosError.message}`);

  const portfolioUserMap = new Map((portfolios || []).map((p) => [p.id, p.user_id]));
  const rows = [];
  for (const assetIdChunk of chunk(assetIds, 200)) {
    const { data: holdings, error: holdingsError } = await supabase
      .from('holdings')
      .select('asset_id, portfolio_id')
      .in('asset_id', assetIdChunk)
      .limit(100000);
    if (holdingsError) throw new Error(`holdings query failed: ${holdingsError.message}`);
    rows.push(...(holdings || []));
  }

  const out = new Map();
  for (const h of rows) {
    const userId = portfolioUserMap.get(h.portfolio_id);
    const asset = assetMap.get(h.asset_id);
    if (!userId || !asset) continue;
    const key = `${userId}:${asset.asset_id}`;
    if (out.has(key)) continue;
    out.set(key, { user_id: userId, ...asset });
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

function isWithinLocalWindow(timeZone) {
  const hour = localHourInTimeZone(timeZone);
  return hour >= NOTIFY_HOUR_START && hour < NOTIFY_HOUR_END_EXCLUSIVE;
}

function isSummaryHour(timeZone) {
  return localHourInTimeZone(timeZone) === SUMMARY_HOUR;
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

  const portfolioUserMap = new Map((portfolios || []).map((p) => [p.id, p.user_id]));
  const portfolioNameByUser = new Map();
  for (const p of portfolios || []) {
    const uid = p.user_id;
    if (!uid) continue;
    const prev = portfolioNameByUser.get(uid);
    if (!prev) {
      portfolioNameByUser.set(uid, { name: p.name || 'Portfoy', created_at: p.created_at || '' });
      continue;
    }
    if ((p.created_at || '') < prev.created_at) {
      portfolioNameByUser.set(uid, { name: p.name || 'Portfoy', created_at: p.created_at || '' });
    }
  }
  const portfolioIds = [...portfolioUserMap.keys()];
  if (!portfolioIds.length) return { rows: [], portfolioNameByUser: new Map() };

  const rows = [];
  for (const pidChunk of chunk(portfolioIds, 200)) {
    const { data: holdings, error } = await supabase
      .from('holdings')
      .select('portfolio_id, quantity, asset:assets(symbol, currency, current_price, change_24h_pct)')
      .in('portfolio_id', pidChunk)
      .limit(100000);
    if (error) throw new Error(`holdings summary query failed: ${error.message}`);
    for (const h of holdings || []) {
      const userId = portfolioUserMap.get(h.portfolio_id);
      if (!userId) continue;
      const qty = Number(h.quantity);
      const price = Number(h?.asset?.current_price);
      const chg = Number(h?.asset?.change_24h_pct);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue;
      rows.push({
        user_id: userId,
        quantity: qty,
        symbol: String(h?.asset?.symbol || 'VARLIK').toUpperCase(),
        currency: String(h?.asset?.currency || 'TRY').toUpperCase(),
        current_price: price,
        change_24h_pct: Number.isFinite(chg) ? chg : null,
      });
    }
  }
  return { rows, portfolioNameByUser };
}

function computePortfolioDailySummaryByUser(rows) {
  const agg = new Map();
  for (const r of rows) {
    const cur = r.quantity * r.current_price;
    const pct = r.change_24h_pct;
    const denom = Number.isFinite(pct) && pct > -99.9 ? 1 + pct / 100 : null;
    const prev = denom && denom > 0 ? cur / denom : cur;
    const entry = agg.get(r.user_id) || { cur: 0, prev: 0, topRisers: new Map(), currencyTotals: new Map() };
    entry.cur += cur;
    entry.prev += prev;
    const ccy = r.currency || 'TRY';
    entry.currencyTotals.set(ccy, (entry.currencyTotals.get(ccy) || 0) + cur);
    const oldR = entry.topRisers.get(r.symbol);
    if (!oldR || (Number.isFinite(r.change_24h_pct) && r.change_24h_pct > oldR.change_24h_pct)) {
      entry.topRisers.set(r.symbol, {
        symbol: r.symbol,
        change_24h_pct: Number.isFinite(r.change_24h_pct) ? r.change_24h_pct : -9999,
      });
    }
    agg.set(r.user_id, entry);
  }
  const out = new Map();
  for (const [userId, v] of agg.entries()) {
    if (!Number.isFinite(v.cur) || !Number.isFinite(v.prev) || v.prev <= 0) continue;
    const delta = v.cur - v.prev;
    const pct = (delta / v.prev) * 100;
    let topCurrency = 'TRY';
    let topTotal = -Infinity;
    for (const [ccy, total] of v.currencyTotals.entries()) {
      if (total > topTotal) {
        topTotal = total;
        topCurrency = ccy;
      }
    }
    const topRisers = [...v.topRisers.values()]
      .filter((x) => Number.isFinite(x.change_24h_pct) && x.change_24h_pct > 0)
      .sort((a, b) => b.change_24h_pct - a.change_24h_pct)
      .slice(0, 3)
      .map((x) => x.symbol);
    out.set(userId, { delta, pct, total: v.cur, currency: topCurrency, topRisers });
  }
  return out;
}

async function main() {
  const eventDate = todayInIstanbul();
  const candidates = await fetchCandidates();
  const targets = candidates;
  const summaryPayload = await fetchUserHoldingsWithPrices();
  const summaryRows = summaryPayload.rows;
  const portfolioNameByUser = summaryPayload.portfolioNameByUser;
  const summaryByUser = computePortfolioDailySummaryByUser(summaryRows);
  const uniqueUserIds = [...new Set([...targets.map((t) => t.user_id), ...summaryByUser.keys()])];
  const tokensByUser = await fetchTokensByUser(uniqueUserIds);

  const pushMessages = [];
  const summaryLogRows = [];

  for (const t of targets) {
    if (!isFreshForCategory(t)) continue;
    const devices = tokensByUser.get(t.user_id) || [];
    if (!devices.length) continue;

    const pctText = formatPct(t.change_24h_pct);
    const isRise = t.change_24h_pct >= RISE_THRESHOLD;
    const isFall = t.change_24h_pct <= FALL_THRESHOLD;
    if (!isRise && !isFall) continue;
    const rocket = isRise && t.change_24h_pct >= 5 ? ' 🚀' : '';
    const priceText = Number.isFinite(t.current_price) ? formatNumberTr(t.current_price) : '0,00';
    const ccy = currencyLabel(t.currency);
    const accent = isRise ? '🟢' : '🔴';
    const body = isRise
      ? `${accent} ${t.symbol}, ${pctText} artisla ${priceText} ${ccy} oldu.${rocket}`
      : `${accent} ${t.symbol}, ${pctText} dususle ${priceText} ${ccy} oldu.`;
    for (const device of devices) {
      if (!isWithinLocalWindow(device.timezone)) continue;
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
          riseThreshold: RISE_THRESHOLD,
          fallThreshold: FALL_THRESHOLD,
        },
      });
    }
  }

  // 23:00 yerel saat Günsonu Özeti (kullanıcı başına günde 1 kez)
  const summarySentSet = await fetchSummarySentSet(eventDate);
  for (const [userId, summary] of summaryByUser.entries()) {
    if (summarySentSet.has(userId)) continue;
    const devices = tokensByUser.get(userId) || [];
    if (!devices.length) continue;

    const pctText = formatPct(summary.pct);
    const totalText = formatNumberTr(summary.total);
    const ccy = currencyLabel(summary.currency);
    const portfolioName = String(portfolioNameByUser.get(userId)?.name || 'Portfoy');
    const isUp = summary.delta >= 0;
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
          delta: summary.delta,
          pct: summary.pct,
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

  await writeSummaryLogRows(summaryLogRows);
  console.log(
    `Daily alert push done. tokens_sent=${result.sent} summary_users_logged=${summaryLogRows.length} candidates=${targets.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

