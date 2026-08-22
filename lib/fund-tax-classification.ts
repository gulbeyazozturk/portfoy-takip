/** TEFAS fon metadata → stopaj sınıflandırması (GVK Geçici 67). */

export type FundKind = 'YAT' | 'EMK' | 'BYF' | 'GYF' | 'GSYF';

export type FundTaxClassification = {
  symbol: string;
  fundKind: FundKind;
  fundName: string;
  umbrellaType: string | null;
  category: string | null;
  isHisseYogun: boolean;
  isSerbest: boolean;
  tefasListed: boolean;
};

const HISSE_YOGUN_RE = /HİSSE\s*SENEDİ\s*YOĞUN/i;
const SERBEST_RE = /\bSERBEST\b/i;

export function normalizeFundSymbol(symbol: string | null | undefined): string {
  return String(symbol ?? '')
    .trim()
    .toUpperCase();
}

export function parseTefasListedStatus(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (s.includes('işlem gör') && !s.includes('görmüyor') && !s.includes('gormuyor')) return true;
  if (s.includes('görmüyor') || s.includes('gormuyor') || s.includes('platformda')) return false;
  return null;
}

export function inferCategoryFromUmbrella(umbrellaType: string | null | undefined): string | null {
  const u = String(umbrellaType ?? '').trim().toLowerCase();
  if (!u) return null;
  if (u.includes('hisse senedi')) return 'Hisse Senedi Yoğun';
  if (u.includes('para piyasası') || u.includes('para piyasasi')) return 'Para Piyasası Fonu';
  if (u.includes('borçlanma') || u.includes('borclanma')) return 'Borçlanma Araçları Fonu';
  if (u.includes('değişken') || u.includes('degisken')) return 'Değişken Fon';
  if (u.includes('karma')) return 'Karma Fon';
  if (u.includes('fon sepet')) return 'Fon Sepeti Fonu';
  if (u.includes('katılım') || u.includes('katilim')) return 'Katılım Fonu';
  if (u.includes('kıymetli maden') || u.includes('kiymetli maden')) return 'Kıymetli Madenler Fonu';
  if (u.includes('serbest')) return 'Serbest Fon';
  if (u.includes('gayrimenkul')) return 'Gayrimenkul Yatırım Fonları';
  if (u.includes('girişim') || u.includes('girisim')) return 'Girişim Sermayesi Yatırım Fonları';
  return null;
}

export function inferCategoryFromName(fundName: string): string | null {
  const u = fundName.toUpperCase();
  if (HISSE_YOGUN_RE.test(u)) return 'Hisse Senedi Yoğun';
  if (u.includes('PARA PİYASASI') || u.includes('PARA PIYASASI')) return 'Para Piyasası Fonu';
  if (u.includes('BORÇLANMA') || u.includes('BORCLANMA')) return 'Borçlanma Araçları Fonu';
  if (u.includes('DEĞİŞKEN') || u.includes('DEGISKEN')) return 'Değişken Fon';
  if (u.includes('KARMA')) return 'Karma Fon';
  if (u.includes('FON SEPET')) return 'Fon Sepeti Fonu';
  if (u.includes('KATILIM')) return 'Katılım Fonu';
  if (u.includes('ALTIN') || u.includes('KıYMETLI MADEN') || u.includes('KIYMETLI MADEN')) {
    return 'Kıymetli Madenler Fonu';
  }
  if (u.includes('EUROBOND')) return 'Eurobond Fonu';
  if (u.includes('GAYRİMENKUL') || u.includes('GAYRIMENKUL')) return 'Gayrimenkul Yatırım Fonları';
  if (u.includes('GİRİŞİM') || u.includes('GIRISIM')) return 'Girişim Sermayesi Yatırım Fonları';
  if (SERBEST_RE.test(u)) return 'Serbest Fon';
  return null;
}

export function classifyFundTax(input: {
  symbol: string;
  fundKind: FundKind;
  fundName: string;
  umbrellaType?: string | null;
  category?: string | null;
  tefasListed?: boolean | null;
}): FundTaxClassification {
  const fundName = String(input.fundName ?? '').trim();
  const symbol = normalizeFundSymbol(input.symbol);
  const categoryFromApi = input.category?.trim() || null;
  const category = categoryFromApi ?? inferCategoryFromName(fundName);

  const isHisseYogun =
    category === 'Hisse Senedi Yoğun' ||
    HISSE_YOGUN_RE.test(fundName) ||
    (input.umbrellaType?.toLowerCase().includes('hisse senedi') ?? false);

  const isSerbest =
    category === 'Serbest Fon' ||
    SERBEST_RE.test(fundName) ||
    (input.umbrellaType?.toLowerCase().includes('serbest') ?? false);

  let tefasListed = input.tefasListed ?? null;
  if (tefasListed == null) {
    if (input.fundKind === 'GYF' || input.fundKind === 'GSYF') {
      tefasListed = false;
    } else if (input.fundKind === 'BYF') {
      tefasListed = true;
    } else {
      tefasListed = true;
    }
  }

  return {
    symbol,
    fundKind: input.fundKind,
    fundName,
    umbrellaType: input.umbrellaType?.trim() || null,
    category,
    isHisseYogun,
    isSerbest,
    tefasListed,
  };
}
