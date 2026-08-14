#!/usr/bin/env node
/**
 * Aynı cron turunda çoklu eşik / yinelenen token → tek bildirim.
 * Çalıştırma: node scripts/verify-push-alert-dedupe.js
 */

const {
  gainDedupeKey,
  listCrossedAlertTiers,
  pickStrongestUnsentTier,
  uniqueDeviceTokens,
  selectLatestDevicesPerPlatform,
  dedupePushMessages,
} = require('./lib/daily-gain-push-alerts');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const RISE = [4, 7, 10, 15];
const FALL = [-4, -7, -10, -15];

const crossed8 = listCrossedAlertTiers(8, RISE, FALL);
assert(crossed8.length === 2 && crossed8[0].tier === 4 && crossed8[1].tier === 7, '8% crosses 4 and 7');

const emptySent = new Set();
const jump = pickStrongestUnsentTier(crossed8, emptySent, 'u1', 'a1');
assert(jump.notify?.tier === 7, 'same tick: notify strongest (7), not both 4 and 7');
assert(jump.claim.length === 2, 'claim both newly crossed tiers');

const after4 = new Set([gainDedupeKey('u1', 'a1', 4)]);
const later = pickStrongestUnsentTier(crossed8, after4, 'u1', 'a1');
assert(later.notify?.tier === 7, 'ladder: after 4% already sent, next is 7%');
assert(later.claim.length === 1 && later.claim[0].tier === 7, 'do not re-claim 4');

const none = pickStrongestUnsentTier(
  crossed8,
  new Set([gainDedupeKey('u1', 'a1', 4), gainDedupeKey('u1', 'a1', 7)]),
  'u1',
  'a1',
);
assert(none.notify == null && none.claim.length === 0, 'already notified: skip');

const fall = listCrossedAlertTiers(-9, RISE, FALL);
const fallPick = pickStrongestUnsentTier(fall, new Set(), 'u1', 'a1');
assert(fallPick.notify?.tier === -7, 'same tick fall: strongest -7, not also -4');

const devices = uniqueDeviceTokens([
  { token: 'ExponentPushToken[aaa]', timezone: 'Europe/Istanbul' },
  { token: 'ExponentPushToken[aaa]', timezone: 'Europe/Istanbul' },
  { token: 'ExponentPushToken[bbb]', timezone: 'Europe/Istanbul' },
  { token: '  ', timezone: 'Europe/Istanbul' },
]);
assert(devices.length === 2, 'duplicate expo tokens collapsed');
assert(devices[0].token === 'ExponentPushToken[aaa]', 'first unique token kept');

const latest = selectLatestDevicesPerPlatform([
  {
    token: 'ExponentPushToken[old]',
    platform: 'android',
    last_seen_at: '2026-08-01T00:00:00.000Z',
    timezone: 'Europe/Istanbul',
  },
  {
    token: 'ExponentPushToken[new]',
    platform: 'android',
    last_seen_at: '2026-08-14T00:00:00.000Z',
    timezone: 'Europe/Istanbul',
  },
  {
    token: 'ExponentPushToken[iphone]',
    platform: 'ios',
    last_seen_at: '2026-08-10T00:00:00.000Z',
    timezone: 'Europe/Istanbul',
  },
]);
assert(latest.length === 2, 'one token per platform');
assert(
  latest.some((d) => d.token === 'ExponentPushToken[new]') &&
    !latest.some((d) => d.token === 'ExponentPushToken[old]'),
  'stale android token dropped',
);
assert(
  latest.some((d) => d.token === 'ExponentPushToken[iphone]'),
  'ios kept alongside android',
);

const msgs = dedupePushMessages([
  { to: 'ExponentPushToken[a]', title: 'T', body: 'same' },
  { to: 'ExponentPushToken[a]', title: 'T', body: 'same' },
  { to: 'ExponentPushToken[b]', title: 'T', body: 'same' },
]);
assert(msgs.length === 2, 'identical payload to same token sent once');

console.log('verify-push-alert-dedupe: ok');
