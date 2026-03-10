import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

import { PortfolioDonutChart } from '@/components/portfolio-donut-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type AssetGroup = {
  id: string;
  title: string;
  total: number;
  dailyChangePct: number;
};

const ASSET_GROUPS: AssetGroup[] = [
  { id: 'usd', title: 'ABD', total: 120000, dailyChangePct: 0.8 },
  { id: 'bist', title: 'BIST', total: 85000, dailyChangePct: -0.4 },
  { id: 'fx', title: 'Döviz', total: 60000, dailyChangePct: 0.2 },
  { id: 'commodity', title: 'Emtia', total: 45000, dailyChangePct: 1.1 },
  { id: 'fund', title: 'Fon', total: 70000, dailyChangePct: 0.6 },
  { id: 'crypto', title: 'Kripto', total: 30000, dailyChangePct: -2.3 },
  { id: 'cash', title: 'TL', total: 15000, dailyChangePct: 0.0 },
];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HomeScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const donutData = useMemo(
    () =>
      ASSET_GROUPS.map((g, index) => ({
        label: g.title,
        value: g.total,
        color: ['#4ade80', '#60a5fa', '#fbbf24', '#f97316', '#a855f7', '#22c55e', '#0ea5e9'][
          index % 7
        ],
      })),
    [],
  );

  const totalBalance = ASSET_GROUPS.reduce((sum, g) => sum + g.total, 0);
  const weightedDailyChange =
    totalBalance > 0
      ? ASSET_GROUPS.reduce(
          (acc, g) => acc + (g.total * g.dailyChangePct) / totalBalance,
          0,
        )
      : 0;
  const isDailyPositive = weightedDailyChange >= 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container} lightColor="#4a4e69" darkColor="#4a4e69">
        <ScrollView contentContainerStyle={styles.content}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <ThemedText type="title" style={styles.logoText}>
              Portföy
            </ThemedText>
            <View style={styles.topBarButtons}>
              <TouchableOpacity style={styles.chip}>
                <ThemedText style={styles.chipText}>TL</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chip}>
                <ThemedText style={styles.chipText}>A-Z</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chip}>
                <Ionicons name="eye-outline" size={16} color="#111827" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Donut chart + toplam bakiye */}
          <View style={styles.chartCard}>
            <PortfolioDonutChart data={donutData} />
            <View style={styles.totalArea}>
              <ThemedText style={styles.totalLabel}>Toplam bakiye</ThemedText>
              <ThemedText type="title" style={styles.totalValue}>
                {totalBalance.toLocaleString('tr-TR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                TL
              </ThemedText>
              <View
                style={[
                  styles.dailyBadge,
                  isDailyPositive ? styles.dailyBadgePositive : styles.dailyBadgeNegative,
                ]}>
                <ThemedText style={styles.dailyBadgeText}>
                  {isDailyPositive ? '+' : ''}
                  {weightedDailyChange.toFixed(2)}%
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Varlık sınıfları accordion listesi */}
          {ASSET_GROUPS.map((group, index) => {
            const isExpanded = expandedId === group.id;
            const isPositive = group.dailyChangePct >= 0;

            const toggle = () => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setExpandedId((prev) => (prev === group.id ? null : group.id));
            };

            const headerColor = '#9a9fa6';

            return (
              <View key={group.id} style={styles.assetSection}>
                <TouchableOpacity
                  style={[styles.assetHeader, { backgroundColor: headerColor }]}
                  activeOpacity={0.8}
                  onPress={toggle}>
                  <ThemedText type="defaultSemiBold" style={styles.assetTitle}>
                    {group.title}
                  </ThemedText>
                  <View style={styles.assetRight}>
                    <ThemedText style={styles.assetAmount}>
                      {group.total.toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      TL
                    </ThemedText>
                    <View
                      style={[
                        styles.assetChangeBadge,
                        isPositive ? styles.assetChangePositive : styles.assetChangeNegative,
                      ]}>
                      <ThemedText style={styles.assetChangeText}>
                        {isPositive ? '+' : ''}
                        {group.dailyChangePct.toFixed(2)}%
                      </ThemedText>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                      size={18}
                      color="#111827"
                      style={{ marginLeft: 6 }}
                    />
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.assetBody}>
                    <ThemedText>
                      Bu alana {group.title} için detaylı enstrüman listesi daha sonra gelecek.
                    </ThemedText>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#4a4e69',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  logoText: {
    marginRight: 8,
  },
  topBarButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  chipText: {
    fontSize: 12,
  },
  chartCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  totalArea: {
    alignItems: 'center',
    marginTop: 8,
  },
  totalLabel: {
    opacity: 0.9,
    marginBottom: 4,
  },
  totalValue: {
    marginBottom: 4,
  },
  dailyBadge: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dailyBadgePositive: {
    backgroundColor: '#bbf7d0',
  },
  dailyBadgeNegative: {
    backgroundColor: '#fecaca',
  },
  dailyBadgeText: {
    fontSize: 13,
  },
  assetSection: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
  },
  assetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  assetTitle: {
    color: '#ffffff',
  },
  assetRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assetAmount: {
    marginRight: 8,
    color: '#ffffff',
  },
  assetChangeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  assetChangePositive: {
    backgroundColor: '#bbf7d0',
  },
  assetChangeNegative: {
    backgroundColor: '#fecaca',
  },
  assetChangeText: {
    fontSize: 12,
    color: '#111827',
  },
  assetBody: {
    backgroundColor: '#d6d8db',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});