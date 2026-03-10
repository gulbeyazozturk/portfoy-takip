import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type AssetRow = {
  id: string;
  name: string;
  price: number;
  changePct: number;
};

const MOCK_ASSETS: Record<string, AssetRow[]> = {
  commodity: [
    { id: '1', name: 'Gram Altın', price: 7183.73, changePct: -1.1 },
    { id: '2', name: 'Has Altın', price: 7200.0, changePct: 0.3 },
    { id: '3', name: 'Bilezik 22 Ayar', price: 7050.5, changePct: -0.4 },
  ],
  fx: [
    { id: '4', name: 'USD', price: 34.25, changePct: 0.2 },
    { id: '5', name: 'EUR', price: 37.8, changePct: -0.1 },
  ],
  default: [
    { id: '6', name: 'Örnek Varlık 1', price: 100.0, changePct: 0.5 },
    { id: '7', name: 'Örnek Varlık 2', price: 200.0, changePct: -0.7 },
  ],
};

export default function AssetListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string; label?: string }>();

  const categoryId = params.categoryId ?? 'default';
  const label = params.label ?? 'Varlıklar';

  const [query, setQuery] = useState('');

  const allAssets = useMemo<AssetRow[]>(() => {
    if (categoryId in MOCK_ASSETS) return MOCK_ASSETS[categoryId];
    return MOCK_ASSETS.default;
  }, [categoryId]);

  const filteredAssets = useMemo(
    () =>
      allAssets.filter((asset) =>
        asset.name.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')),
      ),
    [allAssets, query],
  );

  const renderItem = ({ item }: { item: AssetRow }) => {
    const isPositive = item.changePct >= 0;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() =>
          router.push({
            pathname: '/(tabs)/asset-entry',
            params: { assetId: item.id, name: item.name, price: String(item.price) },
          })
        }>
        <View style={styles.rowLeft}>
          <View style={styles.assetIconCircle}>
            <Ionicons name="ellipsis-horizontal" size={16} color="#f9fafb" />
          </View>
          <ThemedText style={styles.assetName}>{item.name}</ThemedText>
        </View>
        <View style={styles.rowRight}>
          <ThemedText style={styles.assetPrice}>
            {item.price.toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            TL
          </ThemedText>
          <ThemedText
            style={[
              styles.assetChange,
              isPositive ? styles.assetChangePositive : styles.assetChangeNegative,
            ]}>
            {isPositive ? '▲' : '▼'} %{Math.abs(item.changePct).toFixed(1)}
          </ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#e5e7eb" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container} lightColor="#4a4e69" darkColor="#4a4e69">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={22} color="#f9fafb" />
          </TouchableOpacity>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            {label}
          </ThemedText>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconButton}>
              <ThemedText style={styles.headerIconText}>TL</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton}>
              <Ionicons name="star-outline" size={18} color="#f9fafb" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color="#6b7280" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Varlık ara"
            placeholderTextColor="#9ca3af"
            value={query}
            onChangeText={setQuery}
          />
        </View>

        {/* Asset list */}
        <FlatList
          data={filteredAssets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={renderItem}
        />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  headerTitle: {
    color: '#f9fafb',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  headerIconText: {
    fontSize: 12,
    color: '#f9fafb',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#d6d8db',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
    color: '#111827',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  assetIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetName: {
    color: '#f9fafb',
  },
  rowRight: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  assetPrice: {
    color: '#f9fafb',
    fontWeight: '600',
  },
  assetChange: {
    marginTop: 2,
    fontSize: 12,
  },
  assetChangePositive: {
    color: '#4ade80',
  },
  assetChangeNegative: {
    color: '#f97373',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(249,250,251,0.2)',
  },
});

