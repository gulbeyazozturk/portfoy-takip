import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { Fonts } from '@/constants/theme';

const CENTER_BG = '#111111';

type SliceData = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  data: SliceData[];
  size?: number;
  strokeWidth?: number;
  showLabels?: boolean;
};

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const describeArc = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) => {
  // Arc from startAngle to endAngle (clockwise sweep) so the drawn slice has the correct size.
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const sweepDeg = endAngle - startAngle;
  const largeArcFlag = sweepDeg <= 180 ? '0' : '1';
  const sweepFlag = '1'; // clockwise so 99% draws ~360° ring, not the small 3.6° arc
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
};

export const UltraDarkDonutChart: React.FC<Props> = ({
  data,
  size = 240,
  strokeWidth = 28,
  showLabels = true,
}) => {
  const safeData = data.filter((d) => d.value > 0);
  const total = safeData.reduce((sum, d) => sum + d.value, 0);
  const labelMargin = 80;
  const canvasSize = size + 2 * labelMargin;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const radius = Math.max(20, size / 2 - strokeWidth);
  let startAngle = -90;

  const hasSlices = total > 0 && safeData.length > 0;
  const fallbackRingColor = '#2a2a2a';

  return (
    <View style={[styles.wrapper, { width: canvasSize, height: canvasSize, minWidth: canvasSize, minHeight: canvasSize }]}>
      <Svg width={canvasSize} height={canvasSize} viewBox={`0 0 ${canvasSize} ${canvasSize}`} preserveAspectRatio="xMidYMid meet">
        {!hasSlices && (
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={fallbackRingColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
        )}
        {hasSlices &&
          safeData.map((slice) => {
            const angle = (slice.value / total) * 360;
            if (angle < 0.5) return null;
            const endAngle = startAngle + angle;
            const d = describeArc(cx, cy, radius, startAngle, endAngle);
            const midAngle = startAngle + angle / 2;
            const ringOuter = radius + strokeWidth;
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
            const percentRaw = slice.value;
            const percentLabel = `${percentRaw.toFixed(2).replace('.', ',')}% ${slice.label.toLocaleUpperCase('tr-TR')}`;
            const leaderPath = `M ${p1.x} ${p1.y} L ${p2x} ${p2y} L ${p3x} ${p3y}`;
            startAngle = endAngle;
            return (
              <React.Fragment key={slice.label}>
                <Path
                  d={d}
                  stroke={slice.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  fill="none"
                />
                {showLabels && (
                  <>
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
                      fontFamily="Inter, system-ui, sans-serif"
                      textAnchor={isLeftSide ? 'start' : 'end'}>
                      {percentLabel}
                    </SvgText>
                  </>
                )}
              </React.Fragment>
            );
          })}
        <Circle cx={cx} cy={cy} r={Math.max(4, radius - 4)} fill={CENTER_BG} />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
