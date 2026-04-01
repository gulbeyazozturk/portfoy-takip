import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';

export type PortfolioRow = {
  id: string;
  name: string;
  created_at: string;
};

const LEGACY_DEFAULT_NAME = 'Portföyüm';
export const DEFAULT_MAIN_PORTFOLIO_NAME = 'Ana Portföy';

function storageKey(userId: string) {
  return `omnifolio_selected_portfolio_v1:${userId}`;
}

type PortfolioContextValue = {
  portfolioId: string | null;
  portfolios: PortfolioRow[];
  portfoliosLoading: boolean;
  /** Portföy listesini yeniler; yoksa Ana Portföy oluşturur. Seçilen portföy id veya null döner. */
  refresh: () => Promise<string | null>;
  selectPortfolio: (id: string) => Promise<void>;
  addPortfolio: (name: string) => Promise<{ error?: string }>;
  renamePortfolio: (id: string, name: string) => Promise<{ error?: string }>;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [portfolios, setPortfolios] = useState<PortfolioRow[]>([]);
  const [portfoliosLoading, setPortfoliosLoading] = useState(true);
  const { user } = useAuth();
  const portfolioIdRef = useRef<string | null>(null);
  portfolioIdRef.current = portfolioId;

  const resolveSelection = useCallback(
    async (list: PortfolioRow[], previousId: string | null) => {
      if (!user?.id || list.length === 0) {
        return null;
      }
      const ids = new Set(list.map((p) => p.id));
      if (previousId && ids.has(previousId)) {
        return previousId;
      }
      try {
        const raw = await AsyncStorage.getItem(storageKey(user.id));
        if (raw && ids.has(raw)) {
          return raw;
        }
      } catch {
        /* ignore */
      }
      return list[0].id;
    },
    [user?.id],
  );

  const persistSelection = useCallback(
    async (id: string | null) => {
      if (!user?.id || !id) return;
      try {
        await AsyncStorage.setItem(storageKey(user.id), id);
      } catch {
        /* ignore */
      }
    },
    [user?.id],
  );

  const refresh = useCallback(async (): Promise<string | null> => {
    if (!user?.id) {
      setPortfolioId(null);
      setPortfolios([]);
      setPortfoliosLoading(false);
      return null;
    }

    setPortfoliosLoading(true);
    let selected: string | null = null;
    try {
      let { data, error } = await supabase
        .from('portfolios')
        .select('id, name, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        setPortfolioId(null);
        setPortfolios([]);
        return null;
      }

      let rows: PortfolioRow[] = (data ?? []) as PortfolioRow[];

      const legacy = rows.filter((p) => p.name === LEGACY_DEFAULT_NAME);
      if (legacy.length > 0) {
        await Promise.all(
          legacy.map((p) =>
            supabase.from('portfolios').update({ name: DEFAULT_MAIN_PORTFOLIO_NAME }).eq('id', p.id),
          ),
        );
        rows = rows.map((p) =>
          p.name === LEGACY_DEFAULT_NAME ? { ...p, name: DEFAULT_MAIN_PORTFOLIO_NAME } : p,
        );
      }

      if (rows.length === 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('portfolios')
          .insert({
            user_id: user.id,
            name: DEFAULT_MAIN_PORTFOLIO_NAME,
            currency: 'USD',
          })
          .select('id, name, created_at')
          .single();

        if (insertError || !inserted) {
          setPortfolioId(null);
          setPortfolios([]);
          return null;
        }
        rows = [inserted as PortfolioRow];
      }

      setPortfolios(rows);

      const chosen = await resolveSelection(rows, portfolioIdRef.current);
      setPortfolioId(chosen);
      selected = chosen;
      if (chosen) {
        await persistSelection(chosen);
      }
    } finally {
      setPortfoliosLoading(false);
    }
    return selected;
  }, [user?.id, resolveSelection, persistSelection]);

  useEffect(() => {
    void refresh();
  }, [user?.id, refresh]);

  const selectPortfolio = useCallback(
    async (id: string) => {
      setPortfolioId(id);
      await persistSelection(id);
    },
    [persistSelection],
  );

  const addPortfolio = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!user?.id) {
        return { error: 'no_user' };
      }
      if (!trimmed) {
        return { error: 'empty_name' };
      }
      const { error } = await supabase.from('portfolios').insert({
        user_id: user.id,
        name: trimmed,
        currency: 'USD',
      });
      if (error) {
        return { error: error.message ?? 'insert_failed' };
      }
      await refresh();
      return {};
    },
    [user?.id, refresh],
  );

  const renamePortfolio = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!user?.id) {
        return { error: 'no_user' };
      }
      if (!trimmed) {
        return { error: 'empty_name' };
      }
      const { error } = await supabase
        .from('portfolios')
        .update({ name: trimmed })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) {
        return { error: error.message ?? 'update_failed' };
      }
      await refresh();
      return {};
    },
    [user?.id, refresh],
  );

  return (
    <PortfolioContext.Provider
      value={{
        portfolioId,
        portfolios,
        portfoliosLoading,
        refresh,
        selectPortfolio,
        addPortfolio,
        renamePortfolio,
      }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) {
    throw new Error('usePortfolio must be used within PortfolioProvider');
  }
  return ctx;
}
