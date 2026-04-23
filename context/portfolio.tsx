import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/auth';
import {
  DEFAULT_MAIN_PORTFOLIO_NAME,
  LEGACY_DEFAULT_PORTFOLIO_NAME,
} from '@/lib/portfolio-name-loose';
import { portfolioNamesConflict } from '@/lib/portfolio-name-normalize';
import { supabase } from '@/lib/supabase';

function isUniqueOrDuplicateDbError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  return (err.message ?? '').toLowerCase().includes('duplicate');
}

export type PortfolioRow = {
  id: string;
  name: string;
  created_at: string;
};

export { DEFAULT_MAIN_PORTFOLIO_NAME } from '@/lib/portfolio-name-loose';
export { normalizePortfolioNameKey, portfolioNamesConflict } from '@/lib/portfolio-name-normalize';

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
  deletePortfolio: (id: string) => Promise<{ error?: string }>;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [portfolios, setPortfolios] = useState<PortfolioRow[]>([]);
  const [portfoliosLoading, setPortfoliosLoading] = useState(true);
  const { user } = useAuth();
  const portfolioIdRef = useRef<string | null>(null);
  portfolioIdRef.current = portfolioId;
  /** Aynı anda iki refresh boş listeyi görüp çift "Ana Portföy" insert etmesin (Strict Mode vb.) */
  const defaultPortfolioInsertRef = useRef<Promise<void> | null>(null);

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
      let { data: sessionWrap } = await supabase.auth.getSession();
      let session = sessionWrap.session;
      if (!session?.user?.id) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session ?? session;
      }
      if (!session?.user?.id) {
        setPortfolioId(null);
        setPortfolios([]);
        return null;
      }
      const uid = session.user.id;

      let { data, error } = await supabase
        .from('portfolios')
        .select('id, name, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: true });

      if (error) {
        setPortfolioId(null);
        setPortfolios([]);
        return null;
      }

      let rows: PortfolioRow[] = (data ?? []) as PortfolioRow[];

      const legacy = rows.filter((p) => p.name === LEGACY_DEFAULT_PORTFOLIO_NAME);
      if (legacy.length > 0) {
        await Promise.all(
          legacy.map((p) =>
            supabase.from('portfolios').update({ name: DEFAULT_MAIN_PORTFOLIO_NAME }).eq('id', p.id),
          ),
        );
        rows = rows.map((p) =>
          p.name === LEGACY_DEFAULT_PORTFOLIO_NAME ? { ...p, name: DEFAULT_MAIN_PORTFOLIO_NAME } : p,
        );
      }

      if (rows.length === 0) {
        if (defaultPortfolioInsertRef.current) {
          await defaultPortfolioInsertRef.current;
        } else {
          const work = (async () => {
            try {
              const insertRow = () =>
                supabase
                  .from('portfolios')
                  .insert({
                    user_id: uid,
                    name: DEFAULT_MAIN_PORTFOLIO_NAME,
                    currency: 'USD',
                  })
                  .select('id, name, created_at')
                  .single();

              let { data: inserted, error: insertError } = await insertRow();
              if (insertError || !inserted) {
                await supabase.auth.refreshSession();
                ({ data: inserted, error: insertError } = await insertRow());
              }

              if (insertError || !inserted) {
                if (isUniqueOrDuplicateDbError(insertError)) {
                  if (__DEV__) {
                    console.warn(
                      '[portfolio] default portfolio insert duplicate/violation; refetch will load existing:',
                      insertError?.message ?? insertError,
                    );
                  }
                } else if (__DEV__) {
                  console.warn(
                    '[portfolio] default portfolio insert failed:',
                    insertError?.message ?? insertError,
                  );
                }
              }
            } finally {
              defaultPortfolioInsertRef.current = null;
            }
          })();
          defaultPortfolioInsertRef.current = work;
          await work;
        }

        const { data: again, error: againErr } = await supabase
          .from('portfolios')
          .select('id, name, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: true });

        if (againErr) {
          setPortfolioId(null);
          setPortfolios([]);
          return null;
        }

        rows = (again ?? []) as PortfolioRow[];
        const legacyAfter = rows.filter((p) => p.name === LEGACY_DEFAULT_PORTFOLIO_NAME);
        if (legacyAfter.length > 0) {
          await Promise.all(
            legacyAfter.map((p) =>
              supabase.from('portfolios').update({ name: DEFAULT_MAIN_PORTFOLIO_NAME }).eq('id', p.id),
            ),
          );
          rows = rows.map((p) =>
            p.name === LEGACY_DEFAULT_PORTFOLIO_NAME ? { ...p, name: DEFAULT_MAIN_PORTFOLIO_NAME } : p,
          );
        }

        if (rows.length === 0) {
          if (__DEV__) {
            console.warn('[portfolio] no portfolios after default insert + refetch');
          }
          setPortfolioId(null);
          setPortfolios([]);
          return null;
        }
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
      let { data: sessionWrap } = await supabase.auth.getSession();
      let session = sessionWrap.session;
      if (!session?.user?.id) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session ?? session;
      }
      const uid = session?.user?.id;
      if (!uid) {
        return { error: 'no_user' };
      }
      const { data: existing, error: selError } = await supabase
        .from('portfolios')
        .select('id, name')
        .eq('user_id', uid);
      if (selError) {
        return { error: selError.message ?? 'fetch_failed' };
      }
      for (const row of (existing ?? []) as { id: string; name: string }[]) {
        if (portfolioNamesConflict(trimmed, row.name)) {
          return { error: 'duplicate_name' };
        }
      }
      const { error } = await supabase.from('portfolios').insert({
        user_id: uid,
        name: trimmed,
        currency: 'USD',
      });
      if (error) {
        if (isUniqueOrDuplicateDbError(error)) {
          return { error: 'duplicate_name' };
        }
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
      let { data: sessionWrap } = await supabase.auth.getSession();
      let session = sessionWrap.session;
      if (!session?.user?.id) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session ?? session;
      }
      const uid = session?.user?.id;
      if (!uid) {
        return { error: 'no_user' };
      }
      const { data: existing, error: selError } = await supabase
        .from('portfolios')
        .select('id, name')
        .eq('user_id', uid);
      if (selError) {
        return { error: selError.message ?? 'fetch_failed' };
      }
      for (const row of (existing ?? []) as { id: string; name: string }[]) {
        if (row.id !== id && portfolioNamesConflict(trimmed, row.name)) {
          return { error: 'duplicate_name' };
        }
      }
      const { error } = await supabase
        .from('portfolios')
        .update({ name: trimmed })
        .eq('id', id)
        .eq('user_id', uid);
      if (error) {
        if (isUniqueOrDuplicateDbError(error)) {
          return { error: 'duplicate_name' };
        }
        return { error: error.message ?? 'update_failed' };
      }
      await refresh();
      return {};
    },
    [user?.id, refresh],
  );

  const deletePortfolio = useCallback(
    async (id: string) => {
      if (!user?.id) {
        return { error: 'no_user' };
      }
      let { data: sessionWrap } = await supabase.auth.getSession();
      let session = sessionWrap.session;
      if (!session?.user?.id) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session ?? session;
      }
      const uid = session?.user?.id;
      if (!uid) {
        return { error: 'no_user' };
      }

      const { error } = await supabase.from('portfolios').delete().eq('id', id).eq('user_id', uid);
      if (error) {
        return { error: error.message ?? 'delete_failed' };
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
        deletePortfolio,
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
