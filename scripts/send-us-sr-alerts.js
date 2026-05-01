#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const NEAR_PCT = Number(process.env.US_SR_NEAR_PCT || '3');
const MIN_BAND_WIDTH_PCT = Number(process.env.US_SR_MIN_BAND_WIDTH_PCT || '2');
const PIVOT_WINDOW = Number(process.env.US_SR_PIVOT_WINDOW || '2');
const LEVEL_CLUSTER_PCT = Number(process.env.US_SR_LEVEL_CLUSTER_PCT || '1');
const MIN_TOUCHES = Number(process.env.US_SR_MIN_TOUCHES || '2');
const TR_PREP_HOUR = Number(process.env.US_SR_TR_PREP_HOUR || '9');
const TR_NOTIFY_START_HOUR = Number(process.env.US_SR_TR_NOTIFY_START_HOUR || '9');
const TR_NOTIFY_END_HOUR_EXCLUSIVE = Number(process.env.US_SR_TR_NOTIFY_END_HOUR_EXCLUSIVE || '24');
const LOOKBACK_DAYS = Number(process.env.US_SR_LOOKBACK_DAYS || '120');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function trNowParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (k) => parts.find((p) => p.type === k)?.value || '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour') || '0'),
  };
}

function nyDateFromIso(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function formatPrice(v) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function isMissingPushEventLogError(error) {
  const msg = String(error?.message || '');
  return error?.code === 'PGRST205' || msg.includes("Could not find the table 'public.push_event_log'");
}

async function fetchHeldUsAssets() {
  const { data: portfolios, error: pErr } = await supabase
    .from('portfolios')
    .select('id, user_id')
    .not('user_id', 'is', null)
    .limit(100000);
  if (pErr) throw new Error(`portfolios query failed: ${pErr.message}`);
  const portfolioUserMap = new Map((portfolios || []).map((p) => [p.id, p.user_id]));
  const portfolioIds = [...portfolioUserMap.keys()];
  if (!portfolioIds.length) return [];

  const rows = [];
  for (const pidChunk of chunk(portfolioIds, 200)) {
    const { data: holdings, error } = await supabase
      .from('holdings')
      .select('portfolio_id, asset:assets(id, category_id, symbol, currency, current_price)')
      .in('portfolio_id', pidChunk)
      .limit(100000);
    if (error) throw new Error(`holdings query failed: ${error.message}`);
    for (const h of holdings || []) {
      const a = h.asset;
      if (!a || a.category_id !== 'yurtdisi') continue;
      const userId = portfolioUserMap.get(h.portfolio_id);
      const current = Number(a.current_price);
      if (!userId || !a.id || !Number.isFinite(current) || current <= 0) continue;
      rows.push({
        user_id: userId,
        asset_id: a.id,
        symbol: String(a.symbol || '').toUpperCase() || 'ASSET',
        currency: String(a.currency || 'USD').toUpperCase(),
        current_price: current,
      });
    }
  }
  const uniq = new Map();
  for (const r of rows) uniq.set(`${r.user_id}:${r.asset_id}`, r);
  return [...uniq.values()];
}

async function fetchTodayLevels(assetIds, levelDate) {
  if (!assetIds.length) return new Map();
  const { data, error } = await supabase
    .from('us_sr_levels')
    .select('asset_id, support_price, resistance_price')
    .eq('level_date', levelDate)
    .in('asset_id', assetIds)
    .limit(100000);
  if (error) throw new Error(`us_sr_levels query failed: ${error.message}`);
  return new Map((data || []).map((r) => [r.asset_id, r]));
}

async function fetchHistoryRows(assetIds, sinceIso) {
  const out = [];
  for (const assetId of assetIds) {
    let from = 0;
    const seenDays = new Set();
    for (;;) {
      const { data, error } = await supabase
        .from('price_history')
        .select('asset_id, price, recorded_at')
        .eq('asset_id', assetId)
        .gte('recorded_at', sinceIso)
        .order('recorded_at', { ascending: false })
        .range(from, from + 999);
      if (error) throw new Error(`price_history query failed: ${error.message}`);
      if (!data?.length) break;

      for (const row of data) {
        const day = nyDateFromIso(row.recorded_at);
        if (seenDays.has(day)) continue;
        seenDays.add(day);
        out.push(row);
      }

      // Her asset icin sadece gereken gun sayisini alarak sorgu maliyetini kisitla.
      if (seenDays.size >= LOOKBACK_DAYS) break;
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  return out;
}

function computeDailyCloses(rows) {
  const map = new Map();
  for (const r of rows) {
    const p = Number(r.price);
    if (!Number.isFinite(p) || p <= 0) continue;
    const day = nyDateFromIso(r.recorded_at);
    map.set(`${r.asset_id}:${day}`, {
      asset_id: r.asset_id,
      day,
      price: p,
      recorded_at: r.recorded_at,
    });
  }
  const byAsset = new Map();
  for (const v of map.values()) {
    if (!byAsset.has(v.asset_id)) byAsset.set(v.asset_id, []);
    byAsset.get(v.asset_id).push(v);
  }
  for (const [assetId, series] of byAsset.entries()) {
    series.sort((a, b) => String(a.day).localeCompare(String(b.day)));
    byAsset.set(
      assetId,
      series.map((x) => x.price),
    );
  }
  return byAsset;
}

function extractPivotCandidates(prices, windowSize) {
  const out = [];
  if (!Array.isArray(prices) || prices.length < windowSize * 2 + 1) return out;
  for (let i = windowSize; i < prices.length - windowSize; i += 1) {
    const p = prices[i];
    if (!Number.isFinite(p) || p <= 0) continue;
    const left = prices.slice(i - windowSize, i);
    const right = prices.slice(i + 1, i + 1 + windowSize);
    const isPivotHigh = left.every((x) => p >= x) && right.every((x) => p >= x);
    const isPivotLow = left.every((x) => p <= x) && right.every((x) => p <= x);
    if (isPivotHigh || isPivotLow) out.push(p);
  }
  return out;
}

function clusterLevels(levels, clusterPct) {
  if (!levels.length) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const clusters = [];
  for (const level of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push({ center: level, touches: 1 });
      continue;
    }
    const base = Math.max(Math.abs(last.center), 1e-9);
    const diffPct = (Math.abs(level - last.center) / base) * 100;
    if (diffPct <= clusterPct) {
      const nextTouches = last.touches + 1;
      last.center = (last.center * last.touches + level) / nextTouches;
      last.touches = nextTouches;
    } else {
      clusters.push({ center: level, touches: 1 });
    }
  }
  return clusters;
}

function computeLevels(currentPrice, dailyCloses) {
  if (!dailyCloses?.length) return { support: null, resistance: null };

  const pivots = extractPivotCandidates(dailyCloses, Math.max(1, PIVOT_WINDOW));
  const clustered = clusterLevels(pivots, Math.max(0.1, LEVEL_CLUSTER_PCT));
  const qualified = clustered.filter((x) => x.touches >= Math.max(1, MIN_TOUCHES));

  const supports = qualified
    .filter((x) => x.center < currentPrice)
    .sort((a, b) => b.center - a.center);
  const resistances = qualified
    .filter((x) => x.center > currentPrice)
    .sort((a, b) => a.center - b.center);

  let support = supports[0]?.center ?? null;
  let resistance = resistances[0]?.center ?? null;

  // Pivot seviyesi cikmazsa guvenli fallback: en yakin kapanis seviyeleri.
  if (!Number.isFinite(support) || !Number.isFinite(resistance)) {
    const sorted = [...dailyCloses].sort((a, b) => a - b);
    if (!Number.isFinite(support)) {
      const fallbackSupports = sorted.filter((x) => x < currentPrice);
      support = fallbackSupports.length ? fallbackSupports[fallbackSupports.length - 1] : sorted[0];
    }
    if (!Number.isFinite(resistance)) {
      const fallbackResistances = sorted.filter((x) => x > currentPrice);
      resistance = fallbackResistances.length ? fallbackResistances[0] : sorted[sorted.length - 1];
    }
  }

  return { support, resistance };
}

function pickNearestSide(cur, support, resistance, nearRatio) {
  let supportDist = Number.POSITIVE_INFINITY;
  let resistanceDist = Number.POSITIVE_INFINITY;
  if (Number.isFinite(support) && support > 0 && cur > support) {
    supportDist = (cur - support) / support;
  }
  if (Number.isFinite(resistance) && resistance > 0 && cur < resistance) {
    resistanceDist = (resistance - cur) / resistance;
  }
  const nearestIsSupport = supportDist <= resistanceDist;
  const nearestDist = nearestIsSupport ? supportDist : resistanceDist;
  if (!Number.isFinite(nearestDist) || nearestDist > nearRatio) return null;
  return nearestIsSupport ? 'support' : 'resistance';
}

async function upsertLevels(levelDate, heldAssets) {
  const assetMap = new Map();
  for (const a of heldAssets) assetMap.set(a.asset_id, a.current_price);
  const assetIds = [...assetMap.keys()];
  if (!assetIds.length) return new Map();

  const existing = await fetchTodayLevels(assetIds, levelDate);
  const missing = assetIds.filter((id) => !existing.has(id));
  if (!missing.length) return existing;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const rows = await fetchHistoryRows(missing, since);
  const byAsset = computeDailyCloses(rows);

  const upserts = [];
  for (const aid of missing) {
    const current = assetMap.get(aid) || 0;
    const levels = computeLevels(current, byAsset.get(aid) || []);
    upserts.push({
      asset_id: aid,
      level_date: levelDate,
      support_price: levels.support,
      resistance_price: levels.resistance,
      calculated_at: new Date().toISOString(),
    });
  }

  if (upserts.length) {
    const { error } = await supabase.from('us_sr_levels').upsert(upserts, {
      onConflict: 'asset_id,level_date',
      ignoreDuplicates: false,
    });
    if (error) throw new Error(`us_sr_levels upsert failed: ${error.message}`);
  }

  return await fetchTodayLevels(assetIds, levelDate);
}

async function fetchTokensByUser(userIds) {
  if (!userIds.length) return new Map();
  const { data, error } = await supabase
    .from('user_push_tokens')
    .select('user_id, expo_push_token')
    .eq('enabled', true)
    .in('user_id', userIds)
    .limit(100000);
  if (error) throw new Error(`user_push_tokens query failed: ${error.message}`);
  const out = new Map();
  for (const r of data || []) {
    const token = String(r.expo_push_token || '').trim();
    if (!token.startsWith('ExponentPushToken[')) continue;
    if (!out.has(r.user_id)) out.set(r.user_id, []);
    out.get(r.user_id).push(token);
  }
  return out;
}

async function fetchAlreadySentSet(eventDate) {
  const { data, error } = await supabase
    .from('push_event_log')
    .select('user_id, event_ref')
    .eq('event_type', 'us_sr_alert')
    .eq('event_date', eventDate)
    .limit(100000);
  if (error) {
    if (isMissingPushEventLogError(error)) {
      console.warn('push_event_log table not found, dedupe log is skipped.');
      return new Set();
    }
    throw new Error(`push_event_log query failed: ${error.message}`);
  }
  return new Set((data || []).map((r) => `${r.user_id}:${r.event_ref}`));
}

async function sendExpo(messages) {
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
      throw new Error(`Expo push error: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    }
    const rows = Array.isArray(body?.data) ? body.data : [];
    sent += rows.length;
  }
  return sent;
}

async function insertPushLogs(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('push_event_log').upsert(rows, {
    onConflict: 'user_id,event_type,event_date,event_ref',
    ignoreDuplicates: true,
  });
  if (error) {
    if (isMissingPushEventLogError(error)) {
      console.warn('push_event_log table not found, event log write is skipped.');
      return;
    }
    throw new Error(`push_event_log upsert failed: ${error.message}`);
  }
}

async function main() {
  const nowTr = trNowParts();
  if (nowTr.hour < TR_NOTIFY_START_HOUR || nowTr.hour >= TR_NOTIFY_END_HOUR_EXCLUSIVE) {
    console.log(
      `Outside TR notify window (${TR_NOTIFY_START_HOUR}-${TR_NOTIFY_END_HOUR_EXCLUSIVE}). No-op.`,
    );
    return;
  }
  if (nowTr.hour < TR_PREP_HOUR) {
    console.log(`Before TR level prep hour (${TR_PREP_HOUR}). No-op.`);
    return;
  }

  const held = await fetchHeldUsAssets();
  if (!held.length) {
    console.log('No held US assets.');
    return;
  }

  const levelsByAsset = await upsertLevels(nowTr.date, held);
  const tokensByUser = await fetchTokensByUser([...new Set(held.map((h) => h.user_id))]);
  const sentSet = await fetchAlreadySentSet(nowTr.date);

  const nearRatio = NEAR_PCT / 100;
  const messages = [];
  const logs = [];

  for (const h of held) {
    const lv = levelsByAsset.get(h.asset_id);
    if (!lv) continue;
    const support = Number(lv.support_price);
    const resistance = Number(lv.resistance_price);
    const cur = h.current_price;
    const userTokens = tokensByUser.get(h.user_id) || [];
    if (!userTokens.length) continue;
    if (Number.isFinite(support) && support > 0 && Number.isFinite(resistance) && resistance > 0) {
      const bandWidthPct = ((resistance - support) / cur) * 100;
      if (bandWidthPct > 0 && bandWidthPct < MIN_BAND_WIDTH_PCT) {
        // Seviyeler birbirine asiri yakin ise noise olusur; alarmlari atla.
        continue;
      }
    }

    const nearestSide = pickNearestSide(cur, support, resistance, nearRatio);
    if (!nearestSide) continue;

    if (nearestSide === 'resistance') {
      const eventRef = `${h.asset_id}:resistance:${nowTr.date}`;
      if (!sentSet.has(`${h.user_id}:${eventRef}`)) {
        for (const t of userTokens) {
          messages.push({
            to: t,
            sound: 'default',
            title: 'Grafik Uyarısı',
            body: `${h.symbol} da bir sonraki direnc seviyesi olan ${formatPrice(resistance)} ${h.currency} a %${NEAR_PCT} uzaklikta.`,
            data: {
              type: 'us_sr_resistance',
              symbol: h.symbol,
              resistance,
              current: cur,
            },
          });
        }
        logs.push({
          user_id: h.user_id,
          event_type: 'us_sr_alert',
          event_date: nowTr.date,
          event_ref: eventRef,
          created_at: new Date().toISOString(),
        });
      }
      continue;
    }

    const eventRef = `${h.asset_id}:support:${nowTr.date}`;
    if (!sentSet.has(`${h.user_id}:${eventRef}`)) {
      for (const t of userTokens) {
        messages.push({
          to: t,
          sound: 'default',
          title: 'Grafik Uyarısı',
          body: `${h.symbol} da bir sonraki destek seviyesi olan ${formatPrice(support)} ${h.currency} a %${NEAR_PCT} uzaklikta.`,
          data: {
            type: 'us_sr_support',
            symbol: h.symbol,
            support,
            current: cur,
          },
        });
      }
      logs.push({
        user_id: h.user_id,
        event_type: 'us_sr_alert',
        event_date: nowTr.date,
        event_ref: eventRef,
        created_at: new Date().toISOString(),
      });
    }
  }

  if (!messages.length) {
    console.log('No US support/resistance alert candidates.');
    return;
  }

  const sent = await sendExpo(messages);
  await insertPushLogs(logs);
  console.log(`US SR alerts sent=${sent} unique_events=${logs.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

