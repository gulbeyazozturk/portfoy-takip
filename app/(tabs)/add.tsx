import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const BG_DARK = '#000000';
const SURFACE = '#1A1C24';
const WHITE = '#FFFFFF';
const BORDER = 'rgba(255,255,255,0.10)';
const PRIMARY = '#00e677';

type CategoryRow = {
  id: string;
  name: string;
  subtitle: string | null;
  sort_order: number;
  icon: string;
  color: string;
};

const CATEGORY_ICON_COLOR: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  yurtdisi: { icon: 'globe-outline', color: '#60A5FA' },
  bist: { icon: 'stats-chart-outline', color: '#C084FC' },
  doviz: { icon: 'cash-outline', color: '#4ADE80' },
  emtia: { icon: 'flame-outline', color: '#FB923C' },
  fon: { icon: 'layers-outline', color: '#2DD4BF' },
  kripto: { icon: 'logo-bitcoin', color: '#F472B6' },
  mevduat: { icon: 'wallet-outline', color: '#FFD700' },
};

export default function AddScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name, subtitle, sort_order')
      .order('sort_order', { ascending: true })
      .then(({ data, error: e }) => {
        setLoading(false);
        if (e) {
          setError(e.message);
          return;
        }
        setCategories(
          (data ?? []).map((row) => ({
            ...row,
            subtitle: row.subtitle ?? '',
            icon: CATEGORY_ICON_COLOR[row.id]?.icon ?? 'ellipse-outline',
            color: CATEGORY_ICON_COLOR[row.id]?.color ?? '#94A3B8',
          })) as CategoryRow[],
        );
      });
  }, []);

  const filteredList = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return categories;

    return categories.filter(
      (c) =>
        c.name.toLocaleLowerCase('tr-TR').includes(q) ||
        (c.subtitle && c.subtitle.toLocaleLowerCase('tr-TR').includes(q)),
    );
  }, [categories, query]);

  // Ekran her odaklandığında arama kutusunu temizle
  useFocusEffect(
    React.useCallback(() => {
      setQuery('');
    }, []),
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={WHITE} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Hangi varlık türünü arıyorsunuz?</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Varlık ara..."
              placeholderTextColor="#64748B"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredList}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/asset-list',
                    params: { categoryId: item.id, label: item.name },
                  })
                }>
                <View style={styles.rowLeft}>
                  <View style={[styles.iconTile, { backgroundColor: `${item.color}33` }]}>
                    <Ionicons name={item.icon as any} size={24} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    <Text style={styles.rowSubtitle}>{item.subtitle || ''}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#475569" />
              </TouchableOpacity>
            )}
            ListFooterComponent={
              <View style={styles.footerWrap}>
                <View style={styles.helpCard}>
                  <Text style={styles.helpTitle} numberOfLines={2}>
                    Portföyünüzü dosya ile toplu olarak yüklemek ister misiniz?
                  </Text>
                  <TouchableOpacity
                    style={styles.helpButton}
                    activeOpacity={0.8}
                    onPress={() => router.push('/bulk-upload')}
                  >
                    <Text style={styles.helpButtonText}>Devam et</Text>
                  </TouchableOpacity>
                </View>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_DARK },
  safe: { flex: 1, backgroundColor: BG_DARK },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  headerTitleWrap: { flex: 1, paddingHorizontal: 12 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: WHITE,
    lineHeight: 22,
  },
  headerRight: { width: 40 },
  searchWrap: { paddingHorizontal: 24, marginBottom: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchInput: {
    flex: 1,
    color: WHITE,
    fontSize: 14,
    paddingVertical: 0,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ef4444', fontSize: 14 },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 8,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 16, fontWeight: '500', color: WHITE },
  rowSubtitle: { fontSize: 12, color: '#64748B', marginTop: 3 },
  footerWrap: { paddingTop: 12, paddingBottom: 12 },
  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(0, 230, 119, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 119, 0.20)',
    borderRadius: 16,
    padding: 16,
  },
  helpTitle: { flex: 1, color: PRIMARY, fontSize: 14, fontWeight: '600' },
  helpButton: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  helpButtonText: { color: BG_DARK, fontSize: 13, fontWeight: '600' },
});
