import AsyncStorage from '@react-native-async-storage/async-storage';

export const PORTFOLIO_SUMMARY_KEY_PREFIX = 'omnifolio_portfolio_summary_v1:';

const storageKey = (portfolioId: string) => `${PORTFOLIO_SUMMARY_KEY_PREFIX}${portfolioId}`;

export type StoredPortfolioSummary = {
  portfolioId: string;
  savedAt: string;
  data: unknown;
};

export async function readPortfolioSummaryCache(
  portfolioId: string | null,
): Promise<StoredPortfolioSummary | null> {
  if (!portfolioId) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(portfolioId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPortfolioSummary;
    if (!parsed?.data || parsed.portfolioId !== portfolioId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function persistPortfolioSummaryCache(
  portfolioId: string | null,
  data: unknown,
): Promise<void> {
  if (!portfolioId || data == null) return;
  try {
    const row: StoredPortfolioSummary = {
      portfolioId,
      savedAt: new Date().toISOString(),
      data,
    };
    await AsyncStorage.setItem(storageKey(portfolioId), JSON.stringify(row));
  } catch {
    /* ignore */
  }
}
