import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/** compact ≈ iPhone 13/SE; spacious ≈ Plus/Pro Max */
export type ScreenLayoutTier = 'compact' | 'regular' | 'spacious';

/**
 * Dikey alan kısıtlı cihazlarda (ör. iPhone 13, 844pt) scroll'u azaltmak için kademe.
 * Yükseklik birincil sinyal; genişlik donut etiket marjı için ikincil.
 */
export function resolveScreenLayoutTier(width: number, height: number): ScreenLayoutTier {
  const minSide = Math.min(width, height);
  if (height < 820 || minSide < 375) return 'compact';
  if (height >= 900 && Math.max(width, height) >= 428) return 'spacious';
  return 'regular';
}

export type ScreenLayoutMetrics = {
  tier: ScreenLayoutTier;
  isCompact: boolean;
  width: number;
  height: number;
  heroValueFontSize: number;
  heroAmountFontSize: number;
  heroSuffixFontSize: number;
  heroPctFontSize: number;
  headerTitleFontSize: number;
  headerPaddingVertical: number;
  donutSizeMin: number;
  donutSizeMax: number;
  donutLabelMargin: number;
  donutStrokeWidth: number;
  donutTitleFontSize: number;
  heroMarginBottom: number;
  heroPillsMarginTop: number;
  heroChartGap: number;
  bentoPaddingVertical: number;
  bentoMarginBottom: number;
  scrollPaddingBottom: number;
  gridCardPaddingVertical: number;
  gridGap: number;
  assetRowPaddingVertical: number;
  assetIconSize: number;
  assetSymbolFontSize: number;
  assetGap: number;
  pillsMarginBottom: number;
  heroMarginBottomPortfolio: number;
  bottomSpacerHeight: number;
  chartHeight: number;
  trendTotalValueFontSize: number;
  sectionPadding: number;
};

function metricsForTier(tier: ScreenLayoutTier, width: number): Omit<ScreenLayoutMetrics, 'width' | 'height'> {
  const compact = tier === 'compact';
  const spacious = tier === 'spacious';

  return {
    tier,
    isCompact: compact,
    heroValueFontSize: compact ? 34 : spacious ? 42 : 38,
    heroAmountFontSize: compact ? 30 : spacious ? 36 : 34,
    heroSuffixFontSize: compact ? 17 : spacious ? 20 : 18,
    heroPctFontSize: compact ? 15 : spacious ? 18 : 16,
    headerTitleFontSize: compact ? 20 : 22,
    headerPaddingVertical: compact ? 8 : 12,
    donutSizeMin: compact ? 124 : 148,
    donutSizeMax: compact ? 172 : spacious ? 200 : 188,
    donutLabelMargin: width < 360 ? 72 : compact ? 70 : 78,
    donutStrokeWidth: compact ? 18 : 22,
    donutTitleFontSize: compact ? 19 : 22,
    heroMarginBottom: compact ? 10 : 22,
    heroPillsMarginTop: compact ? 10 : 18,
    heroChartGap: compact ? 6 : 14,
    bentoPaddingVertical: compact ? 10 : 16,
    bentoMarginBottom: compact ? 12 : 20,
    scrollPaddingBottom: compact ? 88 : 120,
    gridCardPaddingVertical: compact ? 8 : 12,
    gridGap: compact ? 8 : 12,
    assetRowPaddingVertical: compact ? 10 : 16,
    assetIconSize: compact ? 42 : 48,
    assetSymbolFontSize: compact ? 16 : 18,
    assetGap: compact ? 12 : 16,
    pillsMarginBottom: compact ? 12 : 20,
    heroMarginBottomPortfolio: compact ? 16 : 28,
    bottomSpacerHeight: compact ? 72 : 120,
    chartHeight: compact ? 88 : spacious ? 128 : 120,
    trendTotalValueFontSize: compact ? 24 : spacious ? 28 : 26,
    sectionPadding: compact ? 12 : 16,
  };
}

export function useScreenLayout(): ScreenLayoutMetrics {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const tier = resolveScreenLayoutTier(width, height);
    return { ...metricsForTier(tier, width), width, height };
  }, [width, height]);
}
