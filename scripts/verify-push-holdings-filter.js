#!/usr/bin/env node
/**
 * Push adayı mantığı — satılmış pozisyon (quantity<=0) dahil edilmemeli.
 * Çalıştırma: node scripts/verify-push-holdings-filter.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const MIN_HOLDING_QTY = 1e-8;

function isActiveHolding(qty) {
  const q = Number(qty);
  return Number.isFinite(q) && q > MIN_HOLDING_QTY;
}

function wouldNotify(userId, holdingRows, assetId) {
  return holdingRows.some(
    (h) => h.user_id === userId && h.asset_id === assetId && isActiveHolding(h.quantity),
  );
}

const user = 'u1';
const assetBesler = 'a-besler';

assert(!wouldNotify(user, [], assetBesler), 'deleted holding must not notify');

assert(
  !wouldNotify(user, [{ user_id: user, asset_id: assetBesler, quantity: 0 }], assetBesler),
  'zero qty must not notify',
);

assert(
  wouldNotify(user, [{ user_id: user, asset_id: assetBesler, quantity: 100 }], assetBesler),
  'active holding should notify',
);

assert(
  !wouldNotify(user, [{ user_id: user, asset_id: assetBesler, quantity: 1e-12 }], assetBesler),
  'dust qty must not notify',
);

console.log('verify-push-holdings-filter: ok');
