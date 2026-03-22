import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePortfolio } from '@/context/portfolio';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

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

const stripQuotes = (value: string) => value.replace(/^["']+|["']+$/g, '').trim();

const turkishLower = (s: string) =>
  s.replace(/İ/g, 'i').replace(/I/g, 'ı').replace(/Ş/g, 'ş').replace(/Ğ/g, 'ğ')
   .replace(/Ü/g, 'ü').replace(/Ö/g, 'ö').replace(/Ç/g, 'ç').toLowerCase();

const normalize = (value: string | null | undefined) =>
  turkishLower(stripQuotes((value ?? '').toString()).trim());

const normalizeLoose = (value: string | null | undefined) =>
  normalize(value).replace(/\s+/g, '');

function mapChangeTypeToken(raw: string | undefined): ParsedRow['changeType'] | null {
  const n = normalize(raw);
  if (n === 'ekleme' || n === 'add') return 'Ekleme';
  if (n === 'güncelleme' || n === 'guncelleme' || n === 'update') return 'Güncelleme';
  return null;
}

export default function BulkUploadScreen() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'tr-TR';
  const router = useRouter();
  const { portfolioId } = usePortfolio();
  const { user } = useAuth();

  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalBody, setModalBody] = useState('');

  const showAlert = (title: string, body: string) => {
    if (Platform.OS === 'web') {
      setModalTitle(title);
      setModalBody(body);
      setModalVisible(true);
    } else {
      Alert.alert(title, body);
    }
  };

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
    return await FileSystem.readAsStringAsync(uri, { encoding: 'utf8' });
  };

  const ensureWebDownload = () => {
    if (Platform.OS !== 'web') {
      showAlert(t('bulk.webOnlyTitle'), t('bulk.webOnlyBody'));
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
    const isEn = i18n.language?.toLowerCase().startsWith('en');
    const header = isEn
      ? ['Asset Type', 'Asset', 'Quantity', 'Change Type']
      : ['Varlık Tipi', 'Varlık', 'Miktar', 'Değişiklik Tipi'];
    const u = isEn ? 'Update' : 'Güncelleme';
    const a = isEn ? 'Add' : 'Ekleme';
    const sample = [
      header,
      ['Yurt Dışı', 'TSLA', '1', u],
      ['Bist', 'TUPRS', '2', a],
      ['Döviz', 'GBP', '2', u],
      ['Emtia', 'Cumhuriyet Altını', '3', a],
      ['Fon', 'YAS', '5', a],
      ['Kripto', 'BTC', '0,001', u],
    ]
      .map((row) => row.join(','))
      .join('\n');
    triggerCsvDownload(t('bulk.sampleFilename'), sample);
  };


  const handleDownloadAllValuesCsv = async () => {
    try {
      if (!ensureWebDownload()) return;

      const { data: categories } = await supabase.from('categories').select('id, name, subtitle');
      const allAssets: Array<{ category_id: string; symbol: string; name: string }> = [];
      let from = 0;
      const PG = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from('assets')
          .select('category_id, symbol, name')
          .order('symbol', { ascending: true })
          .range(from, from + PG - 1);
        if (!batch || batch.length === 0) break;
        allAssets.push(...batch);
        if (batch.length < PG) break;
        from += PG;
      }

      const catList = (categories ?? []) as Array<{ id: string; name: string; subtitle: string | null }>;
      const assetList = allAssets;

      const header = [t('bulk.exportHeaderCategory'), t('bulk.exportHeaderSymbol'), t('bulk.exportHeaderName')];
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
      triggerCsvDownload(t('bulk.exportFilename'), csv);
    } catch (e) {
      console.error(e);
      showAlert(t('bulk.errorTitle'), t('bulk.valuesListError'));
    }
  };

  const detectDelimiter = (headerLine: string): string => {
    const tabCount = (headerLine.match(/\t/g) || []).length;
    if (tabCount >= 3) return '\t';
    const semiCount = (headerLine.match(/;/g) || []).length;
    if (semiCount >= 3) return ';';
    return ',';
  };

  const parseCsvLine = (line: string, delimiter: string): string[] => {
    if (delimiter === ';' || delimiter === '\t') {
      return line.split(delimiter).map((p) => p.trim());
    }
    // RFC 4180 aware split: respect quoted fields (Google Sheets quotes fields containing commas)
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (inQuotes) {
        if (ch === '"' && line[j + 1] === '"') {
          current += '"';
          j++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    if (fields.length <= 4) return fields;

    // Fallback: if more than 4 fields, try smart merge for unquoted decimal commas
    const last = normalize(fields[fields.length - 1]);
    if (
      last === 'ekleme' ||
      last === 'güncelleme' ||
      last === 'g\u00fcncelleme' ||
      last === 'add' ||
      last === 'update'
    ) {
      const colA = fields[0];
      const colB = fields[1];
      const colD = fields[fields.length - 1];
      const colC = fields.slice(2, fields.length - 1).join(',');
      return [colA, colB, colC, colD];
    }
    return fields;
  };

  const parseCsv = (raw: string): ParsedRow[] => {
    const lines = raw.split(/\r?\n/);
    const rows: ParsedRow[] = [];
    if (lines.length === 0) return rows;

    const delimiter = detectDelimiter(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;

      const parts = parseCsvLine(line, delimiter).map(stripQuotes);
      const [colA, colB, colC, colD] = parts;

      if (!colA && !colB && !colC && !colD) continue;

      const changeType = mapChangeTypeToken(colD);

      let quantityRaw = stripQuotes(colC ?? '').trim();
      if (quantityRaw.includes(',') && !quantityRaw.includes('.')) {
        quantityRaw = quantityRaw.replace(',', '.');
      } else if (quantityRaw.includes('.') && quantityRaw.includes(',')) {
        quantityRaw = quantityRaw.replace(/\./g, '').replace(',', '.');
      }
      const quantity = Number(quantityRaw);

      rows.push({
        rowNumber: i + 1,
        categoryName: stripQuotes(colA ?? ''),
        assetValue: stripQuotes(colB ?? ''),
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

    const uniqueSymbols = [...new Set(rows.map((r) => r.assetValue.trim()).filter(Boolean))];
    const assetChunks: AssetRow[] = [];
    const CHUNK = 200;
    for (let i = 0; i < uniqueSymbols.length; i += CHUNK) {
      const batch = uniqueSymbols.slice(i, i + CHUNK);
      const [bySymbol, byName] = await Promise.all([
        supabase.from('assets').select('id, category_id, symbol, name').in('symbol', batch),
        supabase.from('assets').select('id, category_id, symbol, name').in('name', batch),
      ]);
      for (const a of (bySymbol.data ?? []) as AssetRow[]) {
        if (!assetChunks.some((x) => x.id === a.id)) assetChunks.push(a);
      }
      for (const a of (byName.data ?? []) as AssetRow[]) {
        if (!assetChunks.some((x) => x.id === a.id)) assetChunks.push(a);
      }
    }

    const { data: holdings } = await supabase
      .from('holdings')
      .select('id, asset_id, quantity')
      .eq('portfolio_id', portfolioId);

    const catList = (categories ?? []) as CategoryRow[];
    const assetList = assetChunks;
    const holdingList = (holdings ?? []) as HoldingRow[];

    const errors: string[] = [];
    const inserts: { assetId: string; quantity: number }[] = [];
    const updates: { holdingId: string; quantity: number }[] = [];

    for (const row of rows) {
      const typeDisp =
        row.changeType === 'Ekleme'
          ? t('bulk.changeAdd')
          : row.changeType === 'Güncelleme'
            ? t('bulk.changeUpdate')
            : t('bulk.emptyTypeLabel');

      if (!row.changeType || !Number.isFinite(row.quantity) || row.quantity <= 0) {
        errors.push(
          t('bulk.rowInvalidQty', {
            row: row.rowNumber,
            qty: row.quantity,
            type: typeDisp,
            cat: row.categoryName,
            asset: row.assetValue,
          })
        );
        continue;
      }

      const category = catList.find(
        (c) =>
          normalizeLoose(c.name) === normalizeLoose(row.categoryName) ||
          normalizeLoose(c.id) === normalizeLoose(row.categoryName)
      );
      if (!category) {
        errors.push(t('bulk.rowCategoryNotFound', { row: row.rowNumber, name: row.categoryName }));
        continue;
      }

      const asset = assetList.find(
        (a) =>
          a.category_id === category.id &&
          (normalize(a.symbol) === normalize(row.assetValue) ||
            normalize(a.name) === normalize(row.assetValue))
      );
      if (!asset) {
        errors.push(t('bulk.rowAssetNotFound', { row: row.rowNumber, asset: row.assetValue }));
        continue;
      }

      const holding = holdingList.find((h) => h.asset_id === asset.id);

      if (row.changeType === 'Ekleme') {
        if (holding) {
          errors.push(t('bulk.rowAlreadyHolding', { row: row.rowNumber, asset: row.assetValue }));
          continue;
        }
        inserts.push({ assetId: asset.id, quantity: row.quantity });
      } else {
        if (!holding) {
          errors.push(t('bulk.rowNoHoldingForUpdate', { row: row.rowNumber, asset: row.assetValue }));
          continue;
        }
        updates.push({ holdingId: holding.id, quantity: row.quantity });
      }
    }

    if (errors.length > 0) {
      showAlert(t('bulk.uploadFailedTitle'), errors.join('\n'));
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
        showAlert(t('bulk.errorTitle'), t('bulk.insertError', { message: error.message }));
        return;
      }
    }

    for (const u of updates) {
      const { error } = await supabase
        .from('holdings')
        .update({ quantity: u.quantity })
        .eq('id', u.holdingId);
      if (error) {
        showAlert(t('bulk.errorTitle'), t('bulk.updateError', { message: error.message }));
        return;
      }
    }

    showAlert(
      t('bulk.successTitle'),
      t('bulk.successBody', { adds: inserts.length, updates: updates.length })
    );
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

      let rawContent: string;
      try {
        rawContent = await readFileContent(file.uri);
      } catch (readErr: any) {
        showAlert(t('bulk.readFailedTitle'), t('bulk.readFailedBody', { message: String(readErr?.message ?? readErr) }));
        return;
      }

      const firstLines = rawContent.split(/\r?\n/).slice(0, 3);
      const detectedDelim = detectDelimiter(firstLines[0] ?? '');

      const rows = parseCsv(rawContent);
      if (rows.length === 0) {
        showAlert(
          t('bulk.errorTitle'),
          t('bulk.emptyFileBody', {
            delim: detectedDelim,
            lines: firstLines.map((l, i) => `[${i}] ${l}`).join('\n'),
          })
        );
        return;
      }

      // portfolio_uploads kaydı opsiyonel; tablo yoksa bile devam et
      try {
        await supabase.from('portfolio_uploads').insert({
          user_id: user?.id ?? null,
          filename: file.name,
          file_size: file.size ?? null,
          raw_content: rawContent,
        });
      } catch (_) {
        // tablo yoksa yoksay
      }

      await applyBusinessRules(rows);
      await fetchUploads();
    } catch (e: any) {
      console.error(e);
      const msg = e?.message ?? JSON.stringify(e);
      showAlert(t('bulk.errorTitle'), t('bulk.processError', { message: msg }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityLabel={t('bulk.backA11y')}>
            <Ionicons name="arrow-back" size={24} color={WHITE} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{t('bulk.screenTitle')}</Text>
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
                  <Text style={styles.uploadButtonText}>{t('bulk.pickUpload')}</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.helperTitle}>{t('bulk.formatTitle')}</Text>
            <Text style={styles.helperText}>{t('bulk.formatBody')}</Text>
            <View style={styles.downloadRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleDownloadSampleCsv}>
                <Text style={styles.secondaryButtonText}>{t('bulk.sampleCsv')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleDownloadAllValuesCsv}>
                <Text style={styles.secondaryButtonText}>{t('bulk.allValuesCsv')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.tableTitle}>{t('bulk.uploadsTitle')}</Text>
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
                  <Text style={styles.emptyText}>{t('bulk.noFiles')}</Text>
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
                    {new Date(item.created_at).toLocaleDateString(dateLocale)}
                  </Text>
                </View>
              )}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalBody}>{modalBody}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>{t('bulk.ok')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalTitle: { color: PRIMARY, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalScroll: { maxHeight: 300 },
  modalBody: { color: WHITE, fontSize: 14, lineHeight: 22 },
  modalButton: {
    marginTop: 16,
    backgroundColor: PRIMARY,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButtonText: { color: BG_DARK, fontSize: 14, fontWeight: '600' },
});
