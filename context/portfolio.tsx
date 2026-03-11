import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

type PortfolioContextValue = {
  portfolioId: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFirstPortfolio = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('portfolios')
      .select('id')
      .limit(1)
      .order('created_at', { ascending: true })
      .maybeSingle();
    setIsLoading(false);
    if (e) {
      setError(e.message);
      setPortfolioId(null);
      return;
    }
    setPortfolioId(data?.id ?? null);
  }, []);

  useEffect(() => {
    fetchFirstPortfolio();
  }, [fetchFirstPortfolio]);

  return (
    <PortfolioContext.Provider value={{ portfolioId, isLoading, error, refresh: fetchFirstPortfolio }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}
