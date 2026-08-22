import { useEffect, useMemo, useState } from 'react';

import { fetchFundTaxMetadataMap, type FundTaxMetadataMap } from '@/lib/fund-tax-metadata';
import { normalizeAsset, type HoldingRow } from '@/lib/portfolio-holdings';
import { supabase } from '@/lib/supabase';

export function useFundTaxMetadata(holdings: HoldingRow[]) {
  const fundSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) {
      const asset = normalizeAsset(h.asset);
      if (asset?.category_id === 'fon' && asset.symbol) {
        set.add(asset.symbol.trim().toUpperCase());
      }
    }
    return [...set].sort();
  }, [holdings]);

  const symbolsKey = fundSymbols.join(',');

  const [fundTaxMetadata, setFundTaxMetadata] = useState<FundTaxMetadataMap>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbolsKey) {
      setFundTaxMetadata(new Map());
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    void fetchFundTaxMetadataMap(supabase, fundSymbols)
      .then((map) => {
        if (!alive) return;
        setFundTaxMetadata(map);
      })
      .catch(() => {
        if (!alive) return;
        setFundTaxMetadata(new Map());
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [symbolsKey]);

  return { fundTaxMetadata, loading, hasFundHoldings: fundSymbols.length > 0 };
}
