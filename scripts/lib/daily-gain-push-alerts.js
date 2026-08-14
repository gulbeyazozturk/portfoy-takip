/**
 * Günlük fiyat uyarı eşikleri: aynı varlık + kullanıcı için kademeler.
 * Aynı cron turunda birden fazla eşik (ör. %4 ve %7) ayrı push üretir;
 * bu dosya “bu turda tek, en güçlü eşik” seçimini ortaklaştırır.
 */

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

/**
 * Henüz gönderilmemiş eşikler içinde mutlak değeri en yüksek olanı bildir;
 * diğer yeni eşikler de claim edilir (aynı anda ikinci push gitmesin).
 */
function pickStrongestUnsentTier(crossedTiers, sentKeys, userId, assetId) {
  const unsent = [];
  for (const step of crossedTiers || []) {
    const key = gainDedupeKey(String(userId), String(assetId), step.tier);
    if (!sentKeys.has(key)) unsent.push(step);
  }
  if (!unsent.length) return { notify: null, claim: [] };
  const notify = unsent.reduce((best, cur) =>
    Math.abs(Number(cur.tier)) > Math.abs(Number(best.tier)) ? cur : best,
  );
  return { notify, claim: unsent };
}

function uniqueDeviceTokens(devices) {
  const seen = new Set();
  const out = [];
  for (const d of devices || []) {
    const token = String(d?.token || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push({ ...d, token });
  }
  return out;
}

function lastSeenMs(device) {
  const t = Date.parse(device?.last_seen_at || '');
  return Number.isFinite(t) ? t : 0;
}

/**
 * Aynı telefonda eski + yeni / Play Store + preview token'ı birebir aynı mesajı iki kez basar.
 * Kullanıcı + platform başına yalnızca en son görülen token kalır (iOS ve Android ayrı cihaz sayılır).
 */
function selectLatestDevicesPerPlatform(devices) {
  const unique = uniqueDeviceTokens(devices);
  const best = new Map();
  for (const d of unique) {
    const platform = String(d.platform || 'unknown').trim() || 'unknown';
    const prev = best.get(platform);
    if (!prev) {
      best.set(platform, d);
      continue;
    }
    const seen = lastSeenMs(d);
    const prevSeen = lastSeenMs(prev);
    if (seen > prevSeen || (seen === prevSeen && d.token > prev.token)) {
      best.set(platform, d);
    }
  }
  return Array.from(best.values());
}

function dedupePushMessages(messages) {
  const seen = new Set();
  const out = [];
  for (const m of messages || []) {
    const key = `${String(m?.to || '')}\n${String(m?.title || '')}\n${String(m?.body || '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

module.exports = {
  gainDedupeKey,
  listCrossedAlertTiers,
  pickStrongestUnsentTier,
  uniqueDeviceTokens,
  selectLatestDevicesPerPlatform,
  dedupePushMessages,
};
