import React, { createContext, useCallback, useContext, useState } from 'react';

export const PORTFOLIO_CATEGORY_IDS = [
  'yurtdisi',
  'bist',
  'doviz',
  'emtia',
  'fon',
  'kripto',
] as const;

export type PortfolioCategoryId = (typeof PORTFOLIO_CATEGORY_IDS)[number];

type ContextValue = {
  selectedIds: string[];
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
};

const SelectedCategoriesContext = createContext<ContextValue | null>(null);

export function SelectedCategoriesProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>(['yurtdisi']);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.includes(id),
    [selectedIds]
  );

  return (
    <SelectedCategoriesContext.Provider
      value={{ selectedIds, toggle, isSelected }}>
      {children}
    </SelectedCategoriesContext.Provider>
  );
}

export function useSelectedCategories(): ContextValue {
  const ctx = useContext(SelectedCategoriesContext);
  if (!ctx) throw new Error('useSelectedCategories must be used within SelectedCategoriesProvider');
  return ctx;
}
