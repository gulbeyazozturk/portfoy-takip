import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const BG = '#000000';
const SURFACE = '#1C1C1E';
const WHITE = '#FFFFFF';
const SLATE = '#AAB0C4';
const PRIMARY = '#2979FF';
const ICON_BG = '#111827';

type AssetItem = { id: string; name: string; symbol: string; price?: number; iconUrl?: string | null };

function Radio({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected && <View style={styles.radioInner} />}
    </View>
  );
}

export default function AssetListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string; label?: string }>();

  const categoryId = params.categoryId ?? 'default';
  const label = params.label ?? 'Varlık';

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    supabase
      .from('assets')
      .select('id, name, symbol, current_price, icon_url')
      .eq('category_id', categoryId)
      .order('symbol', { ascending: true })
      .then(({ data, error: e }) => {
        setLoading(false);
        if (e) {
          setError(e.message);
          setAssets([]);
          return;
        }
        setAssets(
          (data ?? []).map((r: any) => ({
            id: r.id,
            name: r.name,
            symbol: r.symbol,
            price: r.current_price ?? undefined,
            iconUrl: r.icon_url ?? null,
          })),
        );
      });
  }, [categoryId]);

  const filteredAssets = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.name.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')) ||
          a.symbol.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')),
      ),
    [assets, query],
  );

  const selectedAsset = selectedId ? assets.find((a) => a.id === selectedId) : null;

  const handleAdd = () => {
    if (!selectedAsset) return;
    router.push({
      pathname: '/(tabs)/asset-entry',
      params: {
        assetId: selectedAsset.id,
        name: selectedAsset.name,
        symbol: selectedAsset.symbol,
        price: selectedAsset.price != null ? String(selectedAsset.price) : '',
      },
    });
  };

  const title = `${label} arayarak ekleme yapabilirsiniz.`;
  const searchPlaceholder = `${label} Ara...`;

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
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Popüler Varlıklar</Text>
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
              data={filteredAssets}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
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
                      <View>
                        <Text style={styles.rowName}>{item.name}</Text>
                        <Text style={styles.rowSymbol}>{item.symbol}</Text>
                      </View>
                    </View>
                    <Radio selected={selected} />
                  </Pressable>
                );
              }}
            />
          )}

          <View style={styles.bottomWrap}>
            <TouchableOpacity
              style={[styles.addButton, !selectedAsset && styles.addButtonDisabled]}
              onPress={handleAdd}
              disabled={!selectedAsset}
              activeOpacity={0.85}>
              <Text style={styles.addButtonText}>Varlık Ekle</Text>
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
  },
  sectionHeader: { paddingHorizontal: 24, paddingVertical: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: SLATE,
    letterSpacing: 2,
    opacity: 0.6,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ef4444', fontSize: 14 },
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
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
   rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
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
});
