import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Fonts } from '@/constants/theme';

export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

type UltraDarkDonutChartProps = {
  data: DonutSlice[];
  size?: number;
  /** Halka kalınlığı (iç yarıçap = dış − strokeWidth). */
  strokeWidth?: number;
  showLabels?: boolean;
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

export const UltraDarkDonutChart: React.FC<UltraDarkDonutChartProps> = ({
  data,
  size = 240,
  strokeWidth = 28,
  showLabels = true,
}) => {
  const { t, i18n } = useTranslation();
  const labelMargin = 80;
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

  const pctSumRounded = useMemo(
    () => (hasData ? Math.round(slices.reduce((s, x) => s + x.pct, 0)) : 0),
    [hasData, slices],
  );
  const centerPctLabel = hasData ? `${Math.min(100, pctSumRounded)}%` : '—';

  const useCommaDecimal = i18n.language?.startsWith('tr');

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
            const isFullRing = sweep >= 359.5 || pct >= 99.95;
            if (isFullRing) {
              const [d1, d2] = describeFullAnnulusTwoHalves(cx, cy, rOuter, rInner);
              return (
                <React.Fragment key={`${slice.label}-${sliceIndex}-full`}>
                  <Path d={d1} fill={slice.color} />
                  <Path d={d2} fill={slice.color} />
                </React.Fragment>
              );
            }
            if (sweep < 0.5) return null;
            return (
              <Path
                key={`${slice.label}-${sliceIndex}`}
                d={describeAnnularSector(cx, cy, rOuter, rInner, start, end)}
                fill={slice.color}
              />
            );
          })}

        {/* Dolu dilimlerin üstüne cam disk + merkez yazı (HTML’deki TOTAL / %) */}
        {hasData && (
          <Circle
            cx={cx}
            cy={cy}
            r={Math.max(4, rInner - 1)}
            fill="rgba(255,255,255,0.06)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        )}

        {hasData && (
          <>
            <SvgText
              x={cx}
              y={cy - 6}
              fill="#64748b"
              fontSize={10}
              fontWeight="700"
              fontFamily={Fonts.sans}
              textAnchor="middle"
              letterSpacing={2}>
              {t('portfolio.donutTotal')}
            </SvgText>
            <SvgText
              x={cx}
              y={cy + 22}
              fill="#ffffff"
              fontSize={28}
              fontWeight="700"
              fontFamily={Fonts.sans}
              textAnchor="middle">
              {centerPctLabel}
            </SvgText>
          </>
        )}

        {hasData &&
          showLabels &&
          slices.map(({ slice, pct, start, end }, sliceIndex) => {
            const angle = end - start;
            if (angle < 0.5) return null;
            const midAngle = start + angle / 2;
            const ringOuter = rOuter;
            const p1 = polarToCartesian(cx, cy, ringOuter, midAngle);
            const isLeftSide = midAngle > 90 && midAngle < 270;
            const radialStep = 20;
            const horizontalLen = 55;
            const horizontalDir = isLeftSide ? -1 : 1;
            const unitRadX = (p1.x - cx) / (ringOuter || 1);
            const unitRadY = (p1.y - cy) / (ringOuter || 1);
            const p2x = p1.x + unitRadX * radialStep;
            const p2y = p1.y + unitRadY * radialStep;
            const p3x = p2x + horizontalDir * horizontalLen;
            const p3y = p2y;
            const labelX = p3x;
            const pctStr = pct.toFixed(1);
            const percentLabel = `${useCommaDecimal ? pctStr.replace('.', ',') : pctStr}% ${slice.label.toLocaleUpperCase('tr-TR')}`;
            const leaderPath = `M ${p1.x} ${p1.y} L ${p2x} ${p2y} L ${p3x} ${p3y}`;

            return (
              <React.Fragment key={`lbl-${slice.label}-${sliceIndex}`}>
                <Path
                  d={leaderPath}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={1.25}
                  opacity={0.85}
                />
                <SvgText
                  x={labelX}
                  y={p3y}
                  fill="#ffffff"
                  fontSize={11}
                  fontWeight="500"
                  fontFamily={Fonts.sans}
                  textAnchor={isLeftSide ? 'start' : 'end'}>
                  {percentLabel}
                </SvgText>
              </React.Fragment>
            );
          })}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
