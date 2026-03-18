import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePortfolio } from '@/context/portfolio';
import { supabase } from '@/lib/supabase';

const BG_DARK = '#000000';
const SURFACE = '#1A1C24';
const WHITE = '#FFFFFF';
const BORDER = 'rgba(255,255,255,0.10)';
const PRIMARY = '#00e677';

type UploadRow = {
  id: string;
  filename: string;
  file_size: number | null;
  created_at: string;
};

type CategoryRow = { id: string; name: string };
type AssetRow = { id: string; category_id: string; symbol: string; name: string };
type HoldingRow = { id: string; asset_id: string; quantity: number };

type ParsedRow = {
  rowNumber: number;
  categoryName: string;
  assetValue: string;
  quantity: number;
  changeType: 'Ekleme' | 'Güncelleme';
};

const normalize = (value: string | null | undefined) =>
  (value ?? '').toString().trim().toLowerCase();

export default function BulkUploadScreen() {
  const router = useRouter();
  const { portfolioId } = usePortfolio();

  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchUploads = useCallback(async () => {
    const { data, error } = await supabase
      .from('portfolio_uploads')
      .select('id, filename, file_size, created_at')
      .order('created_at', { ascending: false });
    if (!error) setUploads((data as UploadRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  const readFileContent = async (uri: string): Promise<string> => {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      return await res.text();
    }
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  };

  const ensureWebDownload = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Sadece web', 'Örnek CSV dosyalarını şu anda sadece web tarayıcısından indirebilirsiniz.');
      return false;
    }
    return true;
  };

  const triggerCsvDownload = (filename: string, content: string) => {
    if (!ensureWebDownload()) return;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSampleCsv = () => {
    const sample = [
      ['Varlık Tipi', 'Varlık', 'Miktar', 'Değişiklik Tipi'],
      ['Yurt Dışı', 'TSLA', '1', 'Güncelleme'],
      ['Bist', 'TUPRS', '2', 'Ekleme'],
      ['Döviz', 'GBP', '2', 'Güncelleme'],
      ['Emtia', 'Cumhuriyet Altını', '3', 'Ekleme'],
      ['Fon', 'YAS', '5', 'Ekleme'],
      ['Kripto', 'BTC', '0,001', 'Güncelleme'],
    ]
      .map((row) => row.join(','))
      .join('\n');
    triggerCsvDownload('ornek-portfoy-yukleme.csv', sample);
  };

  const handleDownloadAllValuesCsv = async () => {
    try {
      if (!ensureWebDownload()) return;
      const [{ data: categories }, { data: assets }] = await Promise.all([
        supabase.from('categories').select('id, name, subtitle'),
        supabase.from('assets').select('category_id, symbol, name'),
      ]);
      const catList = (categories ?? []) as Array<{ id: string; name: string; subtitle: string | null }>;
      const assetList = (assets ?? []) as Array<{ category_id: string; symbol: string; name: string }>;

      const header = ['Varlık Tipi', 'Varlık (Sembol)', 'Varlık (Adı)'];
      const rows: string[][] = [header];

      for (const c of catList) {
        const ofCat = assetList.filter((a) => a.category_id === c.id);
        if (ofCat.length === 0) {
          rows.push([c.name, '', '']);
          continue;
        }
        for (const a of ofCat) {
          rows.push([c.name, a.symbol, a.name]);
        }
      }

      const csv = rows.map((r) => r.join(',')).join('\n');
      triggerCsvDownload('tum-varlik-degerleri.csv', csv);
    } catch (e) {
      console.error(e);
      Alert.alert('Hata', 'Değerler listesi oluşturulurken bir hata oluştu.');
    }
  };

  const parseCsv = (raw: string): ParsedRow[] => {
    const lines = raw.split(/\r?\n/);
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;

      const parts = line.split(',').map((p) => p.trim());
      const [colA, colB, colC, colD] = parts;

      if (!colA && !colB && !colC && !colD) continue;

      const changeType =
        normalize(colD) === 'ekleme'
          ? 'Ekleme'
          : normalize(colD) === 'güncelleme'
          ? 'Güncelleme'
          : null;

      const quantityRaw = (colC ?? '').replace(/\./g, '').replace(',', '.');
      const quantity = Number(quantityRaw);

      rows.push({
        rowNumber: i + 1,
        categoryName: colA ?? '',
        assetValue: colB ?? '',
        quantity,
        changeType: changeType as ParsedRow['changeType'],
      });
    }

    return rows;
  };

  const applyBusinessRules = async (rows: ParsedRow[]) => {
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .order('sort_order', { ascending: true });
    const { data: assets } = await supabase
      .from('assets')
      .select('id, category_id, symbol, name');
    const { data: holdings } = await supabase
      .from('holdings')
      .select('id, asset_id, quantity')
      .eq('portfolio_id', portfolioId);

    const catList = (categories ?? []) as CategoryRow[];
    const assetList = (assets ?? []) as AssetRow[];
    const holdingList = (holdings ?? []) as HoldingRow[];

    const errors: string[] = [];
    const inserts: { assetId: string; quantity: number }[] = [];
    const updates: { holdingId: string; quantity: number }[] = [];

    for (const row of rows) {
      if (!row.changeType || !Number.isFinite(row.quantity) || row.quantity <= 0) {
        errors.push(
          `Satır ${row.rowNumber}: Geçersiz miktar veya değişiklik tipi (Ekleme / Güncelleme olmalı).`
        );
        continue;
      }

      const category = catList.find((c) => normalize(c.name) === normalize(row.categoryName));
      if (!category) {
        errors.push(
          `Satır ${row.rowNumber}: Varlık tipi \"${row.categoryName}\" bulunamadı.`
        );
        continue;
      }

      const asset = assetList.find(
        (a) =>
          a.category_id === category.id &&
          (normalize(a.symbol) === normalize(row.assetValue) ||
            normalize(a.name) === normalize(row.assetValue))
      );
      if (!asset) {
        errors.push(
          `Satır ${row.rowNumber}: \"${row.assetValue}\" bu varlık tipinde bulunamadı.`
        );
        continue;
      }

      const holding = holdingList.find((h) => h.asset_id === asset.id);

      if (row.changeType === 'Ekleme') {
        if (holding) {
          errors.push(
            `Satır ${row.rowNumber}: \"${row.assetValue}\" zaten portföyde var, Ekleme yerine Güncelleme seçin.`
          );
          continue;
        }
        inserts.push({ assetId: asset.id, quantity: row.quantity });
      } else {
        if (!holding) {
          errors.push(
            `Satır ${row.rowNumber}: \"${row.assetValue}\" için portföyde kayıt bulunamadı, Güncelleme yapılamaz.`
          );
          continue;
        }
        updates.push({ holdingId: holding.id, quantity: row.quantity });
      }
    }

    if (errors.length > 0) {
      Alert.alert('Dosya yüklenemedi', errors.join('\n'));
      return;
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('holdings').insert(
        inserts.map((i) => ({
          portfolio_id: portfolioId,
          asset_id: i.assetId,
          quantity: i.quantity,
          avg_price: null,
        }))
      );
      if (error) {
        Alert.alert('Hata', 'Yeni kayıtlar eklenirken bir hata oluştu.');
        return;
      }
    }

    for (const u of updates) {
      const { error } = await supabase
        .from('holdings')
        .update({ quantity: u.quantity })
        .eq('id', u.holdingId);
      if (error) {
        Alert.alert('Hata', 'Bazı kayıtlar güncellenirken bir hata oluştu.');
        return;
      }
    }

    Alert.alert('Başarılı', 'Dosyadaki kayıtlar başarıyla işlendi.');
  };

  const pickAndUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      setUploading(true);
      const rawContent = await readFileContent(file.uri);

      const rows = parseCsv(rawContent);
      if (rows.length === 0) {
        Alert.alert('Hata', 'Dosya boş veya okunamadı. Lütfen CSV olarak kaydedip tekrar deneyin.');
        return;
      }

      const { error } = await supabase.from('portfolio_uploads').insert({
        filename: file.name,
        file_size: file.size ?? null,
        raw_content: rawContent,
      });
      if (error) throw error;

      await applyBusinessRules(rows);
      await fetchUploads();
    } catch (e) {
      console.error(e);
      Alert.alert('Hata', 'Dosya işlenirken bir hata oluştu.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Geri">
            <Ionicons name="arrow-back" size={24} color={WHITE} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Toplu dosya yükleme</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.uploadSection}>
            <TouchableOpacity
              style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
              onPress={pickAndUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={BG_DARK} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={24} color={BG_DARK} />
                  <Text style={styles.uploadButtonText}>Dosya seç ve yükle</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.helperTitle}>Format kuralları</Text>
            <Text style={styles.helperText}>
              - Dosyayı Excel'den **CSV** olarak dışa aktarın.{'\n'}
              - İlk satır başlık olmalı: Varlık Tipi, Varlık, Miktar, Değişiklik Tipi.{'\n'}
              - Değişiklik Tipi: \"Ekleme\" veya \"Güncelleme\" olmalı.{'\n'}
              - Varlık Tipi ve Varlık değerleri sistemde tanımlı olmalı; aksi halde satır satır hata gösterilir.
            </Text>
            <View style={styles.downloadRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleDownloadSampleCsv}>
                <Text style={styles.secondaryButtonText}>Örnek CSV indir</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleDownloadAllValuesCsv}>
                <Text style={styles.secondaryButtonText}>Tüm değerleri CSV indir</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.tableTitle}>Yüklenen dosyalar</Text>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={PRIMARY} />
            </View>
          ) : (
            <FlatList
              data={uploads}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>Henüz dosya yok</Text>
                </View>
              }
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="document-text-outline" size={20} color={PRIMARY} />
                    <Text style={styles.rowFilename} numberOfLines={1}>{item.filename}</Text>
                  </View>
                  <Text style={styles.rowMeta}>
                    {item.file_size != null ? `${(item.file_size / 1024).toFixed(1)} KB` : '—'} •{' '}
                    {new Date(item.created_at).toLocaleDateString('tr-TR')}
                  </Text>
                </View>
              )}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_DARK },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, paddingHorizontal: 12 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: WHITE },
  headerRight: { width: 40 },
  uploadSection: { padding: 16, gap: 8 },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  uploadButtonDisabled: { opacity: 0.7 },
  uploadButtonText: { color: BG_DARK, fontSize: 16, fontWeight: '600' },
  helperTitle: { color: WHITE, fontSize: 13, fontWeight: '600', marginTop: 8 },
  helperText: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  downloadRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#E5E7EB', fontSize: 13, fontWeight: '500' },
  tableTitle: { color: WHITE, fontSize: 14, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  loadingWrap: { padding: 24, alignItems: 'center' },
  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#64748B', fontSize: 14 },
  row: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowFilename: { flex: 1, color: WHITE, fontSize: 14 },
  rowMeta: { color: '#64748B', fontSize: 12, marginTop: 6, marginLeft: 30 },
});
