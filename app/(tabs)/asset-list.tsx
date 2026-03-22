import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  View,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resolveBistDisplayName } from '@/lib/bist-display-name';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

const BG = '#000000';
const SURFACE = '#1C1C1E';
const WHITE = '#FFFFFF';
const SLATE = '#AAB0C4';
const PRIMARY = '#2979FF';
const ICON_BG = '#111827';

const PAGE_SIZE = 500;

type AssetItem = { id: string; name: string; symbol: string; price?: number; iconUrl?: string | null };

function Radio({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected && <View style={styles.radioInner} />}
    </View>
  );
}

export default function AssetListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string; label?: string; _t?: string }>();

  const categoryId = params.categoryId ?? 'default';
  const label = params.label ?? t('assetList.defaultLabel');

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setQuery('');
    setSelectedId(null);
  }, [params._t]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanSymbol = (s: string) => s.replace(/^M\d+_/, '');

  const mapRow = (r: any): AssetItem => {
    const sym = cleanSymbol(r.symbol);
    return {
      id: r.id,
      name: categoryId === 'bist' ? resolveBistDisplayName(sym, r.name) : r.name,
      symbol: sym,
      price: r.current_price ?? undefined,
      iconUrl: r.icon_url ?? null,
    };
  };

  const buildQuery = useCallback(
    (searchText: string, from: number, to: number) => {
      let q = supabase
        .from('assets')
        .select('id, name, symbol, current_price, icon_url')
        .eq('category_id', categoryId)
        .order('symbol', { ascending: true })
        .range(from, to);

      if (searchText.trim().length > 0) {
        const term = `%${searchText.trim()}%`;
        q = q.or(`symbol.ilike.${term},name.ilike.${term}`);
      }

      return q;
    },
    [categoryId],
  );

  const fetchInitial = useCallback(
    async (searchText: string) => {
      setLoading(true);
      setError(null);
      setHasMore(true);

      try {
        const [{ count }, { data, error: e }] = await Promise.all([
          supabase
            .from('assets')
            .select('id', { count: 'exact', head: true })
            .eq('category_id', categoryId),
          buildQuery(searchText, 0, PAGE_SIZE - 1),
        ]);

        if (e) {
          setError(e.message);
          setAssets([]);
          return;
        }

        const mapped = (data ?? []).map(mapRow);
        setAssets(mapped);
        setTotalCount(count);
        setHasMore(mapped.length === PAGE_SIZE);
      } finally {
        setLoading(false);
      }
    },
    [categoryId, buildQuery],
  );

  useEffect(() => {
    fetchInitial('');
  }, [fetchInitial]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchInitial(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchInitial]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const from = assets.length;
      const to = from + PAGE_SIZE - 1;
      const { data, error: e } = await buildQuery(query, from, to);

      if (e || !data) return;

      const mapped = data.map(mapRow);
      setAssets((prev) => [...prev, ...mapped]);
      setHasMore(mapped.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, assets.length, query, buildQuery]);

  const selectedAsset = selectedId ? assets.find((a) => a.id === selectedId) : null;

  const handleAdd = () => {
    if (!selectedAsset) return;
    router.push({
      pathname: '/(tabs)/asset-entry',
      params: {
        returnTo: '/(tabs)/asset-list',
        returnCategoryId: categoryId,
        returnLabel: label,
        assetId: selectedAsset.id,
        name: selectedAsset.name,
        symbol: selectedAsset.symbol,
        categoryId,
        price: selectedAsset.price != null ? String(selectedAsset.price) : '',
      },
    });
  };

  const title = t('assetList.title', { label });
  const searchPlaceholder = t('assetList.searchPlaceholder', { label });

  const countLabel = useMemo(() => {
    if (totalCount == null) return '';
    const showing = assets.length;
    if (query.trim()) return t('assetList.countResults', { n: showing });
    return t('assetList.countShowing', { showing, total: totalCount });
  }, [totalCount, assets.length, query, t]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}>
          <View style={styles.topSection}>
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={12}
              style={styles.backBtn}>
              <Ionicons name="arrow-back" size={26} color={WHITE} />
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
          </View>

          <View style={styles.searchWrap}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={SLATE} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={`${SLATE}80`}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={SLATE} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {query.trim() ? t('assetList.sectionSearch') : t('assetList.sectionAll')}
            </Text>
            {countLabel ? <Text style={styles.countLabel}>{countLabel}</Text> : null}
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : assets.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{t('assetList.empty')}</Text>
            </View>
          ) : (
            <FlatList
              data={assets}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              initialNumToRender={30}
              maxToRenderPerBatch={30}
              windowSize={11}
              getItemLayout={(_data, index) => ({
                length: 68,
                offset: 68 * index,
                index,
              })}
              renderItem={({ item }) => {
                const selected = selectedId === item.id;
                return (
                  <Pressable
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => setSelectedId(item.id)}>
                    <View style={styles.rowLeft}>
                      <View style={styles.iconCircle}>
                        {item.iconUrl ? (
                          <Image
                            source={{ uri: item.iconUrl }}
                            style={styles.iconImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={styles.iconFallback}>{item.symbol.charAt(0).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={styles.rowTextWrap}>
                        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.rowSymbol}>{item.symbol}</Text>
                      </View>
                    </View>
                    <Radio selected={selected} />
                  </Pressable>
                );
              }}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color={PRIMARY} />
                    <Text style={styles.footerText}>{t('assetList.loadMore')}</Text>
                  </View>
                ) : null
              }
            />
          )}

          <View style={styles.bottomWrap}>
            <TouchableOpacity
              style={[styles.addButton, !selectedAsset && styles.addButtonDisabled]}
              onPress={handleAdd}
              disabled={!selectedAsset}
              activeOpacity={0.85}>
              <Text style={styles.addButtonText}>{t('assetList.goToDetail')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bottomSpacer} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1, backgroundColor: BG },
  kav: { flex: 1 },
  topSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
    gap: 16,
  },
  backBtn: { alignSelf: 'flex-start' },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: WHITE,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  searchWrap: { paddingHorizontal: 24, paddingVertical: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    backgroundColor: SURFACE,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: WHITE,
    fontSize: 16,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : {}),
  },
  sectionHeader: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: SLATE,
    letterSpacing: 2,
    opacity: 0.6,
  },
  countLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: SLATE,
    opacity: 0.5,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ef4444', fontSize: 14 },
  emptyText: { color: SLATE, fontSize: 15 },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    height: 68,
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowTextWrap: { flex: 1 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ICON_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  iconFallback: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
  },
  rowName: { fontSize: 16, fontWeight: '600', color: WHITE },
  rowSymbol: { fontSize: 14, fontWeight: '500', color: SLATE, marginTop: 2, opacity: 0.7 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: PRIMARY },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PRIMARY,
  },
  bottomWrap: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  addButton: {
    width: '100%',
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
  },
  bottomSpacer: { height: 32, backgroundColor: BG },
  footerLoader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 13,
    color: SLATE,
  },
});
