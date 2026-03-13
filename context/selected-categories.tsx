import React, { createContext, useCallback, useContext, useState } from 'react';

type SelectedCategoriesContextValue = {
  toggle: (categoryId: string) => void;
  isSelected: (categoryId: string) => boolean;
};

const SelectedCategoriesContext = createContext<SelectedCategoriesContextValue | null>(null);

export function SelectedCategoriesProvider({ children }: { children: React.ReactNode }) {
  // Boş set = hepsi seçili. Set içinde olanlar kapalı (deselected) kabul edilir.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  const toggle = useCallback((categoryId: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (categoryId: string) => !deselected.has(categoryId),
    [deselected]
  );

  return (
    <SelectedCategoriesContext.Provider value={{ toggle, isSelected }}>
      {children}
    </SelectedCategoriesContext.Provider>
  );
}

export function useSelectedCategories(): SelectedCategoriesContextValue {
  const ctx = useContext(SelectedCategoriesContext);
  if (!ctx) {
    throw new Error('useSelectedCategories must be used within SelectedCategoriesProvider');
  }
  return ctx;
}
