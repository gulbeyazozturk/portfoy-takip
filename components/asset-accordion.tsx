import React, { useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type AssetItem = {
  id: string;
  symbol: string;
  unitPrice: number;
  amount: number;
  dailyChangePct: number;
};

type Props = {
  title: string;
  totalBalance: number;
  items: AssetItem[];
};

export const AssetAccordion: React.FC<Props> = ({ title, totalBalance, items }) => {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const renderItem = ({ item }: { item: AssetItem }) => {
    const isPositive = item.dailyChangePct >= 0;

    return (
      <View style={styles.row}>
        <View style={styles.leftCol}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          <Text style={styles.unitPrice}>
            {item.unitPrice.toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            TL
          </Text>
        </View>

        <View style={styles.rightCol}>
          <Text style={styles.amount}>{item.amount}</Text>
          <View
            style={[
              styles.badge,
              isPositive ? styles.badgePositive : styles.badgeNegative,
            ]}>
            <Text style={styles.badgeText}>
              {isPositive ? '+' : ''}
              {item.dailyChangePct.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.8}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.total}>
            {totalBalance.toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            TL
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={20}
            color="#ffffff"
            style={{ marginLeft: 8 }}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.contentCard}>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={renderItem}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  total: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  contentCard: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  leftCol: {
    flex: 1,
  },
  rightCol: {
    alignItems: 'flex-end',
  },
  symbol: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  unitPrice: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  badge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgePositive: {
    backgroundColor: '#dcfce7',
  },
  badgeNegative: {
    backgroundColor: '#fee2e2',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
  },
});

