import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Line, Text as SvgText } from 'react-native-svg';

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
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

export const UltraDarkDonutChart: React.FC<Props> = ({
  data,
  size = 240,
  strokeWidth = 28,
  showLabels = true,
}) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - strokeWidth;
  let startAngle = -90;

  return (
    <View style={styles.wrapper}>
      <Svg width={size} height={size}>
        {total > 0 &&
          data.map((slice) => {
            const angle = (slice.value / total) * 360;
            const endAngle = startAngle + angle;
            const d = describeArc(cx, cy, radius, startAngle, endAngle);
            const midAngle = startAngle + angle / 2;
            const p1 = polarToCartesian(cx, cy, radius + strokeWidth / 2, midAngle);
            const p2 = polarToCartesian(cx, cy, radius + strokeWidth + 10, midAngle);
            const labelXOffset = midAngle > 90 && midAngle < 270 ? -24 : 24;
            const labelX = p2.x + labelXOffset;
            const percentLabel = `${((slice.value / (total || 1)) * 100).toFixed(1)}% ${slice.label}`;
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
                    <Line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={slice.color}
                      strokeWidth={1.5}
                      opacity={0.9}
                    />
                    <SvgText
                      x={labelX}
                      y={p2.y}
                      fill="#AAB0C4"
                      fontSize={11}
                      fontWeight="500"
                      textAnchor={labelXOffset < 0 ? 'end' : 'start'}>
                      {percentLabel}
                    </SvgText>
                  </>
                )}
              </React.Fragment>
            );
          })}
        <Circle cx={cx} cy={cy} r={radius - 4} fill={CENTER_BG} />
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
