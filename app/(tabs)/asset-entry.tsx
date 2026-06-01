import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocalizedDatePickerSheet } from '@/components/localized-date-picker-sheet';
import { ScreenWithFooter } from '@/components/screen-with-footer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePortfolio } from '@/context/portfolio';
import { kriptoStoredUnitToUsd, legacyCryptoStoredUnitToUsd } from '@/lib/crypto-price-usd';
import { isUsdNativeCategory } from '@/lib/portfolio-currency';
import { formatCostDateText, parseCostDateText, sanitizeCostDateText } from '@/lib/cost-date-input';
import { displayCurrencyPrefix } from '@/lib/display-currency';
import {
  appendTrDecimalComma,
  parseTrDecimal,
  sanitizeTrDecimalInput,
  trDecimalKeyboardType,
} from '@/lib/tr-decimal-input';
import { resolveBistDisplayName } from '@/lib/bist-display-name';
import { toTitleCaseWords } from '@/lib/display-title-case';
import { effectiveChange24hPctForDisplay } from '@/lib/effective-change-24h';
import { dailyPrevValueFromChangePct } from '@/lib/fon-price-guards';
import { extractCostDateFromNotes, upsertCostDateInNotes } from '@/lib/holding-notes-cost-date';
import { fetchInstantUnitPrice } from '@/lib/instant-price';
import { getUsdTryRateForDate } from '@/lib/usdtry-rate-for-date';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/brand';
import { assetAvatarBg } from '@/lib/asset-avatar';
import { useTranslation } from 'react-i18next';

/** Portföy sekmesi (`portfolio.tsx`). */
const PORTFOLIO_TAB_HREF = '/portfolio' as Href;

function isReturnToPortfolioTab(returnTo: string | undefined): boolean {
  return returnTo === '/' || returnTo === '/(tabs)/index' || returnTo === '/portfolio' || returnTo === '/(tabs)/portfolio';
}

/** Expo Router aynı param anahtarını bazen string[] döndürebilir. */
function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** amount state: DB noktalı; kullanıcı TR virgülü yapıştırabilir */
function parseHoldingQtyString(raw: string | undefined): number {
  const s = (raw ?? '').trim().replace(/\s/g, '');
  if (!s) return 0;
  if (!s.includes(',') && !s.includes('.')) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let t = s;
  if (lastComma > lastDot) {
    t = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    t = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    t = s.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const CHART_W = 300;
const CHART_H = 165;
/** Obsidian-style palette (HTML referans) */
const PRIMARY = '#89acff';
const CHART_GREEN = Brand.chartPositive;
const CHART_RED = Brand.chartNegative;
const TXN_GREEN = '#22c55e';
const TXN_GREEN_BG = 'rgba(34,197,94,0.14)';
const TXN_ORANGE = '#fb923c';
const TXN_ORANGE_BG = 'rgba(251,146,60,0.18)';
const TXN_RED = '#ef4444';
const TXN_RED_BG = 'rgba(239,68,68,0.14)';
const SURFACE = '#0e0e0e';
const SURFACE_LOW = '#131313';
const SURFACE_HIGH = '#1f1f1f';
const ON_SURFACE_MUTED = '#ababab';
const ON_PRIMARY_FIXED = '#000000';
const TIMEFRAMES = ['1D', '1W', '1M', '1Y', '5Y'] as const;

/** Ekleme/azaltma sayısal alanları: iOS klavye üstü / Android klavye üstü çubuk. */
const NUMERIC_KEYBOARD_ACCESSORY_ID = 'assetEntryNumericKeyboardDone';
const DECIMAL_KEYBOARD_ACCESSORY_ID = 'assetEntryDecimalKeyboard';
type Timeframe = (typeof TIMEFRAMES)[number];

function timeframeMs(tf: Timeframe): number {
  switch (tf) {
    case '1D': return 86_400_000;
    case '1W': return 7 * 86_400_000;
    case '1M': return 30 * 86_400_000;
    case '1Y': return 365 * 86_400_000;
    case '5Y': return 5 * 365 * 86_400_000;
  }
}

function PriceChart({
  series,
  isPositive,
  currPre,
  currSuf,
  selectedIdx,
  onSelect,
  numberLocale,
}: {
  series: number[];
  isPositive: boolean;
  currPre: string;
  currSuf: string;
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
  numberLocale: string;
}) {
  const [chartWidth, setChartWidth] = useState(0);

  if (series.length < 2) return null;
  const vals = series;
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;
  const padding = range * 0.1;
  const vMin = minVal - padding;
  const vMax = maxVal + padding;
  const vRange = vMax - vMin || 1;
  const toY = (v: number) => CHART_H - ((v - vMin) / vRange) * CHART_H;
  const lineColor = isPositive ? CHART_GREEN : CHART_RED;

  let dLine = '';
  vals.forEach((v, idx) => {
    const x = (CHART_W * idx) / (vals.length - 1);
    const y = toY(v);
    dLine += idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  const dFill = `${dLine} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  const midVal = (minVal + maxVal) / 2;
  const gridVals = [maxVal, midVal, minVal];

  const fmtLabel = (v: number) => {
    const abs = Math.abs(v);
    let maxDec = 2;
    if (abs > 0 && abs < 0.01) maxDec = 10;
    else if (abs >= 0.01 && abs < 1) maxDec = 6;
    else if (abs >= 1 && abs < 10) maxDec = 4;
    const formatted = abs.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: maxDec });
    const trimmed = formatted.replace(/0+$/, '').replace(/[,.]$/, '');
    return `${currPre}${v < 0 ? `-${trimmed}` : trimmed}${currSuf}`;
  };

  const handleTouch = (e: any) => {
    if (chartWidth <= 0 || vals.length < 2) return;
    const x = e.nativeEvent.locationX;
    const idx = Math.round((x / chartWidth) * (vals.length - 1));
    onSelect(Math.max(0, Math.min(vals.length - 1, idx)));
  };

  const selX = selectedIdx != null ? (CHART_W * selectedIdx) / (vals.length - 1) : 0;
  const selY = selectedIdx != null ? toY(vals[selectedIdx]) : 0;

  return (
    <View style={chartStyles.wrapper}>
      <View
        style={chartStyles.svgWrap}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => onSelect(null)}
      >
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="priceGrad" x1="0%" x2="0%" y1="0%" y2="100%">
              <Stop offset="0%" stopColor={lineColor} stopOpacity="0.35" />
              <Stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {gridVals.map((gv, i) => {
            const y = toY(gv);
            return (
              <Path
                key={i}
                d={`M 0 ${y} L ${CHART_W} ${y}`}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            );
          })}
          <Path d={dFill} fill="url(#priceGrad)" />
          <Path
            d={dLine}
            fill="none"
            stroke={lineColor}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {selectedIdx != null && (
            <Path
              d={`M ${selX} 0 L ${selX} ${CHART_H}`}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1}
            />
          )}
        </Svg>
        {selectedIdx != null && chartWidth > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: (selectedIdx / (vals.length - 1)) * chartWidth - 6,
              top: selY - 6,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: lineColor,
              borderWidth: 2,
              borderColor: '#ffffff',
            }}
          />
        )}
      </View>
      <View style={chartStyles.labelCol}>
        {gridVals.map((gv, i) => (
          <ThemedText key={i} style={chartStyles.labelText}>{fmtLabel(gv)}</ThemedText>
        ))}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  svgWrap: {
    flex: 1,
  },
  labelCol: {
    width: 56,
    justifyContent: 'space-between',
    paddingVertical: 2,
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  labelText: {
    fontSize: 10,
    color: ON_SURFACE_MUTED,
  },
});

export default function AssetEntryScreen() {
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'tr-TR';
  const insets = useSafeAreaInsets();

  const router = useRouter();
  const { portfolioId, refresh: refreshPortfolios } = usePortfolio();
  const params = useLocalSearchParams<{
    returnTo?: string;
    returnCategoryId?: string;
    returnLabel?: string;
    holdingId?: string;
    assetId?: string;
    name?: string;
    symbol?: string;
    categoryId?: string;
    price?: string;
    /** assets.currency (TRY spot için hızlı seed) */
    spotCurrency?: string;
    quantity?: string;
    avgPrice?: string;
    /** Varlık listesinden doğrudan işlem sheet (ekle modu). */
    openTransaction?: string;
  }>();

  const openTransactionOnEntry = firstParam(params.openTransaction) === '1';

  const routeHoldingId = useMemo(() => firstParam(params.holdingId), [params.holdingId]);

  const [holdingId, setHoldingId] = useState<string | undefined>(() => firstParam(params.holdingId));
  const assetId = firstParam(params.assetId);
  const categoryId = firstParam(params.categoryId);
  const symbol = firstParam(params.symbol) ?? '';
  const name = useMemo(() => {
    const raw = firstParam(params.name) ?? t('assetList.defaultLabel');
    if (categoryId === 'bist') return resolveBistDisplayName(symbol, raw);
    return raw;
  }, [params.name, categoryId, symbol, t]);
  const heroDisplayName = useMemo(
    () => (categoryId === 'bist' ? name : toTitleCaseWords(name)),
    [categoryId, name],
  );
  const returnTo = params.returnTo as string | undefined;
  const returnCategoryId = params.returnCategoryId as string | undefined;
  const returnLabel = params.returnLabel as string | undefined;
  const routePrice = params.price ? Number(params.price) : 0;
  const routeSpotCurrency = firstParam(params.spotCurrency);
  /** DB `assets.currency`; TRY ise spot TL → USD çevrimi (düşük fiyatlı coinlerde zorunlu). */
  const [spotCurrency, setSpotCurrency] = useState<string | null>(() => routeSpotCurrency || null);
  /** Liste/parametre seed; ekranda DB’den güncellenir (yurtdışı/kripto senkron sonrası doğru fiyat ve %). */
  const [livePrice, setLivePrice] = useState(0);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const priceRaw = livePrice > 0 ? livePrice : routePrice;

  useEffect(() => {
    setSpotCurrency(routeSpotCurrency || null);
  }, [assetId, routeSpotCurrency]);

  const handleBack = () => {
    if (returnTo === '/(tabs)/asset-list' && returnCategoryId != null) {
      router.replace({
        pathname: '/(tabs)/asset-list',
        params: { categoryId: returnCategoryId, label: returnLabel ?? '' },
      });
      return;
    }
    if (isReturnToPortfolioTab(returnTo)) {
      router.replace(PORTFOLIO_TAB_HREF);
      return;
    }
    router.back();
  };

  const openChartScreen = () => {
    if (!assetId) return;
    router.push({
      pathname: '/(tabs)/asset-chart',
      params: {
        assetId,
        categoryId: categoryId ?? '',
        symbol,
        name,
        price: String(currentPrice || 0),
        spotCurrency: spotCurrency ?? '',
        holdingId: holdingId ?? '',
        returnTo: '/(tabs)/asset-entry',
        entryReturnTo: returnTo ?? '',
        entryReturnCategoryId: returnCategoryId ?? '',
        entryReturnLabel: returnLabel ?? '',
        entryQuantity: amount,
        entryAvgPrice: unitPrice,
      },
    });
  };

  const amountUnitLabel = useMemo(() => {
    if (categoryId === 'mevduat') return 'TL';
    if (categoryId === 'doviz') return symbol || '—';
    if (categoryId === 'emtia') {
      const su = (symbol || '').toUpperCase();
      if (['XAU', 'XAG', 'XPT', 'XPD', 'XAUT', 'PAXG'].includes(su)) return su;
      const s = (symbol ?? '').toUpperCase();
      if (s.includes('22_AYAR') && s.includes('BILEZIK')) return t('portfolio.unitGram');
      if (s.includes('14_AYAR') || s.includes('18_AYAR')) return t('portfolio.unitGram');
      return t('portfolio.unitPiece');
    }
    return symbol || t('portfolio.unitPiece');
  }, [categoryId, symbol, t]);

  const [amount, setAmount] = useState(
    () => (firstParam(params.holdingId) ? '' : (params.quantity as string | undefined)) ?? '',
  );
  const [unitPrice, setUnitPrice] = useState(() => (params.avgPrice as string | undefined) ?? '');
  const [holdingNotes, setHoldingNotes] = useState<string | null>(null);
  const [storedCostDateIso, setStoredCostDateIso] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  type FormMode = 'add' | 'reduce' | 'delete';
  const [formMode, setFormMode] = useState<FormMode>('add');
  const [inputQtyStr, setInputQtyStr] = useState('');
  const [inputCost, setInputCost] = useState('');
  const [costDateText, setCostDateText] = useState('');
  const [costDatePickerVisible, setCostDatePickerVisible] = useState(false);
  const [costDatePickerValue, setCostDatePickerValue] = useState(() => new Date());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [actionToast, setActionToast] = useState<'add' | 'reduce' | null>(null);
  const actionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const keyboardHeightRef = useRef(0);
  const scrollViewLayoutHRef = useRef(0);
  const transactionSectionTopRef = useRef(0);
  const transactionSectionHeightRef = useRef(0);
  const androidQtyBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holdingRefreshSeq, setHoldingRefreshSeq] = useState(0);
  /** Klavye yüksekliği: içerik alt boşluğu + Android “Bitti” çubuğu konumu (iOS’ta da dinlenir). */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  /** Adet / maliyet: virgül aksesuarı; tarih: yalnızca Bitti. */
  const [decimalFieldFocus, setDecimalFieldFocus] = useState<'qty' | 'cost' | null>(null);
  const [numericAccessoryOpen, setNumericAccessoryOpen] = useState(false);

  const insertDecimalComma = useCallback(() => {
    if (decimalFieldFocus === 'qty') {
      setInputQtyStr((prev) => appendTrDecimalComma(prev));
    } else if (decimalFieldFocus === 'cost') {
      setInputCost((prev) => appendTrDecimalComma(prev, 8));
    }
  }, [decimalFieldFocus]);

  const handleDecimalKeyPress = useCallback(
    (field: 'qty' | 'cost') =>
      ({ nativeEvent }: { nativeEvent: { key: string } }) => {
        const key = nativeEvent.key;
        if (key === ',' || key === 'Comma') {
          if (field === 'qty') {
            setInputQtyStr((prev) => appendTrDecimalComma(prev));
          } else {
            setInputCost((prev) => appendTrDecimalComma(prev, 8));
          }
        }
      },
    [],
  );

  const onQtyKeyboardFieldFocus = useCallback(() => {
    if (androidQtyBlurTimerRef.current) {
      clearTimeout(androidQtyBlurTimerRef.current);
      androidQtyBlurTimerRef.current = null;
    }
    setDecimalFieldFocus('qty');
    setNumericAccessoryOpen(true);
  }, []);

  const onQtyKeyboardFieldBlur = useCallback(() => {
    androidQtyBlurTimerRef.current = setTimeout(() => {
      setDecimalFieldFocus(null);
      setNumericAccessoryOpen(false);
      androidQtyBlurTimerRef.current = null;
    }, 160);
  }, []);

  const onCostFieldFocus = useCallback(() => {
    if (androidQtyBlurTimerRef.current) {
      clearTimeout(androidQtyBlurTimerRef.current);
      androidQtyBlurTimerRef.current = null;
    }
    setDecimalFieldFocus('cost');
    setNumericAccessoryOpen(true);
  }, []);

  const onCostFieldBlur = useCallback(() => {
    androidQtyBlurTimerRef.current = setTimeout(() => {
      setDecimalFieldFocus(null);
      setNumericAccessoryOpen(false);
      androidQtyBlurTimerRef.current = null;
    }, 160);
  }, []);

  const onNonQtyNumericFieldFocus = useCallback(() => {
    if (androidQtyBlurTimerRef.current) {
      clearTimeout(androidQtyBlurTimerRef.current);
      androidQtyBlurTimerRef.current = null;
    }
    setDecimalFieldFocus(null);
    setNumericAccessoryOpen(true);
  }, []);

  const onNonQtyNumericFieldBlur = useCallback(() => {
    androidQtyBlurTimerRef.current = setTimeout(() => {
      setNumericAccessoryOpen(false);
      androidQtyBlurTimerRef.current = null;
    }, 160);
  }, []);

  const openTransactionSheet = useCallback(() => {
    setFormMode('add');
    setInputQtyStr('');
    setInputCost('');
    setCostDateText('');
    setTransactionOpen(true);
  }, []);

  const closeTransactionSheet = useCallback(() => {
    Keyboard.dismiss();
    setCostDatePickerVisible(false);
    setTransactionOpen(false);
    if (openTransactionOnEntry) {
      handleBack();
    }
  }, [openTransactionOnEntry, handleBack]);

  const showActionToast = useCallback((kind: 'add' | 'reduce') => {
    if (actionToastTimerRef.current) {
      clearTimeout(actionToastTimerRef.current);
      actionToastTimerRef.current = null;
    }
    setActionToast(kind);
    actionToastTimerRef.current = setTimeout(() => {
      setActionToast(null);
      actionToastTimerRef.current = null;
    }, 3000);
  }, []);

  const scrollFormFieldsIntoView = useCallback(() => {
    const scrollEnd = () => scrollViewRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(() => {
      scrollEnd();
      setTimeout(scrollEnd, Platform.OS === 'ios' ? 120 : 80);
      setTimeout(scrollEnd, Platform.OS === 'ios' ? 340 : 200);
    });
  }, []);

  /** Adet girişi: Ekle (veya Azalt) CTA’sı klavyenin üstünde kalsın; mümkünse kartın üstü de görünsün. */
  const scrollQtyFormAboveKeyboard = useCallback(() => {
    const run = () => {
      const scroll = scrollViewRef.current;
      if (!scroll) return;
      const top = transactionSectionTopRef.current;
      const secH = transactionSectionHeightRef.current;
      const viewH = scrollViewLayoutHRef.current;
      const kb = keyboardHeightRef.current;
      if (viewH <= 0) {
        scroll.scrollTo({ y: Math.max(0, top - 8), animated: true });
        return;
      }
      const usable =
        Platform.OS === 'android'
          ? Math.max(160, viewH - kb)
          : Math.max(160, viewH);
      if (secH <= 0) {
        scroll.scrollTo({ y: Math.max(0, top - 8), animated: true });
        return;
      }
      const bottom = top + secH;
      const yForCta = bottom - usable + 24;
      const yPreferTop = Math.max(0, top - 8);
      scroll.scrollTo({ y: Math.max(yPreferTop, yForCta), animated: true });
    };
    requestAnimationFrame(() => {
      run();
      setTimeout(run, Platform.OS === 'ios' ? 140 : 100);
      setTimeout(run, Platform.OS === 'ios' ? 380 : 240);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (androidQtyBlurTimerRef.current) {
        clearTimeout(androidQtyBlurTimerRef.current);
        androidQtyBlurTimerRef.current = null;
      }
      setNumericAccessoryOpen(false);
      setDecimalFieldFocus(null);
      setFormMode('add');
      setInputQtyStr('');
      setInputCost('');
      setCostDateText('');
      setHoldingRefreshSeq((s) => s + 1);
      if (openTransactionOnEntry) {
        setTransactionOpen(true);
      } else {
        setTransactionOpen(false);
      }
    }, [assetId, portfolioId, routeHoldingId, openTransactionOnEntry]),
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    keyboardHeightRef.current = keyboardHeight;
  }, [keyboardHeight]);

  useEffect(
    () => () => {
      if (androidQtyBlurTimerRef.current) clearTimeout(androidQtyBlurTimerRef.current);
      if (actionToastTimerRef.current) clearTimeout(actionToastTimerRef.current);
    },
    [],
  );

  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1D');
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [chartDates, setChartDates] = useState<(Date | null)[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [change24hPct, setChange24hPct] = useState<number | null>(null);
  const [holdingCreatedAt, setHoldingCreatedAt] = useState<string | null>(null);
  /** price_history birim fiyatı (assets.current_price ile aynı birimde). */
  const [addTimePriceRaw, setAddTimePriceRaw] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [usdTry, setUsdTry] = useState(1);
  const [usdTryAtCostDate, setUsdTryAtCostDate] = useState<number | null>(null);
  /** Grafik altı % / tutar: piyasa kotasyonlarının penceredeki ilk ve son değeri (maliyet noktası hariç). */
  const [chartRangeForPct, setChartRangeForPct] = useState<{ first: number; last: number } | null>(null);

  const qty = parseHoldingQtyString(amount);
  const avgCost = unitPrice ? parseFloat(unitPrice.replace(',', '.')) || 0 : 0;

  const currentPrice = useMemo(() => {
    if (categoryId !== 'kripto' || usdTry <= 0) return priceRaw;
    return kriptoStoredUnitToUsd(priceRaw, usdTry, spotCurrency);
  }, [categoryId, priceRaw, usdTry, spotCurrency]);

  /** Kripto: ortalama maliyet USD; eski holding’lerde TRY birimi kalırsa spot ile hizala. */
  const avgCostUsd = useMemo(() => {
    if (categoryId !== 'kripto' || avgCost <= 0) return avgCost;
    if (usdTry <= 0) return avgCost;
    return legacyCryptoStoredUnitToUsd(avgCost, usdTry, currentPrice);
  }, [categoryId, avgCost, usdTry, currentPrice]);

  const hasExplicitAvgCost = avgCostUsd > 0;
  /** Maliyet girilmemişse gösterimde güncel fiyatı baz al (kazanç ≈ 0); grafikte sahte 0 çizgisi yok. */
  const effectiveAvgCostUsd = useMemo(() => {
    if (avgCostUsd > 0) return avgCostUsd;
    if (qty > 0 && currentPrice > 0) return currentPrice;
    return 0;
  }, [avgCostUsd, qty, currentPrice]);

  /** Route params ile miktarı ezme: holdingId ile açıldıysa sunucudan gelen değer geçerli. */
  useEffect(() => {
    if (routeHoldingId) return;
    setAmount((params.quantity as string | undefined) ?? '');
    setUnitPrice(
      categoryId === 'mevduat' ? '' : ((params.avgPrice as string | undefined) ?? ''),
    );
  }, [params.quantity, params.avgPrice, assetId, routeHoldingId, categoryId]);

  useEffect(() => {
    if (categoryId === 'mevduat') {
      setUnitPrice('');
      setInputCost('');
    }
  }, [categoryId]);

  /** holdingId ile liste detayından gelince miktarı DB'den al; params eski kalabiliyordu. */
  useEffect(() => {
    if (!assetId || !portfolioId) return;
    let cancelled = false;
    (async () => {
      if (routeHoldingId) {
        const { data, error } = await supabase
          .from('holdings')
          .select('id, quantity, avg_price, portfolio_id, notes')
          .eq('id', routeHoldingId)
          .eq('portfolio_id', portfolioId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setHoldingId(undefined);
          setAmount('');
          setUnitPrice('');
          setHoldingNotes(null);
          setStoredCostDateIso(null);
          return;
        }
        setHoldingId(data.id);
        setAmount(String(data.quantity ?? ''));
        setUnitPrice(
          categoryId === 'mevduat' ? '' : data.avg_price != null ? String(data.avg_price) : '',
        );
        setHoldingNotes(data.notes ?? null);
        setStoredCostDateIso(extractCostDateFromNotes(data.notes));
        return;
      }

      const { data, error } = await supabase
        .from('holdings')
        .select('id, quantity, avg_price, notes')
        .eq('asset_id', assetId)
        .eq('portfolio_id', portfolioId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setHoldingId(undefined);
        setAmount('');
        setUnitPrice('');
        setHoldingNotes(null);
        setStoredCostDateIso(null);
        return;
      }
      if (data) {
        setHoldingId(data.id);
        setAmount(String(data.quantity ?? ''));
        setUnitPrice(
          categoryId === 'mevduat' ? '' : data.avg_price != null ? String(data.avg_price) : '',
        );
        setHoldingNotes(data.notes ?? null);
        setStoredCostDateIso(extractCostDateFromNotes(data.notes));
      } else {
        setHoldingId(undefined);
        setAmount('');
        setUnitPrice('');
        setHoldingNotes(null);
        setStoredCostDateIso(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId, portfolioId, routeHoldingId, categoryId, holdingRefreshSeq]);

  const fetchAssetQuote = useCallback(async () => {
    if (!assetId) return;
    const { data } = await supabase
      .from('assets')
      .select('current_price, change_24h_pct, price_updated_at, icon_url, currency')
      .eq('id', assetId)
      .maybeSingle();
    if (data?.currency != null && String(data.currency).trim() !== '') {
      setSpotCurrency(String(data.currency).trim());
    }
    const nextIcon = data?.icon_url != null && String(data.icon_url).trim() !== '' ? String(data.icon_url) : null;
    setIconUrl(nextIcon);
    let hasValidDbPrice = false;
    if (data?.current_price != null) {
      const p = Number(data.current_price);
      if (Number.isFinite(p) && p > 0) {
        setLivePrice(p);
        hasValidDbPrice = true;
      }
    }
    // Detay ekranda anlık fiyat bulunduğunda DB'ye de yaz ki portföy listesi "Fiyat güncelleniyor..."da takılmasın.
    if (!hasValidDbPrice && categoryId === 'yurtdisi' && symbol) {
      const instant = await fetchInstantUnitPrice({ categoryId, symbol });
      if (instant != null && Number.isFinite(instant) && instant > 0) {
        setLivePrice(instant);
        await supabase
          .from('assets')
          .update({
            current_price: instant,
            price_updated_at: new Date().toISOString(),
          })
          .eq('id', assetId);
      }
    }
    const eff = effectiveChange24hPctForDisplay(
      categoryId ?? '',
      data?.change_24h_pct,
      data?.price_updated_at,
      new Date(),
    );
    setChange24hPct(eff != null && Number.isFinite(eff) ? eff : null);
  }, [assetId, categoryId, symbol]);

  useEffect(() => {
    setLivePrice(0);
    setIconUrl(null);
  }, [assetId]);

  useEffect(() => {
    void fetchAssetQuote();
  }, [fetchAssetQuote]);

  useFocusEffect(
    useCallback(() => {
      void fetchAssetQuote();
    }, [fetchAssetQuote]),
  );

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('assets')
        .select('current_price')
        .eq('category_id', 'doviz')
        .eq('symbol', 'USD')
        .maybeSingle();
      if (data?.current_price) setUsdTry(Number(data.current_price));
    })();
  }, []);

  useEffect(() => {
    const isUsdNative = isUsdNativeCategory(categoryId);
    if (isUsdNative || categoryId === 'mevduat') {
      setUsdTryAtCostDate(null);
      return;
    }
    const typed = parseCostDateText(costDateText);
    const selected =
      typed ??
      (storedCostDateIso ? new Date(`${storedCostDateIso}T00:00:00.000Z`) : null);
    if (!selected) {
      setUsdTryAtCostDate(null);
      return;
    }

    const iso = selected.toISOString().slice(0, 10);
    let cancelled = false;
    (async () => {
      const { data: usdAsset } = await supabase
        .from('assets')
        .select('id')
        .eq('category_id', 'doviz')
        .eq('symbol', 'USD')
        .maybeSingle();
      if (cancelled || !usdAsset?.id) return;
      const rate = await getUsdTryRateForDate(supabase, usdAsset.id, iso);
      if (!cancelled && rate != null && rate > 0) {
        setUsdTryAtCostDate(rate);
        return;
      }
      if (!cancelled) setUsdTryAtCostDate(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [categoryId, costDateText, storedCostDateIso]);

  useEffect(() => {
    if (!holdingId) {
      setHoldingCreatedAt(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('holdings')
        .select('created_at')
        .eq('id', holdingId)
        .single();
      if (data) setHoldingCreatedAt(data.created_at);
    })();
  }, [holdingId]);

  useEffect(() => {
    if (!assetId || !holdingCreatedAt) {
      setAddTimePriceRaw(null);
      return;
    }
    let cancelled = false;
    const iso = new Date(holdingCreatedAt).toISOString();
    (async () => {
      const { data: before } = await supabase
        .from('price_history')
        .select('price')
        .eq('asset_id', assetId)
        .lte('recorded_at', iso)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const p0 = before?.price != null ? Number(before.price) : NaN;
      if (Number.isFinite(p0) && p0 > 0) {
        setAddTimePriceRaw(p0);
        return;
      }
      const { data: after } = await supabase
        .from('price_history')
        .select('price')
        .eq('asset_id', assetId)
        .gte('recorded_at', iso)
        .order('recorded_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const p1 = after?.price != null ? Number(after.price) : NaN;
      setAddTimePriceRaw(Number.isFinite(p1) && p1 > 0 ? p1 : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId, holdingCreatedAt]);

  useEffect(() => {
    if (!assetId || currentPrice <= 0 || categoryId === 'mevduat') return;
    let cancelled = false;
    (async () => {
      setLoadingChart(true);
      setSelectedIdx(null);

      const tfFrom = new Date(Date.now() - timeframeMs(activeTimeframe));
      const windowStartMs = tfFrom.getTime();
      const holdStart = holdingCreatedAt ? new Date(holdingCreatedAt) : null;
      /** Piyasa çizgisi: seçilen zaman penceresi ∩ pozisyon açılışından sonra (ortalama maliyet seriye eklenmez). */
      const historyFromMs =
        holdStart != null ? Math.max(holdStart.getTime(), windowStartMs) : windowStartMs;

      const { data, error } = await supabase
        .from('price_history')
        .select('price, recorded_at')
        .eq('asset_id', assetId)
        .gte('recorded_at', new Date(historyFromMs).toISOString())
        .order('recorded_at', { ascending: true });

      if (cancelled) return;

      const historyPrices = !error && data ? data.map((d) => Number(d.price)) : [];
      const historyDates = !error && data ? data.map((d) => new Date(d.recorded_at)) : [];

      const prices: number[] = [];
      const dates: (Date | null)[] = [];

      if (holdStart != null && holdStart.getTime() > windowStartMs) {
        const zeroSpan = holdStart.getTime() - windowStartMs;
        const zeroPoints = Math.max(2, Math.round((zeroSpan / Math.max(1, Date.now() - windowStartMs)) * 20));
        const padPrice = currentPrice > 0 ? currentPrice : 0;
        for (let p = 0; p < zeroPoints; p++) {
          const tMs =
            windowStartMs + (p / Math.max(1, zeroPoints - 1)) * (holdStart.getTime() - windowStartMs);
          prices.push(padPrice);
          dates.push(new Date(tMs));
        }
      }

      for (let i = 0; i < historyPrices.length; i++) {
        prices.push(historyPrices[i]);
        dates.push(historyDates[i]);
      }

      if (currentPrice > 0) {
        if (prices.length === 0) {
          prices.push(currentPrice, currentPrice);
          dates.push(new Date(historyFromMs), new Date());
        } else {
          const last = prices[prices.length - 1];
          const relDiff =
            Number.isFinite(last) && last > 0 ? Math.abs(last - currentPrice) / currentPrice : 1;
          if (relDiff > 0.0005) {
            prices.push(currentPrice);
            dates.push(new Date());
          } else {
            prices[prices.length - 1] = currentPrice;
            dates[dates.length - 1] = new Date();
          }
        }
      }

      if (categoryId === 'kripto' && usdTry > 0 && currentPrice > 0) {
        for (let i = 0; i < prices.length; i++) {
          const p = prices[i];
          prices[i] = p <= 0 ? p : kriptoStoredUnitToUsd(p, usdTry, spotCurrency, currentPrice);
        }
      }

      let rangeFirst: number | null = null;
      const rangeLast = currentPrice;
      if (historyPrices.length >= 1) {
        let first = historyPrices[0];
        if (categoryId === 'kripto' && usdTry > 0 && rangeLast > 0) {
          first = kriptoStoredUnitToUsd(first, usdTry, spotCurrency, rangeLast);
        }
        rangeFirst = first;
      }

      if (!cancelled) {
        if (rangeFirst != null && rangeFirst > 0 && rangeLast > 0) {
          setChartRangeForPct({ first: rangeFirst, last: rangeLast });
        } else {
          setChartRangeForPct(null);
        }
      }

      if (prices.length >= 2) {
        setPriceHistory(prices);
        setChartDates(dates);
      } else if (currentPrice > 0) {
        setPriceHistory([currentPrice * 0.998, currentPrice]);
        setChartDates([new Date(historyFromMs), new Date()]);
      } else {
        setPriceHistory([]);
        setChartDates([]);
      }

      setLoadingChart(false);
    })();
    return () => { cancelled = true; };
  }, [
    assetId,
    activeTimeframe,
    currentPrice,
    categoryId,
    holdingCreatedAt,
    avgCost,
    avgCostUsd,
    usdTry,
    spotCurrency,
  ]);

  const inputQty = useMemo(() => parseTrDecimal(inputQtyStr), [inputQtyStr]);

  const onInputQtyChange = useCallback((txt: string) => {
    setInputQtyStr(sanitizeTrDecimalInput(txt));
  }, []);

  const onInputCostChange = useCallback((txt: string) => {
    setInputCost(sanitizeTrDecimalInput(txt, 8));
  }, []);

  const onCostDateTextChange = useCallback((txt: string) => {
    setCostDateText(sanitizeCostDateText(txt));
  }, []);

  const openCostDatePicker = useCallback(() => {
    const parsed = parseCostDateText(costDateText);
    setCostDatePickerValue(parsed ?? new Date());
    setCostDatePickerVisible(true);
    Keyboard.dismiss();
  }, [costDateText]);

  const onCostDatePickerChange = useCallback((date: Date) => {
    setCostDatePickerValue(date);
  }, []);

  const confirmCostDatePicker = useCallback((picked?: Date) => {
    const d = picked ?? costDatePickerValue;
    setCostDatePickerValue(d);
    setCostDateText(formatCostDateText(d));
    setCostDatePickerVisible(false);
  }, [costDatePickerValue]);

  const navigateBack = (options?: { txnToast?: 'add' | 'reduce' }) => {
    if (returnTo === '/(tabs)/asset-list' && returnCategoryId != null) {
      router.replace({
        pathname: '/(tabs)/asset-list',
        params: {
          categoryId: returnCategoryId,
          label: returnLabel ?? '',
          _t: Date.now().toString(),
          ...(options?.txnToast ? { txnToast: options.txnToast } : {}),
        },
      });
    } else if (isReturnToPortfolioTab(returnTo)) {
      router.replace(PORTFOLIO_TAB_HREF);
    } else {
      router.replace(PORTFOLIO_TAB_HREF);
    }
  };

  const handleAdd = async () => {
    if (!assetId) {
      Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.missingInfo'));
      return;
    }
    if (inputQty <= 0) {
      Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.invalidQty'));
      return;
    }
    const isUsdNative = isUsdNativeCategory(categoryId);
    const hasAnyDatePart = Boolean(costDateText.trim());
    const parsedCostDate = parseCostDateText(costDateText);
    if (!isUsdNative && categoryId !== 'mevduat' && hasAnyDatePart && !parsedCostDate) {
      Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.invalidCostDate'));
      return;
    }
    const pid = portfolioId ?? (await refreshPortfolios());
    if (!pid) {
      Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.portfolioUnavailable'));
      return;
    }
    Keyboard.dismiss();
    const isMevduat = categoryId === 'mevduat';
    const costDateIso = parsedCostDate ? parsedCostDate.toISOString().slice(0, 10) : null;
    const nextNotes = upsertCostDateInNotes(holdingNotes, costDateIso);
    let cost = isMevduat
      ? null
      : inputCost.trim()
        ? parseTrDecimal(inputCost)
        : null;
    let instantUnitPrice: number | null = null;
    if (!isMevduat) {
      const instant = await fetchInstantUnitPrice({ categoryId, symbol });
      if (instant != null && Number.isFinite(instant) && instant > 0) {
        instantUnitPrice = instant;
        if (cost == null || !Number.isFinite(cost) || cost <= 0) {
          cost = instant;
        }
      }
    }
    // USD-native varlıklarda anlık fiyat gelirse maliyete seed et; gelmezse akış bloke edilmez.
    if (!isMevduat && isUsdNative && (cost == null || cost <= 0)) {
      if (instantUnitPrice != null && instantUnitPrice > 0) {
        cost = instantUnitPrice;
      }
    }
    setSaving(true);
    try {
      if (holdingId) {
        const newQty = qty + inputQty;
        if (isMevduat) {
          const { data: updated, error } = await supabase
            .from('holdings')
            .update({ quantity: newQty, avg_price: null })
            .eq('id', holdingId)
            .eq('portfolio_id', pid)
            .select('quantity, avg_price')
            .maybeSingle();
          if (error) {
            Alert.alert(t('assetEntry.errorTitle'), error.message);
            return;
          }
          if (!updated) {
            Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.updateNoRow'));
            return;
          }
          setAmount(String(updated.quantity ?? newQty));
          setUnitPrice('');
        } else {
          let newAvg: number | null = avgCost;
          if (cost != null && cost > 0) {
            newAvg =
              avgCost > 0 ? (qty * avgCost + inputQty * cost) / (qty + inputQty) : cost;
          }
          const { data: updated, error } = await supabase
            .from('holdings')
            .update({ quantity: newQty, avg_price: newAvg, notes: nextNotes })
            .eq('id', holdingId)
            .eq('portfolio_id', pid)
            .select('quantity, avg_price, notes')
            .maybeSingle();
          if (error) {
            Alert.alert(t('assetEntry.errorTitle'), error.message);
            return;
          }
          if (!updated) {
            Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.updateNoRow'));
            return;
          }
          setAmount(String(updated.quantity ?? newQty));
          setUnitPrice(updated.avg_price != null ? String(updated.avg_price) : '');
          setHoldingNotes(updated.notes ?? null);
          setStoredCostDateIso(extractCostDateFromNotes(updated.notes));
        }
      } else {
        const { data, error } = await supabase.from('holdings').insert({
          portfolio_id: pid,
          asset_id: assetId,
          quantity: inputQty,
          avg_price: isMevduat ? null : cost,
          notes: nextNotes,
        }).select('id, notes').single();
        if (error) {
          Alert.alert(t('assetEntry.errorTitle'), error.message);
          return;
        }
        if (data) {
          setHoldingId(data.id);
          setHoldingNotes(data.notes ?? null);
          setStoredCostDateIso(extractCostDateFromNotes(data.notes));
        }
        setAmount(String(inputQty));
        setUnitPrice(isMevduat || cost == null ? '' : String(cost));
      }
      // Portföy satırlarında "tutar = 0" görünmemesi için ekleme anında spot fiyatı da assets'e yaz.
      if (!isMevduat && assetId) {
        const fallbackSpot =
          instantUnitPrice != null && instantUnitPrice > 0
            ? instantUnitPrice
            : (isUsdNative && cost != null && cost > 0 ? cost : null);
        if (fallbackSpot != null && fallbackSpot > 0) {
        await supabase
          .from('assets')
          .update({
            current_price: fallbackSpot,
            price_updated_at: new Date().toISOString(),
          })
          .eq('id', assetId);
        }
      }
      setInputQtyStr('');
      setInputCost('');
      setCostDateText('');
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      });
      if (openTransactionOnEntry) {
        navigateBack({ txnToast: 'add' });
      } else {
        setTransactionOpen(false);
        showActionToast('add');
      }
    } catch (e: any) {
      Alert.alert(t('assetEntry.errorTitle'), e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReduce = async () => {
    if (!holdingId) {
      Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.reduceNoHolding'));
      return;
    }
    if (inputQty <= 0) {
      Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.invalidQty'));
      return;
    }
    if (inputQty > qty) {
      Alert.alert(
        t('assetEntry.errorTitle'),
        t('assetEntry.reduceTooMuch', { qty: qty.toLocaleString(numberLocale, { maximumFractionDigits: 10 }) }),
      );
      return;
    }
    const pid = portfolioId ?? (await refreshPortfolios());
    if (!pid) {
      Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.portfolioUnavailable'));
      return;
    }
    Keyboard.dismiss();
    const newQty = qty - inputQty;
    setSaving(true);
    if (newQty <= 0) {
      const { data: deleted, error } = await supabase
        .from('holdings')
        .delete()
        .eq('id', holdingId)
        .eq('portfolio_id', pid)
        .select('id')
        .maybeSingle();
      setSaving(false);
      if (error) { Alert.alert(t('assetEntry.errorTitle'), error.message); return; }
      if (!deleted) {
        Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.updateNoRow'));
        return;
      }
      navigateBack();
    } else {
      const { data: updated, error } = await supabase
        .from('holdings')
        .update({ quantity: newQty })
        .eq('id', holdingId)
        .eq('portfolio_id', pid)
        .select('quantity')
        .maybeSingle();
      setSaving(false);
      if (error) { Alert.alert(t('assetEntry.errorTitle'), error.message); return; }
      if (!updated) {
        Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.updateNoRow'));
        return;
      }
      setAmount(String(updated.quantity ?? newQty));
      setInputQtyStr('');
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      });
      setTransactionOpen(false);
      showActionToast('reduce');
    }
  };

  const handleDeleteConfirm = () => {
    if (!holdingId) return;
    setShowDeleteModal(true);
  };

  const performDelete = async () => {
    if (!holdingId) return;
    const pid = portfolioId ?? (await refreshPortfolios());
    if (!pid) {
      Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.portfolioUnavailable'));
      return;
    }
    setSaving(true);
    const { data: deleted, error } = await supabase
      .from('holdings')
      .delete()
      .eq('id', holdingId)
      .eq('portfolio_id', pid)
      .select('id')
      .maybeSingle();
    setSaving(false);
    if (error) {
      if (Platform.OS === 'web') {
        window.alert(t('assetEntry.deleteErrorWeb', { message: error.message }));
      } else {
        Alert.alert(t('assetEntry.deleteErrorTitle'), error.message);
      }
      return;
    }
    if (!deleted) {
      if (Platform.OS === 'web') {
        window.alert(t('assetEntry.updateNoRow'));
      } else {
        Alert.alert(t('assetEntry.errorTitle'), t('assetEntry.updateNoRow'));
      }
      return;
    }
    router.replace(PORTFOLIO_TAB_HREF);
  };

  const isUSD = isUsdNativeCategory(categoryId);
  const curr = displayCurrencyPrefix(isUSD ? 'USD' : 'TL');
  const hasActiveHolding = Boolean(holdingId && qty > 0);
  const marketValue = qty * currentPrice;
  const totalCost = qty * effectiveAvgCostUsd;
  const totalGainLoss = qty > 0 && currentPrice > 0 ? marketValue - totalCost : 0;
  const isPositive = totalGainLoss >= 0;

  const hasValidCostDate = Boolean(parseCostDateText(costDateText));
  const hasAnyCostDatePart = Boolean(costDateText.trim());
  const hasStoredCostDate = Boolean(storedCostDateIso);
  const canConvertToUsd = isUSD || usdTry > 0;
  const usdTryForCost =
    hasValidCostDate || hasAnyCostDatePart || hasStoredCostDate
      ? (usdTryAtCostDate && usdTryAtCostDate > 0 ? usdTryAtCostDate : 0)
      : usdTry;
  const inputCostNum = inputCost.trim() ? parseTrDecimal(inputCost) : 0;

  const addTimePriceDisplay = useMemo(() => {
    if (addTimePriceRaw == null || addTimePriceRaw <= 0) return null;
    if (categoryId !== 'kripto' || usdTry <= 0) return addTimePriceRaw;
    return kriptoStoredUnitToUsd(addTimePriceRaw, usdTry, spotCurrency, currentPrice);
  }, [addTimePriceRaw, categoryId, usdTry, spotCurrency, currentPrice]);

  /** Ekleme formunda girilen maliyet varsa USD hesapta öncelik ver (tarih kuru ile). */
  const pendingInputAvgUnitUsd = useMemo(() => {
    if (!hasActiveHolding) return null;
    if (formMode !== 'add' || categoryId === 'mevduat' || inputCostNum <= 0) return null;
    if (!canConvertToUsd) return null;
    return isUSD ? inputCostNum : inputCostNum / usdTryForCost;
  }, [hasActiveHolding, formMode, categoryId, inputCostNum, canConvertToUsd, isUSD, usdTryForCost]);

  /** Gerçek ortalama maliyet (implicit spot değil). */
  const avgUnitUsdExplicit = useMemo(() => {
    if (!hasActiveHolding) return null;
    if (pendingInputAvgUnitUsd != null && pendingInputAvgUnitUsd > 0) return pendingInputAvgUnitUsd;
    if (!canConvertToUsd || !hasExplicitAvgCost || avgCostUsd <= 0) return null;
    return isUSD ? avgCostUsd : avgCostUsd / usdTryForCost;
  }, [hasActiveHolding, pendingInputAvgUnitUsd, canConvertToUsd, isUSD, hasExplicitAvgCost, avgCostUsd, usdTryForCost]);

  /** Pozisyon açılışına yakın kur; ortalama yoksa sol sütunda gösterilir. */
  const entryUnitUsd = useMemo(() => {
    if (!hasActiveHolding) return null;
    if (!canConvertToUsd || addTimePriceDisplay == null || addTimePriceDisplay <= 0) return null;
    return isUSD ? addTimePriceDisplay : addTimePriceDisplay / usdTry;
  }, [hasActiveHolding, canConvertToUsd, isUSD, addTimePriceDisplay, usdTry]);

  const leftColUsdAvgOrEntry = avgUnitUsdExplicit ?? entryUnitUsd;

  const investedTotalUsd = useMemo(() => {
    if (!canConvertToUsd || qty <= 0 || !hasExplicitAvgCost || avgCostUsd <= 0) return null;
    return isUSD ? qty * avgCostUsd : (qty * avgCostUsd) / usdTryForCost;
  }, [canConvertToUsd, isUSD, qty, hasExplicitAvgCost, avgCostUsd, usdTryForCost]);

  const marketTotalUsd = useMemo(() => {
    if (!canConvertToUsd || qty <= 0 || currentPrice <= 0) return null;
    return isUSD ? marketValue : marketValue / usdTry;
  }, [canConvertToUsd, isUSD, qty, currentPrice, marketValue, usdTry]);

  /** Güncel birim fiyatın USD karşılığı (pozisyon toplamı değil). */
  const spotUnitUsd = useMemo(() => {
    if (!hasActiveHolding || !canConvertToUsd || currentPrice <= 0) return null;
    return isUSD ? currentPrice : currentPrice / usdTry;
  }, [hasActiveHolding, canConvertToUsd, isUSD, currentPrice, usdTry]);

  const gainLossUsd = useMemo(() => {
    if (!canConvertToUsd || qty <= 0 || marketTotalUsd == null) return null;
    if (hasExplicitAvgCost && investedTotalUsd != null) {
      return marketTotalUsd - investedTotalUsd;
    }
    if (!hasExplicitAvgCost && entryUnitUsd != null) {
      return marketTotalUsd - qty * entryUnitUsd;
    }
    return null;
  }, [
    canConvertToUsd,
    qty,
    marketTotalUsd,
    hasExplicitAvgCost,
    investedTotalUsd,
    entryUnitUsd,
  ]);

  const gainLossUsdPositive = gainLossUsd != null && gainLossUsd >= 0;

  const fmtVal = (v: number) => {
    const abs = Math.abs(v);
    let maxDec = 2;
    if (abs > 0 && abs < 0.01) maxDec = 10;
    else if (abs >= 0.01 && abs < 1) maxDec = 6;
    else if (abs >= 1 && abs < 10) maxDec = 4;
    const formatted = abs.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: maxDec });
    const trimmed = formatted.replace(/0+$/, '').replace(/[,.]$/, '');
    return v < 0 ? `-${trimmed}` : trimmed;
  };

  /** Hero spot fiyat: her zaman 2 ondalık (ör. ₺126,20). */
  const fmtHeroSpotPrice = (v: number) => {
    if (!Number.isFinite(v) || v <= 0) return '—';
    return v.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /** Pozisyonum kartı tutarları: kuruş yok, yukarı yuvarlı tam sayı. `locale` USD sütunu için `en-US`. */
  const fmtPositionMoneyCeil = (v: number, locale: string = numberLocale) => {
    if (!Number.isFinite(v)) {
      return (0).toLocaleString(locale, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
    }
    return Math.ceil(v).toLocaleString(locale, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
  };

  /** Pozisyon toplam değeri: virgülden sonra 2 hane. */
  const fmtPositionTotalValue = (v: number, locale: string = numberLocale) => {
    if (!Number.isFinite(v)) {
      return (0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /** Ortalama maliyet (yerel para): 3 ondalık, üst kesir yukarı. */
  const fmtMoneyCeil3 = (v: number, locale: string = numberLocale) => {
    if (!Number.isFinite(v)) {
      return (0).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    }
    const neg = v < 0;
    const av = Math.abs(v);
    const ceiled = Math.ceil(av * 1000) / 1000;
    const out = neg ? -ceiled : ceiled;
    const body = Math.abs(out).toLocaleString(locale, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return out < 0 ? `-${body}` : body;
  };

  /** Ortalama USD / birim USD: 4 ondalık, üst kesir yukarı (`numberLocale` ile TR’de virgül). */
  const fmtUsdCeil4 = (v: number, locale: string = numberLocale) => {
    if (!Number.isFinite(v)) {
      return (0).toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    const neg = v < 0;
    const av = Math.abs(v);
    const ceiled = Math.ceil(av * 10000) / 10000;
    const out = neg ? -ceiled : ceiled;
    const body = Math.abs(out).toLocaleString(locale, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
    return out < 0 ? `-${body}` : body;
  };

  const showPriceSection = currentPrice > 0 && categoryId !== 'mevduat';

  const displayPrice = useMemo(() => {
    if (selectedIdx != null && priceHistory[selectedIdx] != null) {
      return priceHistory[selectedIdx];
    }
    return currentPrice;
  }, [selectedIdx, priceHistory, currentPrice]);

  const bigPriceText = `${curr}${fmtVal(displayPrice)}`;

  const chartChange = useMemo(() => {
    const refClose =
      change24hPct != null && Number.isFinite(change24hPct) && currentPrice > 0
        ? currentPrice / (1 + change24hPct / 100)
        : null;

    /** 1G: Yahoo / CoinGecko günlük % (son işlem günü kapanışa göre); grafikteki maliyet noktası karışmasın. */
    if (
      activeTimeframe === '1D' &&
      refClose != null &&
      change24hPct != null &&
      Number.isFinite(change24hPct)
    ) {
      if (selectedIdx != null && priceHistory[selectedIdx] != null) {
        const p = priceHistory[selectedIdx];
        const ref = refClose;
        return {
          amount: p - ref,
          percentage: ref > 0 ? ((p - ref) / ref) * 100 : 0,
        };
      }
      return {
        amount: currentPrice - refClose,
        percentage: change24hPct,
      };
    }

    const baseFirst = chartRangeForPct?.first;
    if (baseFirst != null && baseFirst > 0 && priceHistory.length >= 1) {
      const targetIdx = selectedIdx != null ? selectedIdx : priceHistory.length - 1;
      const p = priceHistory[targetIdx];
      if (p != null && p > 0) {
        const diff = p - baseFirst;
        return { amount: diff, percentage: (diff / baseFirst) * 100 };
      }
    }

    return null;
  }, [
    activeTimeframe,
    change24hPct,
    currentPrice,
    chartRangeForPct,
    priceHistory,
    selectedIdx,
  ]);

  const selectedDate = useMemo(() => {
    if (selectedIdx != null && chartDates[selectedIdx]) {
      return chartDates[selectedIdx]!.toLocaleDateString(numberLocale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
    return null;
  }, [selectedIdx, chartDates, numberLocale]);

  const isChartPositive = chartChange ? chartChange.amount >= 0 : true;

  const positionGainPct =
    hasExplicitAvgCost && totalCost > 0 ? (totalGainLoss / totalCost) * 100 : null;

  const positionDailyReturn = useMemo(() => {
    if (qty <= 0 || marketValue <= 0 || change24hPct == null || !Number.isFinite(change24hPct)) {
      return null;
    }
    const { dailyDelta } = dailyPrevValueFromChangePct(marketValue, change24hPct);
    return { amt: dailyDelta, pct: change24hPct };
  }, [qty, marketValue, change24hPct]);

  const formatPositionMoney = (v: number) => `${curr}${fmtPositionTotalValue(v)}`;

  const formatReturnLine = (amt: number, pct: number) => {
    const money =
      amt >= 0
        ? `${curr}${fmtPositionTotalValue(amt)}`
        : `-${curr}${fmtPositionTotalValue(Math.abs(amt))}`;
    const pctSign = pct >= 0 ? '+' : '-';
    return `${money} (${pctSign}${Math.abs(pct).toLocaleString(numberLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}%)`;
  };

  /** Alım tarihi + o günkü USD/TRY kuru ile birim maliyet (USD); yalnızca TL varlıklarda. */
  const avgCostUsdAtPurchaseDate = useMemo(() => {
    if (isUSD || categoryId === 'mevduat') return null;
    const hasCostDate = hasValidCostDate || hasStoredCostDate;
    if (!hasCostDate || !(usdTryAtCostDate != null && usdTryAtCostDate > 0)) return null;
    if (!hasExplicitAvgCost || avgCostUsd <= 0) return null;
    const usd = avgCostUsd / usdTryAtCostDate;
    return Number.isFinite(usd) && usd > 0 ? usd : null;
  }, [
    isUSD,
    categoryId,
    hasValidCostDate,
    hasStoredCostDate,
    usdTryAtCostDate,
    hasExplicitAvgCost,
    avgCostUsd,
  ]);

  const formatAvgCostUsd = (v: number) =>
    `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /** Alım günü USD maliyetine göre bugünkü toplam getiri (USD). Ort. fiyat USD satırıyla aynı koşulda. */
  const positionTotalReturnUsd = useMemo(() => {
    if (avgCostUsdAtPurchaseDate == null || qty <= 0 || currentPrice <= 0 || !(usdTry > 0)) return null;
    const investedUsd = qty * avgCostUsdAtPurchaseDate;
    const marketUsd = marketValue / usdTry;
    const amt = marketUsd - investedUsd;
    if (!Number.isFinite(amt) || !(investedUsd > 0)) return null;
    const pct = (amt / investedUsd) * 100;
    return Number.isFinite(pct) ? { amt, pct } : null;
  }, [avgCostUsdAtPurchaseDate, qty, currentPrice, marketValue, usdTry]);

  const formatUsdMoneySigned = (v: number) => {
    const body = Math.abs(v).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return v >= 0 ? `$${body}` : `-$${body}`;
  };

  const formatUsdReturnLine = (amt: number, pct: number) => {
    const pctSign = pct >= 0 ? '+' : '-';
    return `${formatUsdMoneySigned(amt)} (${pctSign}${Math.abs(pct).toLocaleString(numberLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}%)`;
  };

  const assetIconBg = useMemo(
    () => assetAvatarBg(symbol, categoryId ?? 'default'),
    [symbol, categoryId],
  );

  const formFooter = useMemo(() => {
    const ctaBase = [styles.transactionSheetCta, saving && styles.actionBtnDisabled];
    const ctaTextWhite = [styles.transactionSheetCtaText, { color: '#ffffff' }];

    if (formMode === 'add') {
      return (
        <TouchableOpacity
          style={[...ctaBase, styles.transactionSheetCtaAdd]}
          activeOpacity={0.9}
          onPress={handleAdd}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <ThemedText style={ctaTextWhite}>{t('assetEntry.btnSubmitTransaction')}</ThemedText>
          )}
        </TouchableOpacity>
      );
    }
    if (formMode === 'reduce') {
      return (
        <TouchableOpacity
          style={[...ctaBase, styles.transactionSheetCtaReduce]}
          activeOpacity={0.9}
          onPress={handleReduce}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <ThemedText style={ctaTextWhite}>{t('assetEntry.btnSubmitTransaction')}</ThemedText>
          )}
        </TouchableOpacity>
      );
    }
    if (formMode === 'delete' && holdingId) {
      return (
        <TouchableOpacity
          style={[...ctaBase, styles.transactionSheetCtaDelete]}
          activeOpacity={0.9}
          onPress={handleDeleteConfirm}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <ThemedText style={ctaTextWhite}>{t('assetEntry.btnDelete')}</ThemedText>
          )}
        </TouchableOpacity>
      );
    }
    return null;
  }, [
    formMode,
    saving,
    holdingId,
    handleAdd,
    handleReduce,
    handleDeleteConfirm,
    t,
  ]);

  return (
    <ThemedView style={styles.safeArea} lightColor="#000000" darkColor="#000000">
      <ScreenWithFooter
        keyboardAvoid
        scrollRef={scrollViewRef}
        header={
          <View style={styles.obsHeader}>
            <TouchableOpacity onPress={handleBack} activeOpacity={0.8} hitSlop={12} style={styles.obsHeaderBtn}>
              <Ionicons name="chevron-back" size={22} color={PRIMARY} />
            </TouchableOpacity>
            <ThemedText style={styles.obsHeaderTitle}>{t('assetEntry.screenTitle')}</ThemedText>
            <View style={styles.obsHeaderSpacer} />
          </View>
        }
        contentContainerStyle={{ paddingBottom: 16 }}
        scrollProps={{
          onLayout: (e) => {
            scrollViewLayoutHRef.current = e.nativeEvent.layout.height;
          },
        }}>
          <View style={styles.heroBlock}>
            <View style={styles.heroIdentity}>
              <ThemedText style={styles.heroSymbolSmall}>{(symbol || '—').toUpperCase()}</ThemedText>
              <ThemedText style={styles.heroNameLarge} numberOfLines={3}>
                {heroDisplayName}
              </ThemedText>
            </View>
            {showPriceSection && (
              <View style={styles.heroQuote}>
                <View style={styles.heroPriceRow}>
                  <ThemedText style={styles.heroSpotPrice}>
                    {curr}
                    {fmtHeroSpotPrice(currentPrice)}
                  </ThemedText>
                  {change24hPct != null && Number.isFinite(change24hPct) ? (
                    <>
                      <ThemedText
                        style={[
                          styles.heroDayPct,
                          { color: change24hPct >= 0 ? CHART_GREEN : CHART_RED },
                        ]}>
                        ({change24hPct >= 0 ? '+' : ''}
                        {change24hPct.toLocaleString(numberLocale, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        %)
                      </ThemedText>
                      <TouchableOpacity
                        onPress={openChartScreen}
                        activeOpacity={0.8}
                        hitSlop={10}
                        style={styles.chartOpenBtn}>
                        <Ionicons
                          name="analytics-outline"
                          size={20}
                          color={change24hPct >= 0 ? CHART_GREEN : CHART_RED}
                        />
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              </View>
            )}
          </View>

          <View style={styles.positionCard}>
            <ThemedText style={styles.positionCardTitle}>{t('assetEntry.myPosition')}</ThemedText>

            <View style={styles.positionGrid2}>
              <View style={styles.positionGridHalf}>
                <ThemedText style={styles.positionMetricLabel}>{t('assetEntry.quantity')}</ThemedText>
                <ThemedText style={styles.positionMetricValue}>
                  {qty > 0
                    ? qty.toLocaleString(numberLocale, { minimumFractionDigits: 0, maximumFractionDigits: 10 })
                    : '—'}
                </ThemedText>
              </View>
              <View style={styles.positionGridHalf}>
                <ThemedText style={styles.positionMetricLabel}>{t('assetEntry.positionTotalValue')}</ThemedText>
                <ThemedText style={styles.positionMetricValue}>
                  {qty > 0 ? formatPositionMoney(marketValue) : '—'}
                </ThemedText>
              </View>
            </View>

            <View style={styles.positionGrid2}>
              <View style={styles.positionGridHalf}>
                <ThemedText style={styles.positionMetricLabel}>{t('assetEntry.avgPriceShort')}</ThemedText>
                <ThemedText style={styles.positionMetricValue}>
                  {effectiveAvgCostUsd > 0 ? formatPositionMoney(effectiveAvgCostUsd) : '—'}
                </ThemedText>
              </View>
              {avgCostUsdAtPurchaseDate != null ? (
                <View style={styles.positionGridHalf}>
                  <ThemedText style={styles.positionMetricLabel}>{t('assetEntry.avgPriceShortUsd')}</ThemedText>
                  <ThemedText style={styles.positionMetricValueUsd}>
                    {formatAvgCostUsd(avgCostUsdAtPurchaseDate)}
                  </ThemedText>
                </View>
              ) : null}
            </View>

            <View style={styles.positionReturnRow}>
              <ThemedText style={styles.positionMetricLabel}>{t('assetEntry.dailyReturn')}</ThemedText>
              {positionDailyReturn ? (
                <ThemedText
                  style={[
                    styles.positionReturnValue,
                    { color: positionDailyReturn.amt >= 0 ? CHART_GREEN : CHART_RED },
                  ]}>
                  {formatReturnLine(positionDailyReturn.amt, positionDailyReturn.pct)}
                </ThemedText>
              ) : (
                <ThemedText style={styles.positionReturnValueMuted}>—</ThemedText>
              )}
            </View>

            <View style={styles.positionReturnRow}>
              <ThemedText style={styles.positionMetricLabel}>{t('assetEntry.totalReturn')}</ThemedText>
              {qty > 0 && currentPrice > 0 && positionGainPct != null && Number.isFinite(positionGainPct) ? (
                <ThemedText
                  style={[
                    styles.positionReturnValue,
                    { color: totalGainLoss >= 0 ? CHART_GREEN : CHART_RED },
                  ]}>
                  {formatReturnLine(totalGainLoss, positionGainPct)}
                </ThemedText>
              ) : (
                <ThemedText style={styles.positionReturnValueMuted}>—</ThemedText>
              )}
            </View>

            {positionTotalReturnUsd != null ? (
              <View style={styles.positionReturnRow}>
                <ThemedText style={styles.positionMetricLabel}>{t('assetEntry.totalReturnUsd')}</ThemedText>
                <ThemedText
                  style={[
                    styles.positionReturnValue,
                    { color: positionTotalReturnUsd.amt >= 0 ? CHART_GREEN : CHART_RED },
                  ]}>
                  {formatUsdReturnLine(positionTotalReturnUsd.amt, positionTotalReturnUsd.pct)}
                </ThemedText>
              </View>
            ) : null}
          </View>

          <Pressable
            style={styles.newTransactionRow}
            onPress={openTransactionSheet}
            accessibilityRole="button"
            accessibilityLabel={t('assetEntry.newTransaction')}>
            <View style={styles.newTransactionBtn}>
              <View style={styles.newTransactionIconRing}>
                <View style={styles.newTransactionIconFill}>
                  <Ionicons name="add" size={22} color="#000000" />
                </View>
              </View>
              <ThemedText style={styles.newTransactionLabel}>{t('assetEntry.newTransaction')}</ThemedText>
            </View>
          </Pressable>
      </ScreenWithFooter>

      <Modal
        visible={transactionOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeTransactionSheet}>
        <View style={styles.transactionSheetPage}>
          <KeyboardAvoidingView
            style={styles.transactionSheetAvoidFull}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
            <View style={[styles.transactionSheetTopBar, { paddingTop: Math.max(insets.top, 14) }]}>
                <TouchableOpacity
                  onPress={closeTransactionSheet}
                  hitSlop={12}
                  activeOpacity={0.8}
                  style={styles.transactionSheetCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.cancel')}>
                  <Ionicons name="close" size={26} color="#ffffff" />
                </TouchableOpacity>
              </View>

              <View style={styles.transactionSheetAssetHeader}>
                <View style={styles.transactionSheetSymbolRow}>
                  <View
                    style={[
                      styles.transactionSheetIconCircle,
                      { backgroundColor: iconUrl ? '#ffffff' : assetIconBg },
                    ]}>
                    {iconUrl ? (
                      <Image
                        source={{ uri: iconUrl }}
                        style={styles.transactionSheetIconImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <ThemedText style={styles.transactionSheetIconLetter}>
                        {(symbol || '?').charAt(0).toUpperCase()}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.transactionSheetSymbol}>
                    {(symbol || '—').toUpperCase()}
                  </ThemedText>
                </View>
                <ThemedText style={styles.transactionSheetAssetName} numberOfLines={2}>
                  {heroDisplayName}
                </ThemedText>
              </View>

              <View style={styles.txnModeRow}>
                {(['add', 'reduce', 'delete'] as FormMode[]).map((m) => {
                  const label =
                    m === 'add'
                      ? t('assetEntry.btnAdd')
                      : m === 'reduce'
                        ? t('assetEntry.btnReduce')
                        : t('assetEntry.btnDelete');
                  const active = formMode === m;
                  const tabStyle =
                    m === 'add'
                      ? active
                        ? styles.txnModeTabActiveAdd
                        : styles.txnModeTabIdle
                      : m === 'reduce'
                        ? active
                          ? styles.txnModeTabActiveReduce
                          : styles.txnModeTabIdle
                        : active
                          ? styles.txnModeTabActiveDelete
                          : styles.txnModeTabIdle;
                  const textStyle =
                    m === 'delete' && !active
                      ? styles.txnModeTabTextDeleteIdle
                      : active
                        ? styles.txnModeTabTextActive
                        : styles.txnModeTabTextIdle;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.txnModeTab, tabStyle]}
                      activeOpacity={0.85}
                      onPress={() => {
                        setFormMode(m);
                        setInputQtyStr('');
                        setInputCost('');
                        setCostDateText('');
                      }}>
                      <ThemedText
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        style={textStyle}>
                        {label}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <ScrollView
                style={styles.transactionSheetScrollView}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={[
                  styles.transactionSheetScroll,
                  { paddingBottom: 12 + (Platform.OS === 'android' ? keyboardHeight : 0) },
                ]}>
                <View style={styles.txnFormCard}>
                  {(formMode === 'add' || formMode === 'reduce') && (
                    <View style={styles.txnFormRow}>
                      <ThemedText style={styles.txnFormLabel}>
                        {formMode === 'add'
                          ? t('assetEntry.labelQtyAdd')
                          : t('assetEntry.labelQtyReduce')}
                      </ThemedText>
                      <View style={styles.txnFormInputRow}>
                        <TextInput
                          style={styles.txnFormInput}
                          keyboardType={trDecimalKeyboardType()}
                          placeholder="0"
                          placeholderTextColor="rgba(255,255,255,0.28)"
                          value={inputQtyStr}
                          onChangeText={onInputQtyChange}
                          onKeyPress={handleDecimalKeyPress('qty')}
                          onFocus={onQtyKeyboardFieldFocus}
                          onBlur={onQtyKeyboardFieldBlur}
                          inputAccessoryViewID={DECIMAL_KEYBOARD_ACCESSORY_ID}
                          autoCorrect={false}
                          autoComplete="off"
                          spellCheck={false}
                          importantForAutofill="no"
                        />
                        <ThemedText style={styles.txnFormUnitChip}>{amountUnitLabel}</ThemedText>
                      </View>
                    </View>
                  )}

                  {formMode === 'add' && categoryId !== 'mevduat' && (
                    <>
                      <View style={styles.txnFormDivider} />
                      <View style={styles.txnFormRow}>
                        <ThemedText style={styles.txnFormLabel}>
                          {t('assetEntry.labelUnitCost')}
                        </ThemedText>
                        <View style={styles.txnFormInputRow}>
                          <ThemedText style={styles.txnFormCurrencyPrefix}>{curr}</ThemedText>
                          <TextInput
                            style={styles.txnFormInput}
                            keyboardType={trDecimalKeyboardType()}
                            placeholder="0,00"
                            placeholderTextColor="rgba(255,255,255,0.28)"
                            value={inputCost}
                            onChangeText={onInputCostChange}
                            onKeyPress={handleDecimalKeyPress('cost')}
                            onFocus={onCostFieldFocus}
                            onBlur={onCostFieldBlur}
                            inputAccessoryViewID={DECIMAL_KEYBOARD_ACCESSORY_ID}
                            autoCorrect={false}
                            autoComplete="off"
                            spellCheck={false}
                            importantForAutofill="no"
                          />
                        </View>
                      </View>
                    </>
                  )}

                  {formMode === 'add' && categoryId !== 'mevduat' && !isUsdNativeCategory(categoryId) && (
                    <>
                      <View style={styles.txnFormDivider} />
                      <View style={styles.txnFormRow}>
                        <ThemedText style={styles.txnFormLabel}>
                          {t('assetEntry.labelPurchaseDateOptional')}
                        </ThemedText>
                        <View style={styles.txnFormDateRow}>
                          <TextInput
                            style={styles.txnFormDateInput}
                            keyboardType="numbers-and-punctuation"
                            placeholder={t('assetEntry.costDatePlaceholder')}
                            placeholderTextColor="rgba(255,255,255,0.28)"
                            value={costDateText}
                            onChangeText={onCostDateTextChange}
                            maxLength={10}
                            returnKeyType="done"
                            onFocus={onNonQtyNumericFieldFocus}
                            onBlur={onNonQtyNumericFieldBlur}
                            inputAccessoryViewID={NUMERIC_KEYBOARD_ACCESSORY_ID}
                          />
                          <Pressable
                            style={({ pressed }) => [
                              styles.txnFormCalendarBtn,
                              pressed && styles.txnFormCalendarBtnPressed,
                            ]}
                            onPress={openCostDatePicker}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={t('assetEntry.openCostDatePicker')}>
                            <View pointerEvents="none">
                              <Ionicons name="calendar-outline" size={22} color={PRIMARY} />
                            </View>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}

                  {formMode === 'delete' && holdingId && (
                    <View style={styles.txnDeleteBlock}>
                      <View style={styles.txnDeleteIconWrap}>
                        <Ionicons name="trash-outline" size={22} color={TXN_RED} />
                      </View>
                      <ThemedText style={styles.txnDeleteTitle}>{t('assetEntry.deleteWarn')}</ThemedText>
                      <ThemedText style={styles.txnDeleteMeta}>
                        {t('assetEntry.deleteCurrent', {
                          qty: qty.toLocaleString(numberLocale, { maximumFractionDigits: 10 }),
                        })}
                      </ThemedText>
                      <ThemedText style={styles.txnDeleteMeta}>
                        {t('assetEntry.deleteValue', {
                          value: `${curr}${(qty * currentPrice).toLocaleString(numberLocale, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`,
                        })}
                      </ThemedText>
                    </View>
                  )}

                  {formMode === 'delete' && !holdingId && (
                    <View style={styles.txnDeleteBlock}>
                      <ThemedText style={styles.txnDeleteTitle}>{t('assetEntry.notInPortfolio')}</ThemedText>
                    </View>
                  )}
                </View>
              </ScrollView>

              {formFooter ? (
                <View style={[styles.transactionSheetFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                  {formFooter}
                </View>
              ) : null}

              {Platform.OS === 'android' && keyboardHeight > 0 && numericAccessoryOpen ? (
                <View
                  style={[styles.txnModalKeyboardAccessory, { bottom: keyboardHeight }]}
                  pointerEvents="box-none">
                  <View style={styles.keyboardAccessoryToolbar}>
                    {decimalFieldFocus ? (
                      <TouchableOpacity
                        onPress={insertDecimalComma}
                        activeOpacity={0.7}
                        hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                        style={styles.keyboardAccessoryCommaBtn}>
                        <ThemedText style={styles.keyboardAccessoryCommaText} lightColor="#ffffff" darkColor="#ffffff">
                          ,
                        </ThemedText>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.keyboardAccessoryCommaSpacer} />
                    )}
                    <TouchableOpacity
                      onPress={() => Keyboard.dismiss()}
                      activeOpacity={0.7}
                      hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                      style={styles.keyboardAccessoryBtn}>
                      <ThemedText style={styles.keyboardAccessoryBtnText} lightColor="#ffffff" darkColor="#ffffff">
                        {t('assetEntry.keyboardDone')}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <LocalizedDatePickerSheet
                embedded
                visible={costDatePickerVisible}
                value={costDatePickerValue}
                maximumDate={new Date()}
                onClose={() => setCostDatePickerVisible(false)}
                onConfirm={confirmCostDatePicker}
                onChange={onCostDatePickerChange}
              />
            </KeyboardAvoidingView>
        </View>
      </Modal>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={DECIMAL_KEYBOARD_ACCESSORY_ID}>
          <View style={styles.keyboardAccessoryToolbar}>
            <TouchableOpacity
              onPress={insertDecimalComma}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              style={styles.keyboardAccessoryCommaBtn}>
              <ThemedText style={styles.keyboardAccessoryCommaText} lightColor="#ffffff" darkColor="#ffffff">
                ,
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              style={styles.keyboardAccessoryBtn}>
              <ThemedText style={styles.keyboardAccessoryBtnText} lightColor="#ffffff" darkColor="#ffffff">
                {t('assetEntry.keyboardDone')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={NUMERIC_KEYBOARD_ACCESSORY_ID}>
          <View style={styles.keyboardAccessoryToolbar}>
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              style={styles.keyboardAccessoryBtn}>
              <ThemedText style={styles.keyboardAccessoryBtnText} lightColor="#ffffff" darkColor="#ffffff">
                {t('assetEntry.keyboardDone')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}

      {Platform.OS === 'android' && keyboardHeight > 0 && numericAccessoryOpen && !transactionOpen ? (
        <View
          style={[styles.keyboardAccessoryAndroidWrap, { bottom: keyboardHeight }]}
          pointerEvents="box-none">
          <View style={styles.keyboardAccessoryToolbar}>
            {decimalFieldFocus ? (
              <TouchableOpacity
                onPress={insertDecimalComma}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                style={styles.keyboardAccessoryCommaBtn}>
                <ThemedText style={styles.keyboardAccessoryCommaText} lightColor="#ffffff" darkColor="#ffffff">
                  ,
                </ThemedText>
              </TouchableOpacity>
            ) : (
              <View style={styles.keyboardAccessoryCommaSpacer} />
            )}
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              style={styles.keyboardAccessoryBtn}>
              <ThemedText style={styles.keyboardAccessoryBtnText} lightColor="#ffffff" darkColor="#ffffff">
                {t('assetEntry.keyboardDone')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Delete confirmation modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="warning" size={32} color={Brand.chartNegative} />
            </View>
            <ThemedText style={styles.modalTitle}>{t('assetEntry.modalTitle')}</ThemedText>
            <ThemedText style={styles.modalMessage}>
              {t('assetEntry.modalMessage', {
                qty: qty.toLocaleString(numberLocale, { maximumFractionDigits: 10 }),
                symbol: symbol || name,
              })}
            </ThemedText>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                activeOpacity={0.8}
                onPress={() => setShowDeleteModal(false)}>
                <ThemedText style={styles.modalBtnCancelText}>{t('assetEntry.modalNo')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnConfirm}
                activeOpacity={0.8}
                onPress={() => { setShowDeleteModal(false); performDelete(); }}>
                <ThemedText style={styles.modalBtnConfirmText}>{t('assetEntry.modalYes')}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={actionToast != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => {}}>
        <View
          pointerEvents="none"
          style={[
            styles.actionToastModalRoot,
            { paddingBottom: insets.bottom + 28 },
          ]}>
          {actionToast ? (
            <View style={styles.actionToastCard}>
              <Text style={styles.actionToastText}>
                {actionToast === 'add'
                  ? t('assetEntry.toastAddDone')
                  : t('assetEntry.toastReduceDone')}
              </Text>
            </View>
          ) : null}
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  footerShell: {
    backgroundColor: '#000000',
  },
  footerPad: {
    paddingHorizontal: 20,
  },
  obsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  obsHeaderBtn: {
    padding: 8,
    borderRadius: 999,
  },
  obsHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PRIMARY,
    letterSpacing: -0.3,
  },
  obsHeaderSpacer: {
    width: 38,
  },
  heroBlock: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  heroIdentity: {
    alignItems: 'center',
    maxWidth: '100%',
    marginBottom: 6,
  },
  heroQuote: {
    alignItems: 'center',
    marginTop: 26,
    width: '100%',
    paddingTop: 4,
  },
  heroSymbolSmall: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  heroNameLarge: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '400',
    color: ON_SURFACE_MUTED,
    letterSpacing: -0.1,
    marginTop: 6,
    marginBottom: 2,
    textAlign: 'center',
  },
  heroSpotPrice: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
    flexShrink: 0,
  },
  heroPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    paddingHorizontal: 12,
  },
  heroDayPct: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  chartOpenBtn: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  chartScrubBanner: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(31,31,31,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chartScrubPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  chartScrubDate: {
    fontSize: 11,
    color: ON_SURFACE_MUTED,
    textAlign: 'center',
    marginTop: 2,
  },
  tfRowObsidian: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 6,
    borderRadius: 999,
    backgroundColor: SURFACE_LOW,
  },
  tfPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  tfPillActive: {
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  tfPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: ON_SURFACE_MUTED,
  },
  tfPillTextActive: {
    color: ON_PRIMARY_FIXED,
  },
  sectionKicker: {
    marginTop: 28,
    marginBottom: 10,
    paddingHorizontal: 22,
    fontSize: 12,
    fontWeight: '700',
    color: ON_SURFACE_MUTED,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  positionCard: {
    marginHorizontal: 16,
    marginTop: 28,
    marginBottom: 20,
    padding: 20,
    borderRadius: 28,
    backgroundColor: SURFACE_LOW,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  positionCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 18,
  },
  positionGrid2: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 18,
  },
  positionGridHalf: {
    flex: 1,
    minWidth: 0,
  },
  positionMetricLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: ON_SURFACE_MUTED,
    marginBottom: 4,
  },
  positionMetricValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: '#ffffff',
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  positionMetricValueUsd: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: '#c7d7ff',
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  positionReturnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  positionReturnValue: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  positionReturnValueMuted: {
    fontSize: 16,
    fontWeight: '600',
    color: ON_SURFACE_MUTED,
  },
  newTransactionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  newTransactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  newTransactionIconRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#5c5c5e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTransactionIconFill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8e8ea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTransactionLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  transactionSheetPage: {
    flex: 1,
    backgroundColor: '#000000',
  },
  transactionSheetAvoidFull: {
    flex: 1,
  },
  transactionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  transactionSheetCard: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  transactionSheetAvoid: {
    maxHeight: '100%',
  },
  transactionSheetTopBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  transactionSheetCloseBtn: {
    padding: 4,
  },
  transactionSheetAssetHeader: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  transactionSheetSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  transactionSheetIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  transactionSheetIconImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  transactionSheetIconLetter: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  transactionSheetSymbol: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  transactionSheetAssetName: {
    fontSize: 14,
    fontWeight: '500',
    color: ON_SURFACE_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
  txnModeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  txnModeTab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnModeTabIdle: {
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'transparent',
  },
  txnModeTabActiveAdd: {
    borderColor: TXN_GREEN,
    backgroundColor: TXN_GREEN_BG,
  },
  txnModeTabActiveReduce: {
    borderColor: TXN_ORANGE,
    backgroundColor: TXN_ORANGE_BG,
  },
  txnModeTabActiveDelete: {
    borderColor: TXN_RED,
    backgroundColor: TXN_RED_BG,
  },
  txnModeTabTextIdle: {
    fontSize: 12,
    fontWeight: '700',
    color: ON_SURFACE_MUTED,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  txnModeTabTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  txnModeTabTextDeleteIdle: {
    fontSize: 12,
    fontWeight: '700',
    color: TXN_RED,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  transactionSheetScroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    flexGrow: 1,
  },
  transactionSheetScrollView: {
    flex: 1,
  },
  transactionSheetFooter: {
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: '#000000',
  },
  transactionSheetCta: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionSheetCtaAdd: {
    backgroundColor: TXN_GREEN,
  },
  transactionSheetCtaReduce: {
    backgroundColor: TXN_ORANGE,
  },
  transactionSheetCtaDelete: {
    backgroundColor: TXN_RED,
  },
  transactionSheetCtaText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  txnFormCard: {
    borderRadius: 20,
    backgroundColor: SURFACE_HIGH,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginTop: 6,
  },
  txnFormRow: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  txnFormDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  txnFormLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: ON_SURFACE_MUTED,
    marginBottom: 12,
    lineHeight: 18,
  },
  txnFormInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
  txnFormInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
      default: {},
    }),
  },
  txnModalKeyboardAccessory: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 12,
  },
  txnFormQtyWhole: {
    minWidth: 48,
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
      default: {},
    }),
  },
  txnFormQtyDec: {
    width: 56,
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
      default: {},
    }),
  },
  txnFormQtySep: {
    fontSize: 22,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
    marginHorizontal: 2,
  },
  txnFormUnitChip: {
    marginLeft: 'auto',
    paddingLeft: 12,
    fontSize: 14,
    fontWeight: '700',
    color: PRIMARY,
    letterSpacing: 0.4,
  },
  txnFormCurrencyPrefix: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    marginRight: 4,
  },
  txnFormDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txnFormDateInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
      default: {},
    }),
  },
  txnFormCalendarBtn: {
    marginLeft: 12,
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    zIndex: 2,
  },
  txnFormCalendarBtnPressed: {
    opacity: 0.85,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  datePickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  datePickerSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  datePickerHeaderBtn: {
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
  },
  datePickerHeaderBtnDone: {
    color: PRIMARY,
    fontWeight: '700',
  },
  txnDeleteBlock: {
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
  },
  txnDeleteIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: TXN_RED_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  txnDeleteTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
  },
  txnDeleteMeta: {
    fontSize: 14,
    fontWeight: '500',
    color: ON_SURFACE_MUTED,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
  transactionSection: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 28,
    backgroundColor: SURFACE_HIGH,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingTop: 14,
    overflow: 'hidden',
  },
  modeRowObsidian: {
    flexDirection: 'row',
    marginHorizontal: 12,
    padding: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    gap: 4,
  },
  modePill: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    alignItems: 'center',
  },
  modePillActive: {
    backgroundColor: PRIMARY,
  },
  modePillText: {
    width: '100%',
    fontSize: 11,
    fontWeight: '700',
    color: ON_SURFACE_MUTED,
    letterSpacing: Platform.OS === 'android' ? 0.2 : 0.6,
    textAlign: 'center',
  },
  modePillTextActive: {
    color: ON_PRIMARY_FIXED,
  },
  modePillTextDeleteIdle: {
    color: CHART_RED,
  },
  formInner: {
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 8,
  },
  fieldLabelCaps: {
    fontSize: 10,
    fontWeight: '700',
    color: ON_SURFACE_MUTED,
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  qtyInputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 4,
    paddingRight: 14,
  },
  splitInputObs: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  qtyInputSuffixInline: {
    fontSize: 13,
    fontWeight: '700',
    color: ON_SURFACE_MUTED,
    marginLeft: 4,
  },
  singleInputObs: {
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 12,
    textAlign: 'center',
  },
  dateInputYear: {
    flex: 1.4,
  },
  keyboardAccessoryAndroidWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 12,
  },
  keyboardAccessoryToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACE_HIGH,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  keyboardAccessoryCommaBtn: {
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardAccessoryCommaText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  keyboardAccessoryCommaSpacer: {
    width: 44,
  },
  keyboardAccessoryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  keyboardAccessoryBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
  },
  confirmCta: {
    marginTop: 18,
    alignSelf: 'center',
    width: '33.33%',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  confirmCtaAdd: {
    backgroundColor: '#7ccb94',
    shadowColor: '#3e8f5c',
  },
  confirmCtaAmber: {
    backgroundColor: '#d97706',
    shadowColor: '#d97706',
  },
  confirmCtaDanger: {
    backgroundColor: '#d97070',
    shadowColor: '#a84545',
  },
  confirmCtaText: {
    fontSize: 16,
    fontWeight: '800',
    color: ON_PRIMARY_FIXED,
    letterSpacing: 0.3,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 16,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(96,165,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroSymbol: {
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '700',
  },
  heroName: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 32,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemCenter: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  statValue: {
    color: '#f9fafb',
    fontSize: 14,
  },
  statPositive: { color: Brand.chartPositive },
  statNegative: { color: Brand.chartNegative },
  costBlock: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  costRowSplit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  costLabel: {
    fontSize: 12,
    color: '#9ca3af',
    flexShrink: 1,
  },
  costValue: {
    fontSize: 14,
    color: '#f9fafb',
  },
  costHint: {
    fontSize: 11,
    color: '#6b7280',
    lineHeight: 15,
    marginTop: 2,
  },

  /* ---- Price + Chart section ---- */
  priceSection: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 8,
  },
  bigPrice: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
    color: '#f9fafb',
    letterSpacing: -0.5,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  changeTextPositive: {
    color: Brand.chartPositive,
    fontSize: 14,
    fontWeight: '600',
  },
  changeTextNegative: {
    color: Brand.chartNegative,
    fontSize: 14,
    fontWeight: '600',
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  changeBadgePos: {
    backgroundColor: Brand.chartPositiveMuted,
  },
  changeBadgeNeg: {
    backgroundColor: Brand.chartNegativeMuted,
  },
  changeBadgeTextPos: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.chartPositive,
  },
  changeBadgeTextNeg: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.chartNegative,
  },
  categoryBadge: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
  },
  pointDate: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 6,
  },
  tfRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tfBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tfBtnActive: {
    backgroundColor: PRIMARY,
  },
  tfBtnText: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '600',
  },
  tfBtnTextActive: {
    color: '#ffffff',
  },

  /* ---- Common ---- */
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16,
    marginVertical: 8,
  },

  /* ---- Mode Buttons ---- */
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  modeBtnAdd: {
    backgroundColor: Brand.chartPositiveMuted,
    borderColor: Brand.chartPositive,
  },
  modeBtnReduce: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderColor: '#f59e0b',
  },
  modeBtnDelete: {
    backgroundColor: Brand.chartNegativeMuted,
    borderColor: Brand.chartNegative,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 0.5,
  },
  modeBtnTextActive: {
    color: '#ffffff',
  },

  /* ---- Form ---- */
  formContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  splitLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitInputLeft: {
    flex: 1,
    fontSize: 18,
    color: '#f9fafb',
    textAlign: 'right',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  splitComma: {
    fontSize: 22,
    color: '#9ca3af',
    marginHorizontal: 8,
    fontWeight: '700',
  },
  splitInputRight: {
    flex: 1,
    fontSize: 18,
    color: '#f9fafb',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  costInputWrapper: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  costInput: {
    fontSize: 18,
    color: '#f9fafb',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnAdd: {
    backgroundColor: Brand.chartPositive,
    width: '16%',
    alignSelf: 'center',
  },
  actionBtnReduce: {
    backgroundColor: '#f59e0b',
    width: '16%',
    alignSelf: 'center',
  },
  actionBtnDeleteFull: {
    backgroundColor: Brand.chartNegative,
    width: '16%',
    alignSelf: 'center',
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  deleteSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteWarning: {
    color: '#fbbf24',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  deleteInfo: {
    color: '#d1d5db',
    fontSize: 15,
    marginBottom: 4,
  },

  /* ---- Delete Modal ---- */
  actionToastModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  actionToastCard: {
    backgroundColor: SURFACE_HIGH,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    maxWidth: '88%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  actionToastText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Brand.chartNegativeMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalBold: {
    fontWeight: '700',
    color: '#f9fafb',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
  },
  modalBtnCancelText: {
    color: '#d1d5db',
    fontWeight: '600',
    fontSize: 15,
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Brand.chartNegative,
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
