import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePortfolio } from '@/context/portfolio';
import { supabase } from '@/lib/supabase';

const MOCK_POINTS = [10, 14, 13, 18, 16, 20, 19];

export default function AssetEntryScreen() {
  const router = useRouter();
  const { portfolioId } = usePortfolio();
  const params = useLocalSearchParams<{
    returnTo?: string;
    returnCategoryId?: string;
    returnLabel?: string;
    holdingId?: string;
    assetId?: string;
    name?: string;
    symbol?: string;
    categoryId?: string;
    price?: string;
    quantity?: string;
    avgPrice?: string;
  }>();

  const holdingId = params.holdingId as string | undefined;
  const assetId = params.assetId as string | undefined;
  const name = params.name ?? 'Varlık';
  const symbol = params.symbol ?? '';
  const categoryId = params.categoryId as string | undefined;
  const returnTo = params.returnTo as string | undefined;
  const returnCategoryId = params.returnCategoryId as string | undefined;
  const returnLabel = params.returnLabel as string | undefined;
  const currentPrice = params.price ? Number(params.price) : 0;

  const handleBack = () => {
    if (returnTo === '/(tabs)/asset-list' && returnCategoryId != null) {
      router.replace({
        pathname: '/(tabs)/asset-list',
        params: { categoryId: returnCategoryId, label: returnLabel ?? '' },
      });
      return;
    }
    if (returnTo === '/(tabs)/index') {
      router.replace('/(tabs)');
      return;
    }
    router.back();
  };

  const amountUnitLabel = useMemo(() => {
    if (categoryId === 'doviz') return symbol || '—';
    if (categoryId === 'emtia') {
      if (['XAU', 'XAG', 'XPT', 'XPD'].includes(symbol)) return symbol;
      const s = (symbol ?? '').toUpperCase();
      if (s.includes('22_AYAR') && s.includes('BILEZIK')) return 'Gram';
      if (s.includes('14_AYAR') || s.includes('18_AYAR')) return 'Gram';
      return 'Adet';
    }
    return symbol || 'Adet';
  }, [categoryId, symbol]);

  const [amount, setAmount] = useState(() => (params.quantity as string | undefined) ?? '');
  const [unitPrice, setUnitPrice] = useState(() => (params.avgPrice as string | undefined) ?? '');
  const [saving, setSaving] = useState(false);

  // Ekran her açıldığında form alanlarını route parametrelerine göre sıfırla
  useEffect(() => {
    setAmount((params.quantity as string | undefined) ?? '');
    setUnitPrice((params.avgPrice as string | undefined) ?? '');
  }, [params.quantity, params.avgPrice, holdingId, assetId]);

  const linePath = useMemo(() => {
    const width = 260;
    const height = 120;
    const max = Math.max(...MOCK_POINTS);
    const min = Math.min(...MOCK_POINTS);
    const range = max - min || 1;
    const stepX = width / (MOCK_POINTS.length - 1);

    const points = MOCK_POINTS.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 10) - 5;
      return { x, y };
    });

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }

    const last = points[points.length - 1];
    d += ` L ${last.x} ${height} L 0 ${height} Z`;

    return { d, width, height };
  }, []);

  const handleSave = async () => {
    const qty = parseFloat(amount?.replace(',', '.') ?? '0');
    if (!assetId || !portfolioId) {
      Alert.alert('Hata', 'Portföy veya varlık bilgisi eksik.');
      return;
    }
    if (!qty || qty <= 0) {
      Alert.alert('Hata', 'Geçerli bir miktar girin.');
      return;
    }
    const avg = unitPrice ? parseFloat(unitPrice.replace(',', '.')) : null;
    setSaving(true);
    let error;
    if (holdingId) {
      ({ error } = await supabase
        .from('holdings')
        .update({
          quantity: qty,
          avg_price: avg,
        })
        .eq('id', holdingId));
    } else {
      ({ error } = await supabase.from('holdings').insert({
        portfolio_id: portfolioId,
        asset_id: assetId,
        quantity: qty,
        avg_price: avg,
      }));
    }
    setSaving(false);
    if (error) {
      Alert.alert('Kayıt hatası', error.message);
      return;
    }
    if (returnTo === '/(tabs)/asset-list' && returnCategoryId != null) {
      router.replace({
        pathname: '/(tabs)/asset-list',
        params: { categoryId: returnCategoryId, label: returnLabel ?? '', _t: Date.now().toString() },
      });
    } else {
      router.replace('/(tabs)');
    }
  };

  const performDelete = async () => {
    if (!holdingId) return;
    setSaving(true);
    const { error } = await supabase.from('holdings').delete().eq('id', holdingId);
    setSaving(false);
    if (error) {
      if (Platform.OS === 'web') {
        window.alert('Silme hatası: ' + error.message);
      } else {
        Alert.alert('Silme hatası', error.message);
      }
      return;
    }
    router.replace('/(tabs)');
  };

  const handleDelete = () => {
    if (!holdingId) return;
    if (Platform.OS === 'web') {
      if (window.confirm(`${name} kaydını silmek istiyor musun?`)) {
        performDelete();
      }
    } else {
      Alert.alert('Varlığı sil', `${name} kaydını silmek istiyor musun?`, [
        { text: 'İptal', style: 'cancel' },
        { text: 'SİL', style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container} lightColor="#000000" darkColor="#000000">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={22} color="#f9fafb" />
          </TouchableOpacity>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            {name}
          </ThemedText>
          <View style={{ width: 32 }} />
        </View>

        {/* Grafik alanı */}
        <View style={styles.chartArea}>
          {/* Sağ üst bilgi kartı */}
          <View style={styles.infoCard}>
            <ThemedText style={styles.infoLabel}>Güncel Fiyat</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.infoValue}>
              {currentPrice
                ? `${currentPrice.toLocaleString('tr-TR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} TL`
                : '-'}
            </ThemedText>
            <ThemedText style={styles.infoChange}>+1,2% (örnek)</ThemedText>
          </View>

          {/* Line chart */}
          <View style={styles.chartWrapper}>
            <Svg width={linePath.width} height={linePath.height}>
              <Defs>
                <LinearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#60a5fa" stopOpacity="0.8" />
                  <Stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path d={linePath.d} fill="url(#lineGradient)" stroke="#60a5fa" strokeWidth={2} />
            </Svg>
          </View>

          {/* Periyot ve TL butonları */}
          <View style={styles.periodRow}>
            <TouchableOpacity style={styles.periodButton}>
              <ThemedText style={styles.periodText}>Son 7 Gün</ThemedText>
              <Ionicons
                name="chevron-down-outline"
                size={14}
                color="#e5e7eb"
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.periodButton}>
              <ThemedText style={styles.periodText}>TL</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form alanı */}
        <View style={styles.formContainer}>
          <View style={styles.formTitleRow}>
            <ThemedText style={styles.formTitle}>Varlık Gir | PORTFÖY_1</ThemedText>
            {holdingId ? (
              <Pressable
                style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
                onPress={handleDelete}
                disabled={saving}>
                <ThemedText style={styles.deleteButtonText}>SİL</ThemedText>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.formCard}>
            {/* Miktar */}
            <View style={styles.fieldRow}>
              <ThemedText style={styles.fieldLabel}>Miktar</ThemedText>
              <View style={styles.fieldInputWrapper}>
                <TextInput
                  style={styles.fieldInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  value={amount}
                  onChangeText={setAmount}
                />
                <ThemedText style={styles.fieldUnit}>{amountUnitLabel}</ThemedText>
              </View>
            </View>

            {/* Birim maliyet */}
            <View style={styles.fieldRow}>
              <ThemedText style={styles.fieldLabel}>Birim Maliyet (opsiyonel)</ThemedText>
              <View style={styles.fieldInputWrapper}>
                <TextInput
                  style={styles.fieldInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  value={unitPrice}
                  onChangeText={setUnitPrice}
                />
                <ThemedText style={styles.fieldUnit}>TL</ThemedText>
              </View>
            </View>
          </View>

          {/* Kaydet butonu */}
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            activeOpacity={0.85}
            onPress={handleSave}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#f9fafb" />
            ) : (
              <ThemedText style={styles.saveButtonText}>KAYDET</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
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
  chartArea: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  infoCard: {
    position: 'absolute',
    right: 16,
    top: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(249,250,251,0.9)',
    zIndex: 10,
  },
  infoLabel: {
    fontSize: 11,
    color: '#4b5563',
  },
  infoValue: {
    color: '#111827',
  },
  infoChange: {
    fontSize: 11,
    color: '#16a34a',
  },
  chartWrapper: {
    marginTop: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  periodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  periodText: {
    fontSize: 13,
    color: '#f9fafb',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  formTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  formTitle: {
    color: '#f9fafb',
  },
  deleteButton: {
    paddingHorizontal: 42,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#1d3557',
    minHeight: 40,
  },
  deleteButtonPressed: {
    opacity: 0.8,
  },
  deleteButtonText: {
    color: '#f9fafb',
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  formCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  fieldRow: {
    marginBottom: 12,
  },
  fieldLabel: {
    marginBottom: 4,
    color: '#111827',
  },
  fieldInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  fieldInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingVertical: 0,
  },
  fieldUnit: {
    fontSize: 13,
    color: '#6b7280',
    marginLeft: 8,
  },
  saveButton: {
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: '#1d3557',
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: {
    color: '#f9fafb',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

