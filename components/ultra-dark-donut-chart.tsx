import React, { useMemo, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
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

/** Aynı taraftaki etiketlerin üst üste binmesini önlemek için dikey aralık (px); metin çizginin üstünde olduğu için biraz geniş. */
const LABEL_ROW_GAP = 17;
const LABEL_EDGE_PAD = 10;
/** Lider çizginin yatay ucu (labelY); metin tabanı bundan yukarıda — çizgi metnin ortasından geçmesin. */
const LABEL_TEXT_ABOVE_LINE = 10;
const LABEL_FONT_SIZE = 11;
/** Donut dış halkası ile metin kutusu arası minimum boşluk (px). */
const DONUT_LABEL_CLEAR = 16;

/** Yaklaşık metin genişliği (SVG Text, tek satır). */
function estimateLabelTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
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

function packLabelYs(
  group: { baseY: number; key: string }[],
  minY: number,
  maxY: number,
): Map<string, number> {
  if (group.length === 0) return new Map();
  const sorted = [...group].sort((a, b) => a.baseY - b.baseY);
  const ys = sorted.map((s) => s.baseY);
  for (let i = 1; i < ys.length; i++) {
    if (ys[i]! < ys[i - 1]! + LABEL_ROW_GAP) {
      ys[i] = ys[i - 1]! + LABEL_ROW_GAP;
    }
  }
  for (let iter = 0; iter < 12 && ys[ys.length - 1]! > maxY; iter++) {
    const shift = ys[ys.length - 1]! - maxY;
    for (let i = 0; i < ys.length; i++) {
      ys[i]! -= shift;
    }
    for (let i = 1; i < ys.length; i++) {
      if (ys[i]! < ys[i - 1]! + LABEL_ROW_GAP) {
        ys[i] = ys[i - 1]! + LABEL_ROW_GAP;
      }
    }
    if (ys[0]! < minY) {
      for (let i = 0; i < ys.length; i++) {
        ys[i]! += minY - ys[0]!;
      }
    }
  }
  const map = new Map<string, number>();
  sorted.forEach((s, i) => map.set(s.key, ys[i]!));
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
      const radialStep = 24 + Math.min(14, percentLabel.length * 0.28);
      const horizontalLen =
        50 + Math.min(58, Math.max(0, estTextW - 42) * 0.52);
      const unitRadX = (p1.x - cx) / (ringOuter || 1);
      const unitRadY = (p1.y - cy) / (ringOuter || 1);
      const p2x = p1.x + unitRadX * radialStep;
      const p2y = p1.y + unitRadY * radialStep;
      const edgePad = LABEL_EDGE_PAD;
      const maxXLeft = cx - ringOuter - DONUT_LABEL_CLEAR - estTextW;
      const minXRight = cx + ringOuter + DONUT_LABEL_CLEAR + estTextW;
      const candidateLabelX = isLeftSide ? p2x - horizontalLen : p2x + horizontalLen;
      let labelX: number;
      if (isLeftSide) {
        labelX = Math.max(edgePad, candidateLabelX);
        labelX = Math.min(labelX, maxXLeft);
        labelX = Math.max(edgePad, labelX);
      } else {
        labelX = Math.min(canvasSize - edgePad, candidateLabelX);
        labelX = Math.max(labelX, minXRight);
        labelX = Math.min(canvasSize - edgePad, labelX);
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

    const yByKey = new Map<string, number>();
    packLabelYs(left, yLo, yHi).forEach((v, k) => yByKey.set(k, v));
    packLabelYs(right, yLo, yHi).forEach((v, k) => yByKey.set(k, v));

    return items.map((i) => {
      const labelY = yByKey.get(i.key) ?? i.baseY;
      return {
        ...i,
        labelY,
        textY: labelY - LABEL_TEXT_ABOVE_LINE,
      };
    });
  }, [hasData, showLabels, slices, canvasSize, cx, cy, rOuter, i18n.language]);

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
            const glowBase = segmentGlow ? 0.4 * so : 0;
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
              return onSlicePress != null ? (
                <G
                  key={`${slice.label}-${sliceIndex}-full`}
                  opacity={so}
                  onPress={() => handleSlicePress(slice)}>
                  {fullRingBody}
                </G>
              ) : (
                <G key={`${slice.label}-${sliceIndex}-full`} opacity={so}>
                  {fullRingBody}
                </G>
              );
            }
            if (sweep < 0.5) return null;
            const d = describeAnnularSector(cx, cy, rOuter, rInner, start, end);
            return (
              <React.Fragment key={`${slice.label}-${sliceIndex}`}>
                {segmentGlow ? (
                  <Path d={d} fill={slice.color} opacity={glowBase} pointerEvents="none" />
                ) : null}
                <Path
                  d={d}
                  fill={slice.color}
                  opacity={so}
                  {...(onSlicePress != null ? { onPress: () => handleSlicePress(slice) } : {})}
                />
              </React.Fragment>
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
            /** Son segment mutlaka yatay (y = labelY); önce dikey (p2x sabit), sonra yatay. */
            const leaderPath = `M ${lay.p1.x} ${lay.p1.y} L ${lay.p2x} ${lay.p2y} L ${lay.p2x} ${lay.labelY} L ${lay.labelX} ${lay.labelY}`;

            return (
              <React.Fragment key={lay.key}>
                <Path
                  d={leaderPath}
                  fill="none"
                  stroke={lay.slice.color}
                  strokeWidth={1.25}
                  opacity={0.85}
                  pointerEvents="none"
                />
                <SvgText
                  x={lay.labelX}
                  y={lay.textY}
                  fill="#ffffff"
                  fontSize={LABEL_FONT_SIZE}
                  fontWeight="500"
                  fontFamily={Fonts.sans}
                  textAnchor={lay.isLeftSide ? 'start' : 'end'}
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
