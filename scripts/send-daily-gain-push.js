#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const THRESHOLD = Number(process.env.DAILY_GAIN_PUSH_THRESHOLD || '3');
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!Number.isFinite(THRESHOLD)) {
  console.error('DAILY_GAIN_PUSH_THRESHOLD must be a number');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
    .select('id, symbol, name, change_24h_pct')
    .gte('change_24h_pct', THRESHOLD)
    .limit(10000);
  if (assetsError) throw new Error(`assets query failed: ${assetsError.message}`);
  if (!assets?.length) return [];

  const assetMap = new Map();
  for (const a of assets) {
    const id = a.id;
    const change = Number(a.change_24h_pct);
    if (!id || !Number.isFinite(change) || change < THRESHOLD) continue;
    assetMap.set(id, {
      asset_id: id,
      symbol: a.symbol || 'Varlik',
      name: a.name || a.symbol || 'Varlik',
      change_24h_pct: change,
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

async function fetchAlreadySentSet(alertDate) {
  const { data, error } = await supabase
    .from('daily_gain_push_log')
    .select('user_id, asset_id')
    .eq('alert_date', alertDate)
    .eq('threshold', THRESHOLD)
    .limit(100000);

  if (error) throw new Error(`daily_gain_push_log query failed: ${error.message}`);
  return new Set((data || []).map((r) => `${r.user_id}:${r.asset_id}`));
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
  const map = new Map();
  for (const row of data || []) {
    const userId = row.user_id;
    const token = String(row.expo_push_token || '').trim();
    if (!token.startsWith('ExponentPushToken[')) continue;
    if (!map.has(userId)) map.set(userId, []);
    map.get(userId).push(token);
  }
  return map;
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

async function writeLogRows(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('daily_gain_push_log').upsert(rows, {
    onConflict: 'user_id,asset_id,alert_date,threshold',
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`daily_gain_push_log insert failed: ${error.message}`);
}

async function main() {
  const alertDate = todayInIstanbul();
  const candidates = await fetchCandidates();
  if (!candidates.length) {
    console.log('No holdings matched threshold.');
    return;
  }

  const sentSet = await fetchAlreadySentSet(alertDate);
  const targets = candidates.filter((c) => !sentSet.has(`${c.user_id}:${c.asset_id}`));
  if (!targets.length) {
    console.log('All eligible notifications already sent today.');
    return;
  }

  const uniqueUserIds = [...new Set(targets.map((t) => t.user_id))];
  const tokensByUser = await fetchTokensByUser(uniqueUserIds);

  const pushMessages = [];
  const logRows = [];

  for (const t of targets) {
    const tokens = tokensByUser.get(t.user_id) || [];
    if (!tokens.length) continue;

    const pctText = t.change_24h_pct.toFixed(2).replace('.', ',');
    for (const to of tokens) {
      pushMessages.push({
        to,
        sound: 'default',
        title: 'Gunluk Fiyat Alarmi',
        body: `${t.symbol} bugun %${pctText} yukseliste.`,
        data: {
          type: 'daily_gain_alert',
          assetId: t.asset_id,
          symbol: t.symbol,
          changePct: t.change_24h_pct,
          threshold: THRESHOLD,
        },
      });
    }

    logRows.push({
      user_id: t.user_id,
      asset_id: t.asset_id,
      alert_date: alertDate,
      threshold: THRESHOLD,
      change_24h_pct: t.change_24h_pct,
      sent_at: new Date().toISOString(),
    });
  }

  if (!pushMessages.length) {
    console.log('No valid push token found for targets.');
    return;
  }

  const result = await sendExpo(pushMessages);
  if (result.failed.length) {
    console.warn('Some Expo push batches failed:', result.failed);
  }

  await writeLogRows(logRows);
  console.log(`Daily gain push done. tokens_sent=${result.sent} users_assets_logged=${logRows.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

