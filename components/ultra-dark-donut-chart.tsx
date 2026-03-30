import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Fonts } from '@/constants/theme';

const APP_ICON = require('@/assets/images/icon.png');

export type DonutSlice = {
  label: string;
  value: number;
  color: string;
  /** Kategori kimliği (ana sayfa neon renk eşlemesi için). */
  categoryId?: string;
};

type UltraDarkDonutChartProps = {
  data: DonutSlice[];
  size?: number;
  /** Halka kalınlığı (iç yarıçap = dış − strokeWidth). */
  strokeWidth?: number;
  showLabels?: boolean;
  /** Verildiğinde merkezde uygulama ikonu yerine bu içerik gösterilir (ör. portföy adı). */
  centerContent?: ReactNode;
  /** İç cam daire rengi (bento / neon tema). */
  innerDiskFill?: string;
  innerDiskStroke?: string;
  /** Dilim altına hafif “glow” için ikinci katman (iOS’te daha belirgin). */
  segmentGlow?: boolean;
  /** Ok/etiket için tuval payı; dar ekranda küçültülebilir (varsayılan 80). */
  labelMargin?: number;
  /** Dilime basıldığında (categoryId ile alt kart eşleştirmesi). */
  onSlicePress?: (slice: DonutSlice) => void;
  /** Seçili kategori — diğer dilimler soluklaşır. */
  selectedCategoryId?: string | null;
};

/** Commit’teki stroke tabanlı grafikle aynı açı → koordinat dönüşümü (9 yönünden saat yönü). */
const polarToCartesian = (cx: number, cy: number, radius: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
};

/**
 * HTML referansı: dolu halka dilimi — dış yay (sweep 1) → iç kenar → iç yay (sweep 0) → Z
 */
const describeAnnularSector = (
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) => {
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  const sweepDeg = endAngle - startAngle;
  const largeOuter = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const largeInner = Math.abs(sweepDeg) > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${largeOuter} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${largeInner} 0 ${p4.x} ${p4.y} Z`;
};

const describeFullAnnulusTwoHalves = (
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
) =>
  [
    describeAnnularSector(cx, cy, rOuter, rInner, -90, 90),
    describeAnnularSector(cx, cy, rOuter, rInner, 90, 270),
  ] as const;

const LABEL_EDGE_PAD = 10;
/** Lider çizginin yatay ucu (labelY); metin tabanı bundan yukarıda — çizgi metnin ortasından geçmesin. */
const LABEL_TEXT_ABOVE_LINE = 10;
const LABEL_FONT_SIZE = 11;
/**
 * Üst satırdaki yatay çizgi (labelY) ile alt satırın metin kutusu çakışmasın.
 * Alt satırın üstü ≈ labelY - (LABEL_TEXT_ABOVE_LINE + büyük harf yüksekliği); boşluk ≈ 21 + px.
 */
const LABEL_TEXT_EXTENT_ABOVE_LINE = LABEL_TEXT_ABOVE_LINE + Math.ceil(LABEL_FONT_SIZE * 0.92);
/** Donut dış halkası ile metin kutusu arası minimum boşluk (px). */
const DONUT_LABEL_CLEAR = 14;
/** Yatay lider ucu ile dirsek (p2x) arasında görünür minimum mesafe (px). */
const LABEL_MIN_HORIZONTAL_STUB = 6;
/** Dış halkaya teğet ilk segment uzunluğu (px). */
const LABEL_TANGENT_LEN = 14;
/** Lider örneklemesi: halka / merkez diski ile çakışma tespiti. */
const LEADER_SAMPLE_STEPS = 28;
const LEADER_T_START = 0.04;
/** Merkez cam daireye çok yakın geçişleri engelle (metin alanı). */
const LEADER_CENTER_MARGIN = 6;
const SLICE_PRESS_SCALE = 1.045;
/** Lider çizgileri — nötr açık gri (dilim rengi değil). */
const LEADER_STROKE = 'rgba(255,255,255,0.38)';
const SLICE_PRESS_OPACITY_BOOST = 1.12;

/** İlk giriş: back easing overshoot + geniş dönüş. */
const ENTRANCE_MS = 1180;
const ENTRANCE_BACK = 1.62;
const ENTRANCE_ROT_START_DEG = -48;
const ENTRANCE_SCALE_START = 0.48;

/** Yaklaşık metin genişliği (SVG Text, tek satır). */
function estimateLabelTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

function distFromCenter(x: number, y: number, cx0: number, cy0: number): number {
  const dx = x - cx0;
  const dy = y - cy0;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * AB doğru parçası donut maddesi (rInner–rOuter) veya merkez diski içinden geçiyor mu?
 * p1 dış kenarda olduğu için A ucunda kısa t atlanır.
 */
function segmentCrossesDonutOrCenter(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx0: number,
  cy0: number,
  rInner: number,
  rOuter: number,
): boolean {
  const rCenterClear = Math.max(0, rInner - LEADER_CENTER_MARGIN);
  const segLen = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2) || 1;
  /** p1 dış çember üzerinde; birkaç px boyunca halka testi atlanır (yanlış pozitif kiriş). */
  const skipRingNearA = Math.min(8, segLen * 0.12);
  for (let i = 0; i <= LEADER_SAMPLE_STEPS; i++) {
    const u = i / LEADER_SAMPLE_STEPS;
    const t = LEADER_T_START + (1 - LEADER_T_START) * u;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const d = distFromCenter(x, y, cx0, cy0);
    const along = t * segLen;
    if (d < rCenterClear) return true;
    if (along >= skipRingNearA && d >= rInner && d <= rOuter) return true;
  }
  return false;
}

function polylineCrossesDonutOrCenter(
  pts: { x: number; y: number }[],
  cx0: number,
  cy0: number,
  rInner: number,
  rOuter: number,
): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (segmentCrossesDonutOrCenter(a.x, a.y, b.x, b.y, cx0, cy0, rInner, rOuter)) return true;
  }
  return false;
}

function orthogonalPathToSvg(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  return pts
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');
}

/**
 * Sadece yatay / dikey segmentler (90°); diyagonal veya teğet çizgi yok.
 * Sıra: kısa L şekli (HV/VH) → gerekirse donut dışı dikey omurga ile H–V–H.
 */
function buildLeaderPath(
  p1: { x: number; y: number },
  _p2x: number,
  _p2y: number,
  labelX: number,
  labelY: number,
  cx0: number,
  cy0: number,
  rInner: number,
  rOuter: number,
  isLeftSide: boolean,
): string {
  const end = { x: labelX, y: labelY };
  const leftSpineX = cx0 - rOuter - DONUT_LABEL_CLEAR;
  const rightSpineX = cx0 + rOuter + DONUT_LABEL_CLEAR;

  const cornerHV = { x: labelX, y: p1.y };
  const cornerVH = { x: p1.x, y: labelY };
  const lenHV = Math.abs(cornerHV.x - p1.x) + Math.abs(end.y - cornerHV.y);
  const lenVH = Math.abs(cornerVH.y - p1.y) + Math.abs(end.x - cornerVH.x);
  const elbowOrder =
    lenHV <= lenVH ? [cornerHV, cornerVH] : [cornerVH, cornerHV];

  const candidates: { x: number; y: number }[][] = [];
  for (const c of elbowOrder) {
    candidates.push([p1, c, end]);
  }

  if (isLeftSide) {
    candidates.push([
      p1,
      { x: leftSpineX, y: p1.y },
      { x: leftSpineX, y: labelY },
      end,
    ]);
  } else {
    candidates.push([
      p1,
      { x: rightSpineX, y: p1.y },
      { x: rightSpineX, y: labelY },
      end,
    ]);
  }

  for (const pts of candidates) {
    if (!polylineCrossesDonutOrCenter(pts, cx0, cy0, rInner, rOuter)) {
      return orthogonalPathToSvg(pts);
    }
  }

  const c = lenHV <= lenVH ? cornerHV : cornerVH;
  return orthogonalPathToSvg([p1, c, end]);
}

type LabelLayoutItem = {
  key: string;
  slice: DonutSlice;
  pct: number;
  p1: { x: number; y: number };
  p2x: number;
  p2y: number;
  labelX: number;
  baseY: number;
  labelY: number;
  textY: number;
  isLeftSide: boolean;
  percentLabel: string;
};

/**
 * Aynı tarafta (sol veya sağ) biriken etiketler: kullanılabilir dikey bandı n eşit bölgreye böl,
 * üstten alta orijinal sıraya (baseY) göre yerleştir — çakışma yok, eşit aralık.
 */
function distributeLabelYsEvenly(
  group: { baseY: number; key: string }[],
  minY: number,
  maxY: number,
): Map<string, number> {
  if (group.length === 0) return new Map();
  const sorted = [...group].sort((a, b) => a.baseY - b.baseY);
  const n = sorted.length;
  const h = Math.max(0, maxY - minY);
  const map = new Map<string, number>();
  if (n === 1) {
    map.set(sorted[0]!.key, minY + h / 2);
    return map;
  }
  for (let i = 0; i < n; i++) {
    const labelY = minY + ((i + 0.5) / n) * h;
    map.set(sorted[i]!.key, labelY);
  }
  return map;
}

export const UltraDarkDonutChart: React.FC<UltraDarkDonutChartProps> = ({
  data,
  size = 240,
  strokeWidth = 28,
  showLabels = true,
  centerContent,
  innerDiskFill = 'rgba(255,255,255,0.06)',
  innerDiskStroke = 'rgba(255,255,255,0.08)',
  segmentGlow = false,
  labelMargin: labelMarginProp,
  onSlicePress,
  selectedCategoryId = null,
}) => {
  const { i18n } = useTranslation();
  const labelMargin = showLabels ? (labelMarginProp ?? 80) : 20;
  const canvasSize = size + 2 * labelMargin;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const rOuter = Math.max(30, size / 2);
  const thickness =
    strokeWidth != null && strokeWidth > 0 ? strokeWidth : rOuter * (25 / 120);
  const rInner = Math.max(4, rOuter - thickness);
  const ringMidRadius = (rOuter + rInner) / 2;
  const ringStrokeWidth = Math.max(1, rOuter - rInner);

  const safeData = useMemo(() => data.filter((d) => d.value > 0), [data]);
  const total = useMemo(() => safeData.reduce((sum, d) => sum + d.value, 0), [safeData]);

  const slices = useMemo(() => {
    if (total <= 0) return [] as { slice: DonutSlice; pct: number; start: number; end: number }[];
    let startAngle = -90;
    return safeData.map((slice) => {
      const angle = (slice.value / total) * 360;
      const endAngle = startAngle + angle;
      const pct = (slice.value / total) * 100;
      const row = { slice, pct, start: startAngle, end: endAngle };
      startAngle = endAngle;
      return row;
    });
  }, [safeData, total]);

  const hasData = slices.length > 0 && total > 0;
  const fallbackRingColor = '#2a2a2a';

  /** İç boşluğa sığacak şekilde (glass disk ~ rInner). */
  const centerIconSize = Math.round(Math.min(72, Math.max(40, (rInner - 6) * 1.25)));

  const segmentDimOpacity = (slice: DonutSlice) => {
    if (selectedCategoryId == null) return 1;
    const id = slice.categoryId;
    if (id != null && id === selectedCategoryId) return 1;
    return 0.4;
  };

  const handleSlicePress = (slice: DonutSlice) => {
    onSlicePress?.(slice);
  };

  const [pressedSliceIndex, setPressedSliceIndex] = useState<number | null>(null);
  const entrance = useSharedValue(hasData ? 0 : 1);

  useEffect(() => {
    if (!hasData) {
      entrance.value = 1;
      return;
    }
    entrance.value = 0;
    entrance.value = withTiming(1, {
      duration: ENTRANCE_MS,
      easing: Easing.out(Easing.back(ENTRANCE_BACK)),
    });
  }, [hasData, canvasSize, safeData.length, total, entrance]);

  const chartAnimatedStyle = useAnimatedStyle(() => {
    const v = entrance.value;
    const rot = ENTRANCE_ROT_START_DEG * (1 - v);
    const sc = ENTRANCE_SCALE_START + (1 - ENTRANCE_SCALE_START) * v;
    const op = interpolate(v, [0, 0.08, 1], [0, 0.88, 1], Extrapolation.CLAMP);
    return {
      opacity: op,
      transform: [
        { translateX: canvasSize / 2 },
        { translateY: canvasSize / 2 },
        { rotate: `${rot}deg` },
        { scale: sc },
        { translateX: -canvasSize / 2 },
        { translateY: -canvasSize / 2 },
      ],
    };
  }, [canvasSize]);

  const labelLayouts = useMemo((): LabelLayoutItem[] => {
    if (!hasData || !showLabels) return [];

    const useComma = i18n.language?.startsWith('tr');
    const items: Omit<LabelLayoutItem, 'labelY' | 'textY'>[] = [];

    slices.forEach(({ slice, pct, start, end }, sliceIndex) => {
      const angle = end - start;
      if (angle < 0.5) return;

      const midAngle = start + angle / 2;
      const ringOuter = rOuter;
      const p1 = polarToCartesian(cx, cy, ringOuter, midAngle);
      /** Dikey eksen (merkezden yukarı–aşağı): dilim ortası cx’in solundaysa etiket solda, sağındaysa sağda. */
      const isLeftSide = p1.x <= cx;
      const pctStr = pct.toFixed(1);
      const percentLabel = `${useComma ? pctStr.replace('.', ',') : pctStr}% ${slice.label.toLocaleUpperCase('tr-TR')}`;
      const estTextW = estimateLabelTextWidth(percentLabel, LABEL_FONT_SIZE);
      const unitRadX = (p1.x - cx) / (ringOuter || 1);
      const unitRadY = (p1.y - cy) / (ringOuter || 1);
      const tnx = -unitRadY;
      const tny = unitRadX;
      const ptA = { x: p1.x + tnx * LABEL_TANGENT_LEN, y: p1.y + tny * LABEL_TANGENT_LEN };
      const ptB = { x: p1.x - tnx * LABEL_TANGENT_LEN, y: p1.y - tny * LABEL_TANGENT_LEN };
      const pt = isLeftSide
        ? ptA.x <= ptB.x
          ? ptA
          : ptB
        : ptA.x >= ptB.x
          ? ptA
          : ptB;
      const p2x = pt.x;
      const p2y = pt.y;
      const edgePad = LABEL_EDGE_PAD;
      /** Sol etiket: textAnchor end — labelX metnin sağ kenarı (halkaya yakın). */
      const maxTextRightLeft = cx - ringOuter - DONUT_LABEL_CLEAR;
      /** Sağ etiket: textAnchor start — labelX metnin sol kenarı. */
      const minTextLeftRight = cx + ringOuter + DONUT_LABEL_CLEAR;
      let labelX: number;
      if (isLeftSide) {
        const tightest = Math.min(maxTextRightLeft, p2x - LABEL_MIN_HORIZONTAL_STUB);
        labelX = Math.max(edgePad + estTextW, tightest);
      } else {
        const tightest = Math.max(minTextLeftRight, p2x + LABEL_MIN_HORIZONTAL_STUB);
        labelX = Math.min(canvasSize - edgePad - estTextW, tightest);
      }

      items.push({
        key: `lbl-${slice.label}-${sliceIndex}`,
        slice,
        pct,
        p1,
        p2x,
        p2y,
        labelX,
        baseY: p2y,
        isLeftSide,
        percentLabel,
      });
    });

    const left = items.filter((i) => i.isLeftSide).map((i) => ({ key: i.key, baseY: i.baseY }));
    const right = items.filter((i) => !i.isLeftSide).map((i) => ({ key: i.key, baseY: i.baseY }));
    const yLo = LABEL_EDGE_PAD;
    const yHi = canvasSize - LABEL_EDGE_PAD;
    /** Üstte metin taşmasın; altta ince pay. Eşit dağılım bu bant içinde. */
    const distributeMinY = yLo + LABEL_TEXT_EXTENT_ABOVE_LINE;
    const distributeMaxY = yHi - 4;

    const yByKey = new Map<string, number>();
    distributeLabelYsEvenly(left, distributeMinY, distributeMaxY).forEach((v, k) => yByKey.set(k, v));
    distributeLabelYsEvenly(right, distributeMinY, distributeMaxY).forEach((v, k) => yByKey.set(k, v));

    return items.map((i) => {
      const labelY = yByKey.get(i.key) ?? i.baseY;
      return {
        ...i,
        labelY,
        textY: labelY - LABEL_TEXT_ABOVE_LINE,
      };
    });
  }, [hasData, showLabels, slices, canvasSize, cx, cy, rOuter, i18n.language]);

  const sliceInteractionProps = (sliceIndex: number) => ({
    onPressIn: () => setPressedSliceIndex(sliceIndex),
    onPressOut: () => setPressedSliceIndex((i) => (i === sliceIndex ? null : i)),
    ...(Platform.OS === 'web'
      ? {
          onMouseEnter: () => setPressedSliceIndex(sliceIndex),
          onMouseLeave: () =>
            setPressedSliceIndex((i) => (i === sliceIndex ? null : i)),
        }
      : {}),
  });

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: canvasSize,
          height: canvasSize,
          minWidth: canvasSize,
          minHeight: canvasSize,
        },
      ]}>
      <Animated.View
        style={[{ width: canvasSize, height: canvasSize, position: 'relative' }, chartAnimatedStyle]}>
        <Svg
          width={canvasSize}
          height={canvasSize}
          viewBox={`0 0 ${canvasSize} ${canvasSize}`}
          preserveAspectRatio="xMidYMid meet">
        {!hasData && (
          <Circle
            cx={cx}
            cy={cy}
            r={ringMidRadius}
            stroke={fallbackRingColor}
            strokeWidth={ringStrokeWidth}
            fill="none"
          />
        )}

        {hasData &&
          slices.map(({ slice, pct, start, end }, sliceIndex) => {
            const sweep = end - start;
            const so = segmentDimOpacity(slice);
            const pressed = pressedSliceIndex === sliceIndex;
            const sliceOp = Math.min(1, so * (pressed ? SLICE_PRESS_OPACITY_BOOST : 1));
            const glowBase = segmentGlow ? 0.4 * sliceOp : 0;
            const gTransform = pressed
              ? `translate(${cx}, ${cy}) scale(${SLICE_PRESS_SCALE}) translate(${-cx}, ${-cy})`
              : undefined;
            const isFullRing = sweep >= 359.5 || pct >= 99.95;
            if (isFullRing) {
              const [d1, d2] = describeFullAnnulusTwoHalves(cx, cy, rOuter, rInner);
              const fullRingBody = (
                <>
                  {segmentGlow ? (
                    <>
                      <Path d={d1} fill={slice.color} opacity={0.35} pointerEvents="none" />
                      <Path d={d2} fill={slice.color} opacity={0.35} pointerEvents="none" />
                    </>
                  ) : null}
                  <Path d={d1} fill={slice.color} pointerEvents="none" />
                  <Path d={d2} fill={slice.color} pointerEvents="none" />
                </>
              );
              return (
                <G
                  key={`${slice.label}-${sliceIndex}-full`}
                  opacity={sliceOp}
                  transform={gTransform}
                  {...(onSlicePress != null ? { onPress: () => handleSlicePress(slice) } : {})}
                  {...sliceInteractionProps(sliceIndex)}>
                  {fullRingBody}
                </G>
              );
            }
            if (sweep < 0.5) return null;
            const d = describeAnnularSector(cx, cy, rOuter, rInner, start, end);
            return (
              <G
                key={`${slice.label}-${sliceIndex}`}
                opacity={sliceOp}
                transform={gTransform}
                {...(onSlicePress != null ? { onPress: () => handleSlicePress(slice) } : {})}
                {...sliceInteractionProps(sliceIndex)}>
                {segmentGlow ? (
                  <Path d={d} fill={slice.color} opacity={glowBase} pointerEvents="none" />
                ) : null}
                <Path d={d} fill={slice.color} pointerEvents={onSlicePress != null ? 'auto' : 'none'} />
              </G>
            );
          })}

        {/* Dolu dilimlerin üstüne cam disk + merkez yazı (HTML’deki TOTAL / %) */}
        {hasData && (
          <Circle
            cx={cx}
            cy={cy}
            r={Math.max(4, rInner - 1)}
            fill={innerDiskFill}
            stroke={innerDiskStroke}
            strokeWidth={1}
            pointerEvents="none"
          />
        )}

        {hasData &&
          showLabels &&
          labelLayouts.map((lay) => {
            const leaderPath = buildLeaderPath(
              lay.p1,
              lay.p2x,
              lay.p2y,
              lay.labelX,
              lay.labelY,
              cx,
              cy,
              rInner,
              rOuter,
              lay.isLeftSide,
            );

            return (
              <React.Fragment key={lay.key}>
                <Path
                  d={leaderPath}
                  fill="none"
                  stroke={LEADER_STROKE}
                  strokeWidth={1.25}
                  pointerEvents="none"
                />
                <SvgText
                  x={lay.labelX}
                  y={lay.textY}
                  fill="#ffffff"
                  fontSize={LABEL_FONT_SIZE}
                  fontWeight="500"
                  fontFamily={Fonts.sans}
                  textAnchor={lay.isLeftSide ? 'end' : 'start'}
                  alignmentBaseline="alphabetic"
                  pointerEvents="none">
                  {lay.percentLabel}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>

        <View style={styles.centerIconWrap} pointerEvents={centerContent != null ? 'box-none' : 'none'}>
          {centerContent != null ? (
            <View style={[styles.centerSlot, { maxWidth: rInner * 2 - 8 }]} pointerEvents="box-none">
              {centerContent}
            </View>
          ) : (
            <Image
              source={APP_ICON}
              style={{
                width: centerIconSize,
                height: centerIconSize,
                borderRadius: centerIconSize / 2,
              }}
              resizeMode="cover"
              accessibilityLabel="Omnifolio"
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  centerIconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
