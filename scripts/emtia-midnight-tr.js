/**
 * Emtia (category_id = emtia) için döviz sync ile aynı mantık:
 * - TSİ takvim günü değişince o andaki fiyat price_at_midnight olarak sabitlenir
 * - change_24h_pct = (güncel TL − price_at_midnight) / price_at_midnight × 100
 */

function getTurkeyDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

async function loadEmtiaMidnightBySymbol(supabase) {
  const { data, error } = await supabase
    .from('assets')
    .select('symbol, price_at_midnight, price_midnight_date')
    .eq('category_id', 'emtia');
  if (error) throw new Error('Emtia midnight select: ' + error.message);
  const map = new Map();
  for (const row of data || []) {
    const s = (row.symbol || '').toUpperCase();
    if (!s) continue;
    map.set(s, {
      price_at_midnight: row.price_at_midnight,
      price_midnight_date: row.price_midnight_date,
    });
  }
  return map;
}

/**
 * @param {number} priceTl güncel fiyat (TL)
 * @param {string} symbol varlık sembolü
 */
function computeEmtiaChangeWithTrMidnight(priceTl, symbol, existingMap, todayTurkey) {
  const key = (symbol || '').toUpperCase();
  const ex = existingMap.get(key) || {};
  const midnightDate = ex.price_midnight_date;
  const isNewDay = !midnightDate || String(midnightDate) < todayTurkey;

  let priceAtMidnight;
  let priceMidnightDate;
  if (isNewDay) {
    priceAtMidnight = priceTl;
    priceMidnightDate = todayTurkey;
  } else {
    const pm = ex.price_at_midnight != null ? Number(ex.price_at_midnight) : priceTl;
    priceAtMidnight = Number.isFinite(pm) && pm > 0 ? pm : priceTl;
    priceMidnightDate = midnightDate;
  }

  const denom = Number(priceAtMidnight);
  const changePct =
    denom > 0 && Number.isFinite(priceTl) ? ((priceTl - denom) / denom) * 100 : null;

  return {
    change_24h_pct: changePct,
    price_at_midnight: priceAtMidnight,
    price_midnight_date: priceMidnightDate,
  };
}

module.exports = {
  getTurkeyDateStr,
  loadEmtiaMidnightBySymbol,
  computeEmtiaChangeWithTrMidnight,
};
