import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const ITEM_H = 40;
const VISIBLE_ROWS = 5;
const WHEEL_H = ITEM_H * VISIBLE_ROWS;

type Props = {
  value: Date;
  maximumDate?: Date;
  locale: string;
  onChange: (date: Date) => void;
};

function clampDate(d: Date, max?: Date): Date {
  if (!max) return d;
  return d.getTime() > max.getTime() ? max : d;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function JsDatePickerWheels({ value, maximumDate, locale, onChange }: Props) {
  const dayRef = useRef<ScrollView>(null);
  const monthRef = useRef<ScrollView>(null);
  const yearRef = useRef<ScrollView>(null);

  const max = maximumDate ?? new Date();
  const maxYear = max.getFullYear();

  const months = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => ({
      index: i,
      label: fmt.format(new Date(2020, i, 1)),
    }));
  }, [locale]);

  const years = useMemo(
    () => Array.from({ length: maxYear - 1900 + 1 }, (_, i) => 1900 + i),
    [maxYear],
  );

  const year = value.getFullYear();
  const month = value.getMonth();
  const day = value.getDate();
  const maxDay = daysInMonth(year, month);

  const days = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => i + 1),
    [maxDay],
  );

  const emit = useCallback(
    (y: number, m: number, d: number) => {
      const dim = daysInMonth(y, m);
      const safeDay = Math.min(d, dim);
      onChange(clampDate(new Date(y, m, safeDay, 12, 0, 0, 0), maximumDate));
    },
    [maximumDate, onChange],
  );

  useEffect(() => {
    const y = (index: number) => ({ y: index * ITEM_H, animated: false as const });
    dayRef.current?.scrollTo(y(Math.min(day, maxDay) - 1));
    monthRef.current?.scrollTo(y(month));
    yearRef.current?.scrollTo(y(Math.max(0, years.indexOf(year))));
  }, [day, month, year, maxDay, years]);

  const onScrollEnd =
    (field: 'day' | 'month' | 'year') => (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
      if (field === 'day') {
        const nextDay = days[Math.min(Math.max(index, 0), days.length - 1)] ?? day;
        emit(year, month, nextDay);
      } else if (field === 'month') {
        const nextMonth = Math.min(Math.max(index, 0), 11);
        emit(year, nextMonth, day);
      } else {
        const nextYear = years[Math.min(Math.max(index, 0), years.length - 1)] ?? year;
        emit(nextYear, month, day);
      }
    };

  const pad = (n: number) => (
    <View key={`pad-${n}`} style={styles.pad} />
  );

  const renderColumn = (
    items: { key: string; label: string; index: number }[] | number[],
    selectedIndex: number,
    field: 'day' | 'month' | 'year',
    ref: React.RefObject<ScrollView | null>,
  ) => (
    <View style={styles.column}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={styles.scrollContent}
        onMomentumScrollEnd={onScrollEnd(field)}
        onScrollEndDrag={onScrollEnd(field)}>
        {Array.from({ length: Math.floor(VISIBLE_ROWS / 2) }).map((_, i) => pad(i))}
        {items.map((item, i) => {
          const label = typeof item === 'number' ? String(item) : item.label;
          const active = i === selectedIndex;
          return (
            <View key={typeof item === 'number' ? item : item.key} style={styles.item}>
              <Text style={[styles.itemText, active && styles.itemTextActive]}>{label}</Text>
            </View>
          );
        })}
        {Array.from({ length: Math.floor(VISIBLE_ROWS / 2) }).map((_, i) => pad(100 + i))}
      </ScrollView>
      <View style={styles.highlight} pointerEvents="none" />
    </View>
  );

  return (
    <View style={styles.root}>
      {renderColumn(days, Math.min(day, maxDay) - 1, 'day', dayRef)}
      {renderColumn(
        months.map((m) => ({ key: String(m.index), label: m.label, index: m.index })),
        month,
        'month',
        monthRef,
      )}
      {renderColumn(years, year - 1900, 'year', yearRef)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: WHEEL_H,
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  column: {
    flex: 1,
    height: WHEEL_H,
    position: 'relative',
  },
  scrollContent: {
    paddingVertical: 0,
  },
  pad: {
    height: ITEM_H * 2,
  },
  item: {
    height: ITEM_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.35)',
  },
  itemTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  highlight: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: ITEM_H * 2,
    height: ITEM_H,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
