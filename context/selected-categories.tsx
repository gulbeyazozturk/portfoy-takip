import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type CategoryFilterState =
  | { kind: 'all' }
  | { kind: 'include'; ids: Set<string> };

type SelectedCategoriesContextValue = {
  filter: CategoryFilterState;
  /** Tam liste; varsayılan durum. */
  selectAllCategories: () => void;
  /** Portföy sekmesindeki kategori hapı; çoklu seçim. */
  toggleCategoryPill: (categoryId: string) => void;
  /** Ana sayfa donut: tek kategori veya kapatma (null → tümü). */
  setCategoryFromChart: (categoryId: string | null) => void;
  isAllCategories: boolean;
  isCategoryPillSelected: (categoryId: string) => boolean;
};

const SelectedCategoriesContext = createContext<SelectedCategoriesContextValue | null>(null);

const ALL: CategoryFilterState = { kind: 'all' };

export function SelectedCategoriesProvider({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = useState<CategoryFilterState>(ALL);

  const selectAllCategories = useCallback(() => {
    setFilter(ALL);
  }, []);

  const toggleCategoryPill = useCallback((categoryId: string) => {
    setFilter((prev) => {
      if (prev.kind === 'all') {
        return { kind: 'include', ids: new Set([categoryId]) };
      }
      const next = new Set(prev.ids);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next.size === 0 ? ALL : { kind: 'include', ids: next };
    });
  }, []);

  const setCategoryFromChart = useCallback((categoryId: string | null) => {
    if (categoryId == null) setFilter(ALL);
    else setFilter({ kind: 'include', ids: new Set([categoryId]) });
  }, []);

  const isAllCategories = filter.kind === 'all';

  const isCategoryPillSelected = useCallback(
    (categoryId: string) => filter.kind === 'include' && filter.ids.has(categoryId),
    [filter],
  );

  const value = useMemo(
    () => ({
      filter,
      selectAllCategories,
      toggleCategoryPill,
      setCategoryFromChart,
      isAllCategories,
      isCategoryPillSelected,
    }),
    [filter, selectAllCategories, toggleCategoryPill, setCategoryFromChart, isAllCategories, isCategoryPillSelected],
  );

  return (
    <SelectedCategoriesContext.Provider value={value}>{children}</SelectedCategoriesContext.Provider>
  );
}

export function useSelectedCategories(): SelectedCategoriesContextValue {
  const ctx = useContext(SelectedCategoriesContext);
  if (!ctx) {
    throw new Error('useSelectedCategories must be used within SelectedCategoriesProvider');
  }
  return ctx;
}

/** Donut’ta tek dilim vurgusu için (çoklu seçimde vurgu yok). */
export function getSingleChartCategoryId(filter: CategoryFilterState): string | null {
  if (filter.kind !== 'include' || filter.ids.size !== 1) return null;
  return [...filter.ids][0] ?? null;
}
