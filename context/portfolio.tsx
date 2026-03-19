import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';

type PortfolioContextValue = {
  portfolioId: string | null;
  refresh: () => Promise<void>;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const { user } = useAuth();

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setPortfolioId(null);
      return;
    }

    const { data, error } = await supabase
      .from('portfolios')
      .select('id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) {
      setPortfolioId(null);
      return;
    }

    if ((data ?? []).length > 0) {
      const portfolios = data ?? [];
      const ids = portfolios.map((p) => p.id);
      const { data: holdings, error: hErr } = await supabase
        .from('holdings')
        .select('portfolio_id')
        .in('portfolio_id', ids);
      if (hErr) {
        // Fallback: en eski portföy
        setPortfolioId(portfolios[0].id);
        return;
      }
      const counts: Record<string, number> = {};
      for (const h of holdings ?? []) {
        const pid = (h as any).portfolio_id as string;
        counts[pid] = (counts[pid] ?? 0) + 1;
      }
      const best = portfolios
        .map((p) => ({ id: p.id, score: counts[p.id] ?? 0 }))
        .sort((a, b) => b.score - a.score)[0];
      setPortfolioId(best.id);
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('portfolios')
      .insert({
        user_id: user.id,
        name: 'Portföyüm',
        currency: 'USD',
      })
      .select('id')
      .single();

    if (insertError) {
      setPortfolioId(null);
      return;
    }
    setPortfolioId(inserted?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <PortfolioContext.Provider value={{ portfolioId, refresh }}>
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
