import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
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
import { decodeCsvFileBytes } from '@/lib/decode-csv-file-bytes';
import { resolveBistCsvToCanonicalSymbol } from '@/lib/bist-display-name';
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
type HoldingRow = {
  id: string;
  asset_id: string;
  quantity: number;
  avg_price: number | null;
  portfolio_id: string;
};

type PortfolioRowDb = { id: string; name: string };

type ChangeKind = 'add' | 'update' | 'auto';

/** Çözülmüş satır — aynı portföy+varlık gruplanır, tek holding satırına yazılır */
type ResolvedBulkLine = {
  rowNumber: number;
  portfolioId: string;
  assetId: string;
  quantity: number;
  /** Geçerli ortalama maliyet hücresi; yoksa undefined (birleştirmede maliyet atanmaz) */
  unitCost?: number;
  changeKind: ChangeKind;
};

function holdingAggregateKey(portfolioId: string, assetId: string): string {
  return `${portfolioId}\t${assetId}`;
}

/** Tüm satırlarda birim maliyet varsa ağırlıklı ortalama; aksi halde undefined (güncellemede sütun dokunulmaz, eklemede null) */
function mergeAvgFromLines(lines: ResolvedBulkLine[], sumQty: number): number | undefined {
  if (lines.length === 0 || sumQty <= 0) return undefined;
  const priced = lines.filter((l) => l.unitCost !== undefined);
  if (priced.length !== lines.length) return undefined;
  const costSum = priced.reduce((s, l) => s + l.quantity * (l.unitCost as number), 0);
  return costSum / sumQty;
}

/** Upsert: portföy + varlık; yoksa ekle, varsa adet / ortalama maliyet güncelle */
type UnifiedRow = {
  rowNumber: number;
  portfolioName: string | null;
  categoryName: string;
  assetValue: string;
  quantity: number;
  /** undefined = hücre boş (güncellemede avg_price değişmez; eklemede null) */
  avgPrice?: number | null;
  avgPriceInvalid?: boolean;
  changeKind?: ChangeKind;
  changeKindInvalid?: boolean;
};

type ColKey = 'portfolio' | 'category' | 'asset' | 'quantity' | 'avgCost' | 'changeType';
type ColMap = Partial<Record<ColKey, number>>;

const stripQuotes = (value: string) =>
  (value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();

const turkishLower = (s: string) =>
  s.replace(/İ/g, 'i').replace(/I/g, 'ı').replace(/Ş/g, 'ş').replace(/Ğ/g, 'ğ')
   .replace(/Ü/g, 'ü').replace(/Ö/g, 'ö').replace(/Ç/g, 'ç').toLowerCase();

const normalize = (value: string | null | undefined) =>
  turkishLower(stripQuotes((value ?? '').toString()).trim());

const normalizeLoose = (value: string | null | undefined) =>
  normalize(value).replace(/\s+/g, '');

/** Sütun varsa: boş → auto; EKLE/EKLEME/ADD → add; GÜNCELLE/…/UPDATE → update */
function parseChangeKindCell(raw: string | undefined): ChangeKind | 'invalid' {
  const lo = normalizeLoose(raw ?? '');
  if (!lo) return 'auto';
  if (lo === 'ekle' || lo === 'ekleme' || lo === 'add') return 'add';
  if (
    lo === 'güncelle' ||
    lo === 'guncelle' ||
    lo === 'güncelleme' ||
    lo === 'guncelleme' ||
    lo === 'update'
  )
    return 'update';
  return 'invalid';
}

/** ADD: DB adedine dosya toplamı eklenir; maliyet bilinen taraflarla ağırlıklı ortalama */
function blendAvgForAddToHolding(
  dbQty: number,
  dbAvg: number | null,
  fileSumQty: number,
  fileAvg: number | undefined
): number | undefined {
  const newQ = dbQty + fileSumQty;
  if (newQ <= 0) return undefined;
  if (fileAvg === undefined) return undefined;
  if (dbAvg != null && Number.isFinite(dbAvg)) {
    return (dbQty * dbAvg + fileSumQty * fileAvg) / newQ;
  }
  return fileAvg;
}

/** Toplu yüklemede varlık tipi hücresi -> categories.id / name ile kıyaslanacak anahtarlar */
function categoryCsvLookupKeys(label: string): Set<string> {
  const loose = normalizeLoose(label);
  const keys = new Set<string>([loose]);

  const yurtdisiLike =
    loose === 'abd' ||
    loose === 'usa' ||
    loose === 'us' ||
    loose === 'yurtdisi' ||
    loose === 'yurtdışı';
  if (yurtdisiLike) {
    keys.add(normalizeLoose('yurtdisi'));
    keys.add(normalizeLoose('ABD'));
    keys.add(normalizeLoose('Yurtdışı'));
    keys.add(normalizeLoose('USA'));
  }

  const bistLike = loose === 'bist' || loose === 'bıst';
  if (bistLike) {
    keys.add(normalizeLoose('bist'));
    keys.add(normalizeLoose('Bist'));
    keys.add(normalizeLoose('BIST'));
    keys.add(normalizeLoose('BİST'));
  }

  return keys;
}

/** TR: 1.234,56 veya 9,186005115 — EN: 1,234.56 */
function parseLocaleNumber(raw: string | null | undefined): number | null {
  const s = stripQuotes(raw ?? '').trim();
  if (s === '') return null;
  let t = s.replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) {
    const lastComma = t.lastIndexOf(',');
    const lastDot = t.lastIndexOf('.');
    if (lastComma > lastDot) {
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
  } else if (t.includes(',') && !t.includes('.')) {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const HEADER_TO_COL: Record<string, ColKey> = {
  portföy: 'portfolio',
  portfolio: 'portfolio',
  portfoy: 'portfolio',
  varlıktipi: 'category',
  varliktipi: 'category',
  assettype: 'category',
  kategori: 'category',
  category: 'category',
  varlık: 'asset',
  varlik: 'asset',
  'varlık(adı)': 'asset',
  'varlik(adi)': 'asset',
  'varlık(sembol)': 'asset',
  'varlik(sembol)': 'asset',
  asset: 'asset',
  sembol: 'asset',
  symbol: 'asset',
  ticker: 'asset',
  adet: 'quantity',
  miktar: 'quantity',
  quantity: 'quantity',
  qty: 'quantity',
  amount: 'quantity',
  miktaradet: 'quantity',
  ortalamamaliyet: 'avgCost',
  'ortalamamaliyet(tl)': 'avgCost',
  'ortalamamaliyet(usd)': 'avgCost',
  ortalamamaliyettl: 'avgCost',
  ortalamamaliyetusd: 'avgCost',
  averagecost: 'avgCost',
  avgcost: 'avgCost',
  birimmaliyet: 'avgCost',
  unitprice: 'avgCost',
  unitcost: 'avgCost',
  varlıktürü: 'category',
  varlikturu: 'category',
  classtype: 'category',
  değişikliktipi: 'changeType',
  degisikliktipi: 'changeType',
  değişiklik: 'changeType',
  degisiklik: 'changeType',
  changetype: 'changeType',
  işlem: 'changeType',
  islem: 'changeType',
  operation: 'changeType',
};

/** Başlık hücresi: NFC, sıfır genişlik, kenar noktalama. */
function normalizeHeaderKeyForMap(cell: string): string {
  let s = stripQuotes(cell).normalize('NFC');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/^[\s.:;,\-*–—_]+|[\s.:;,\-*–—_]+$/g, '');
  return normalizeLoose(s);
}

function buildColMap(headerCells: string[]): ColMap {
  const map: ColMap = {};
  headerCells.forEach((cell, i) => {
    const key = HEADER_TO_COL[normalizeHeaderKeyForMap(cell)];
    if (key && map[key] === undefined) map[key] = i;
  });
  return map;
}

/** Zorunlu: Varlık Tipi, Varlık, Adet. Portföy / Ortalama Maliyet isteğe bağlı sütun. */
function isValidCsvHeader(map: ColMap): boolean {
  return map.category !== undefined && map.asset !== undefined && map.quantity !== undefined;
}

export default function BulkUploadScreen() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'tr-TR';
  const router = useRouter();
  const { portfolioId, refresh: refreshPortfolios } = usePortfolio();
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
    try {
      const buf = await new ExpoFile(uri).arrayBuffer();
      return decodeCsvFileBytes(new Uint8Array(buf));
    } catch {
      const FileSystem = await import('expo-file-system/legacy');
      return FileSystem.readAsStringAsync(uri, { encoding: 'utf8' });
    }
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
    // Semicolon: TR Excel; adet/maliyet ondalığı virgülle güvenli
    const delim = isEn ? ',' : ';';
    const header = isEn
      ? ['Portfolio', 'Asset Type', 'Asset', 'Quantity', 'Average Cost', 'Change type']
      : ['Portföy', 'Varlık Tipi', 'Varlık', 'Adet', 'Ortalama Maliyet', 'Değişiklik Tipi'];
    const pf = isEn ? 'Main portfolio' : 'Ana Portföy';
    const rows = isEn
      ? [
          header,
          [pf, 'USA', 'TSLA', '1.5', '250.25', ''],
          [pf, 'BIST', 'TUPRS', '10', '145.50', ''],
          [pf, 'Forex', 'GBP', '2', '38.90', ''],
          [pf, 'Kripto', 'BTC', '0.001', '95000', ''],
        ]
      : [
          header,
          [pf, 'ABD', 'TSLA', '1,5', '250,25', ''],
          [pf, 'BIST', 'TUPRS', '10', '145,50', ''],
          [pf, 'Döviz', 'GBP', '2', '38,90', ''],
          [pf, 'Kripto', 'BTC', '0,001', '95000', ''],
        ];
    const sample = rows.map((row) => row.join(delim)).join('\n');
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
    if (tabCount >= 2) return '\t';
    const semiCount = (headerLine.match(/;/g) || []).length;
    // TR Excel: Varlık Tipi;Varlık;Adet → 2 adet ; (3 sütun)
    if (semiCount >= 2) return ';';
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

    return fields;
  };

  const parseCsv = (raw: string): { rows: UnifiedRow[]; invalidHeader: boolean } => {
    const out: UnifiedRow[] = [];
    if (!raw.trim()) return { rows: out, invalidHeader: false };

    const text = raw.replace(/\u0000/g, '');
    const lines = text.split(/\r\n|\n|\r/);
    const scanLimit = Math.min(12, lines.length);

    let headerLineIndex = -1;
    let delimiter = ',';
    let colMap: ColMap = {};

    for (let h = 0; h < scanLimit; h++) {
      const candidate = lines[h];
      if (!candidate?.trim()) continue;
      const d = detectDelimiter(candidate);
      const cells = parseCsvLine(candidate, d).map(stripQuotes);
      const map = buildColMap(cells);
      if (isValidCsvHeader(map)) {
        headerLineIndex = h;
        delimiter = d;
        colMap = map;
        break;
      }
    }

    if (headerLineIndex < 0) {
      return { rows: [], invalidHeader: true };
    }

    if (lines.length < headerLineIndex + 2) {
      return { rows: out, invalidHeader: false };
    }

    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;

      const parts = parseCsvLine(line, delimiter).map(stripQuotes);
      if (parts.every((p) => !stripQuotes(p))) continue;

      const portfolioName =
        colMap.portfolio !== undefined
          ? stripQuotes(parts[colMap.portfolio] ?? '').trim() || null
          : null;
      const categoryName = stripQuotes(parts[colMap.category!] ?? '');
      const assetValue = stripQuotes(parts[colMap.asset!] ?? '');
      const qtyRaw = stripQuotes(parts[colMap.quantity!] ?? '');
      const avgRaw =
        colMap.avgCost !== undefined ? stripQuotes(parts[colMap.avgCost] ?? '') : '';

      let changeKind: ChangeKind | undefined;
      let changeKindInvalid = false;
      if (colMap.changeType !== undefined) {
        const ckRaw = stripQuotes(parts[colMap.changeType] ?? '');
        const parsed = parseChangeKindCell(ckRaw);
        if (parsed === 'invalid') changeKindInvalid = true;
        else changeKind = parsed;
      }

      const quantity = parseLocaleNumber(qtyRaw) ?? NaN;
      let avgPrice: number | null | undefined;
      let avgPriceInvalid = false;
      if (avgRaw.trim() !== '') {
        const p = parseLocaleNumber(avgRaw);
        if (p === null || !Number.isFinite(p) || p < 0) {
          avgPriceInvalid = true;
        } else {
          avgPrice = p;
        }
      }

      out.push({
        rowNumber: i + 1,
        portfolioName,
        categoryName,
        assetValue,
        quantity,
        ...(avgPrice !== undefined ? { avgPrice } : {}),
        ...(avgPriceInvalid ? { avgPriceInvalid: true } : {}),
        ...(changeKind !== undefined ? { changeKind } : {}),
        ...(changeKindInvalid ? { changeKindInvalid: true } : {}),
      });
    }

    return { rows: out, invalidHeader: false };
  };

  const applyBusinessRules = async (rows: UnifiedRow[]) => {
    if (!user?.id) {
      showAlert(t('bulk.errorTitle'), t('bulk.needSession'));
      return;
    }

    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .order('sort_order', { ascending: true });

    const { data: portfoliosData } = await supabase
      .from('portfolios')
      .select('id, name')
      .eq('user_id', user.id);

    let portList = (portfoliosData ?? []) as PortfolioRowDb[];

    const portfolioLooseExists = (loose: string) =>
      portList.some(
        (x) => normalizeLoose(x.name) === loose || normalizeLoose(x.id) === loose
      );

    /** Aynı portföyü farklı yazımla tekrar oluşturmayı önle (Hasim / hasim → tek kayıt) */
    const desiredPortfolioByLoose = new Map<string, string>();
    for (const r of rows) {
      const n = r.portfolioName?.trim();
      if (!n) continue;
      const loose = normalizeLoose(n);
      if (!desiredPortfolioByLoose.has(loose)) {
        desiredPortfolioByLoose.set(loose, n);
      }
    }

    const newPortfolioNames = [...desiredPortfolioByLoose.entries()]
      .filter(([loose]) => !portfolioLooseExists(loose))
      .map(([, displayName]) => displayName);

    for (const name of newPortfolioNames) {
      const { data: created, error: createErr } = await supabase
        .from('portfolios')
        .insert({ user_id: user.id, name: name.trim(), currency: 'USD' })
        .select('id, name')
        .single();
      if (createErr || !created) {
        showAlert(
          t('bulk.errorTitle'),
          t('bulk.portfolioCreateError', {
            name: name.trim(),
            message: createErr?.message ?? 'unknown',
          })
        );
        return;
      }
      portList = [...portList, created as PortfolioRowDb];
    }

    const portfolioIds = portList.map((p) => p.id);

    const catListForPrefetch = (categories ?? []) as CategoryRow[];
    const symbolSet = new Set<string>();
    for (const r of rows) {
      const v = r.assetValue.trim();
      if (!v) continue;
      symbolSet.add(v);
      const cat = catListForPrefetch.find(
        (c) =>
          categoryCsvLookupKeys(r.categoryName).has(normalizeLoose(c.id)) ||
          categoryCsvLookupKeys(r.categoryName).has(normalizeLoose(c.name))
      );
      if (cat?.id === 'bist') {
        const canon = resolveBistCsvToCanonicalSymbol(v);
        if (canon) symbolSet.add(canon);
      }
    }
    const uniqueSymbols = [...symbolSet];
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

    const { data: holdings } =
      portfolioIds.length > 0
        ? await supabase
            .from('holdings')
            .select('id, asset_id, quantity, avg_price, portfolio_id')
            .in('portfolio_id', portfolioIds)
        : { data: [] as HoldingRow[] };

    const catList = (categories ?? []) as CategoryRow[];
    const assetList = assetChunks;
    const holdingList = (holdings ?? []) as HoldingRow[];

    const errors: string[] = [];
    const resolvedLines: ResolvedBulkLine[] = [];

    const resolvePortfolioId = (row: UnifiedRow): string | null => {
      if (row.portfolioName && row.portfolioName.trim()) {
        const p = portList.find(
          (x) =>
            normalizeLoose(x.name) === normalizeLoose(row.portfolioName) ||
            normalizeLoose(x.id) === normalizeLoose(row.portfolioName)
        );
        return p?.id ?? null;
      }
      return portfolioId;
    };

    for (const row of rows) {
      const pfLabel = row.portfolioName?.trim() || '—';

      if (row.avgPriceInvalid) {
        errors.push(t('bulk.rowInvalidAvgPrice', { row: row.rowNumber, price: '—' }));
        continue;
      }
      if (row.changeKindInvalid) {
        errors.push(t('bulk.rowInvalidChangeKind', { row: row.rowNumber }));
        continue;
      }
      if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
        errors.push(
          t('bulk.rowInvalidQty', {
            row: row.rowNumber,
            qty: row.quantity,
            pf: pfLabel,
            cat: row.categoryName,
            asset: row.assetValue,
          })
        );
        continue;
      }

      const targetPid = resolvePortfolioId(row);
      if (!targetPid) {
        errors.push(
          t('bulk.rowPortfolioNotFound', {
            row: row.rowNumber,
            name: row.portfolioName?.trim() || pfLabel,
          })
        );
        continue;
      }

      const catKeys = categoryCsvLookupKeys(row.categoryName);
      const category = catList.find(
        (c) => catKeys.has(normalizeLoose(c.id)) || catKeys.has(normalizeLoose(c.name))
      );
      if (!category) {
        errors.push(t('bulk.rowCategoryNotFound', { row: row.rowNumber, name: row.categoryName }));
        continue;
      }

      const assetCell =
        category.id === 'bist' ? resolveBistCsvToCanonicalSymbol(row.assetValue) : row.assetValue;
      const asset = assetList.find(
        (a) =>
          a.category_id === category.id &&
          (normalize(a.symbol) === normalize(assetCell) || normalize(a.name) === normalize(assetCell))
      );
      if (!asset) {
        errors.push(t('bulk.rowAssetNotFound', { row: row.rowNumber, asset: row.assetValue }));
        continue;
      }

      const line: ResolvedBulkLine = {
        rowNumber: row.rowNumber,
        portfolioId: targetPid,
        assetId: asset.id,
        quantity: row.quantity,
        changeKind: row.changeKind ?? 'auto',
      };
      if (row.avgPrice !== undefined && row.avgPrice !== null) {
        line.unitCost = row.avgPrice;
      }
      resolvedLines.push(line);
    }

    if (errors.length > 0) {
      showAlert(t('bulk.uploadFailedTitle'), errors.join('\n'));
      return;
    }

    const byKey = new Map<string, ResolvedBulkLine[]>();
    for (const ln of resolvedLines) {
      const k = holdingAggregateKey(ln.portfolioId, ln.assetId);
      const arr = byKey.get(k);
      if (arr) arr.push(ln);
      else byKey.set(k, [ln]);
    }

    const groupErrors: string[] = [];
    for (const [, lines] of byKey) {
      const kind0 = lines[0]!.changeKind;
      if (!lines.every((l) => l.changeKind === kind0)) {
        const nums = [...new Set(lines.map((l) => l.rowNumber))].sort((a, b) => a - b).join(', ');
        groupErrors.push(t('bulk.mixedChangeKind', { rows: nums }));
        continue;
      }
      const holding = holdingList.find(
        (h) => h.portfolio_id === lines[0]!.portfolioId && h.asset_id === lines[0]!.assetId
      );
      if (kind0 === 'update' && !holding) {
        const nums = [...new Set(lines.map((l) => l.rowNumber))].sort((a, b) => a - b).join(', ');
        groupErrors.push(t('bulk.updateRequiresExisting', { rows: nums }));
      }
    }
    if (groupErrors.length > 0) {
      showAlert(t('bulk.uploadFailedTitle'), groupErrors.join('\n'));
      return;
    }

    const inserts: { portfolioId: string; assetId: string; quantity: number; avgPrice: number | null }[] = [];
    const updates: { holdingId: string; quantity: number; avgPrice?: number | null }[] = [];

    for (const [, lines] of byKey) {
      const kind = lines[0]!.changeKind;
      const holding = holdingList.find(
        (h) => h.portfolio_id === lines[0]!.portfolioId && h.asset_id === lines[0]!.assetId
      );

      if (kind === 'update') {
        if (!holding) continue;
        const last = lines.reduce((a, b) => (a.rowNumber >= b.rowNumber ? a : b));
        updates.push({
          holdingId: holding.id,
          quantity: last.quantity,
          ...(last.unitCost !== undefined ? { avgPrice: last.unitCost } : {}),
        });
        continue;
      }

      if (kind === 'add') {
        const fileSumQty = lines.reduce((s, l) => s + l.quantity, 0);
        const fileAvg = mergeAvgFromLines(lines, fileSumQty);
        if (holding) {
          const newQ = holding.quantity + fileSumQty;
          const blended = blendAvgForAddToHolding(
            holding.quantity,
            holding.avg_price,
            fileSumQty,
            fileAvg
          );
          updates.push({
            holdingId: holding.id,
            quantity: newQ,
            ...(blended !== undefined ? { avgPrice: blended } : {}),
          });
        } else {
          inserts.push({
            portfolioId: lines[0]!.portfolioId,
            assetId: lines[0]!.assetId,
            quantity: fileSumQty,
            avgPrice: fileAvg === undefined ? null : fileAvg,
          });
        }
        continue;
      }

      const sumQty = lines.reduce((s, l) => s + l.quantity, 0);
      const mergedAvg = mergeAvgFromLines(lines, sumQty);
      if (holding) {
        updates.push({
          holdingId: holding.id,
          quantity: sumQty,
          ...(mergedAvg !== undefined ? { avgPrice: mergedAvg } : {}),
        });
      } else {
        inserts.push({
          portfolioId: lines[0]!.portfolioId,
          assetId: lines[0]!.assetId,
          quantity: sumQty,
          avgPrice: mergedAvg === undefined ? null : mergedAvg,
        });
      }
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('holdings').insert(
        inserts.map((i) => ({
          portfolio_id: i.portfolioId,
          asset_id: i.assetId,
          quantity: i.quantity,
          avg_price: i.avgPrice,
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
        .update({
          quantity: u.quantity,
          ...(u.avgPrice !== undefined ? { avg_price: u.avgPrice } : {}),
        })
        .eq('id', u.holdingId);
      if (error) {
        showAlert(t('bulk.errorTitle'), t('bulk.updateError', { message: error.message }));
        return;
      }
    }

    await refreshPortfolios();

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

      const textProbe = rawContent.replace(/\u0000/g, '');
      const linesProbe = textProbe.split(/\r\n|\n|\r/);
      const firstNonEmptyLine = linesProbe.find((l) => l.trim()) ?? '';
      const detectedDelim = detectDelimiter(firstNonEmptyLine);
      const delimLabel =
        detectedDelim === ';'
          ? t('bulk.delimSemicolon')
          : detectedDelim === '\t'
            ? t('bulk.delimTab')
            : t('bulk.delimComma');
      const previewForAlert = linesProbe
        .slice(0, 5)
        .map((line, idx) => {
          const s = line.length > 140 ? `${line.slice(0, 140)}…` : line;
          return `[${idx + 1}] ${s}`;
        })
        .join('\n');

      const { rows, invalidHeader } = parseCsv(rawContent);
      if (invalidHeader) {
        showAlert(
          t('bulk.invalidHeaderTitle'),
          t('bulk.invalidHeaderBody', { delim: delimLabel, preview: previewForAlert })
        );
        return;
      }
      if (rows.length === 0) {
        showAlert(
          t('bulk.errorTitle'),
          t('bulk.emptyFileBody', {
            delim: delimLabel,
            lines: linesProbe.slice(0, 3).map((l, i) => `[${i}] ${l}`).join('\n'),
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
