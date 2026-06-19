import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  persistAssetLastPriceCache,
  readAssetLastPriceCache,
} from '@/lib/asset-last-price-cache';
import { PORTFOLIO_SUMMARY_KEY_PREFIX } from '@/lib/portfolio-summary-cache';
import { supabase } from '@/lib/supabase';

/** Kullanıcının aktif portföylerindeki tüm holding varlık id'leri. */
export async function fetchActivePortfolioAssetIds(portfolioIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (portfolioIds.length === 0) return out;

  const chunkSize = 40;
  for (let i = 0; i < portfolioIds.length; i += chunkSize) {
    const chunk = portfolioIds.slice(i, i + chunkSize);
    const { data, error } = await supabase.from('holdings').select('asset_id').in('portfolio_id', chunk);
    if (error) continue;
    for (const row of data ?? []) {
      const id = row.asset_id != null ? String(row.asset_id) : '';
      if (id) out.add(id);
    }
  }
  return out;
}

export async function pruneAssetLastPriceCache(allowedAssetIds: Set<string>): Promise<void> {
  const existing = await readAssetLastPriceCache();
  let changed = false;
  for (const id of Object.keys(existing)) {
    if (!allowedAssetIds.has(id)) {
      delete existing[id];
      changed = true;
    }
  }
  if (changed) {
    await persistAssetLastPriceCache(existing);
  }
}

export async function prunePortfolioSummaryCaches(activePortfolioIds: Set<string>): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter((key) => {
      if (!key.startsWith(PORTFOLIO_SUMMARY_KEY_PREFIX)) return false;
      const pid = key.slice(PORTFOLIO_SUMMARY_KEY_PREFIX.length);
      return !activePortfolioIds.has(pid);
    });
    if (stale.length > 0) {
      await AsyncStorage.multiRemove(stale);
    }
  } catch {
    /* ignore */
  }
}

/** Aktif portföyler dışındaki yerel fiyat + özet önbelleğini temizler. */
export async function pruneLocalPortfolioCaches(portfolioIds: string[]): Promise<void> {
  if (portfolioIds.length === 0) return;

  const activePortfolioIds = new Set(portfolioIds);
  const allowedAssetIds = await fetchActivePortfolioAssetIds(portfolioIds);
  await Promise.all([
    pruneAssetLastPriceCache(allowedAssetIds),
    prunePortfolioSummaryCaches(activePortfolioIds),
  ]);
}
