/**
 * BIST: DB'de `name` ile `symbol` aynı kaldığında gösterim adı (yedek).
 * Kalıcı çözüm: `sync-bist-assets` (NosyAPI FullName) veya kazıyıcıdan doğru `name`.
 */
const BIST_NAMES: Record<string, string> = {
  TUPRS: 'Tüpraş',
  THYAO: 'Türk Hava Yolları',
  AKBNK: 'Akbank',
  GARAN: 'Garanti BBVA',
  YKBNK: 'Yapı ve Kredi Bankası',
  ISCTR: 'Türkiye İş Bankası (C)',
  ISATR: 'Türkiye İş Bankası (A)',
  ISBTR: 'Türkiye İş Bankası (B)',
  HALKB: 'Halkbank',
  VAKBN: 'Vakıfbank',
  QNBTR: 'QNB Finansbank',
  SASA: 'SASA Polyester',
  PETKM: 'Petkim',
  EREGL: 'Ereğli Demir ve Çelik',
  TCELL: 'Türkcell',
  BIMAS: 'BİM',
  ARCLK: 'Arçelik',
  KOZAL: 'Koza Altın',
  KOZAA: 'Koza Anadolu Metal Madencilik',
  ENKAI: 'Enka İnşaat',
  TTKOM: 'Türk Telekom',
  PGSUS: 'Pegasus',
  AKSEN: 'Aksa Enerji',
  ENJSA: 'Enerjisa',
  KCHOL: 'Koç Holding',
  SAHOL: 'Hüner Holding',
  FROTO: 'Ford Otosan',
  TOASO: 'Tofaş',
  EKGYO: 'Emlak Konut GYO',
  MPARK: 'MLP Sağlık',
  SISE: 'Şişecam',
  AEFES: 'Anadolu Efes',
  ULKER: 'Ülker Bisküvi',
  MAVI: 'Mavi',
  DOHOL: 'Doğan Holding',
  VESTL: 'Vestel',
  TAVHL: 'TAV Havalimanları',
  ALARK: 'Alarko Holding',
  ALBRK: 'Albaraka Türk',
  ANSGR: 'Anadolu Sigorta',
  ASELS: 'Aselsan',
  AYGAZ: 'Aygaz',
  BFREN: 'Bosch Fren',
  BRISA: 'Brisa',
  CCOLA: 'Coca-Cola İçecek',
  CIMSA: 'Çimsa',
  DOAS: 'Doğuş Otomotiv',
  ECILC: 'Eczacıbaşı İlaç',
  EGEEN: 'Ege Endüstri',
  ESCAR: 'Escar Filo',
  GLYHO: 'Global Yatırım Holding',
  GWIND: 'Galata Wind Enerji',
  HEKTS: 'Hektas',
  INVEO: 'İnveo Yatırım Holding',
  IZMDC: 'İzmir Demir Çelik',
  KARSN: 'Karsan',
  KLKIM: 'Kalekim',
  KONTR: 'Kontrolmatik',
  KORDS: 'Kordsa',
  KTLEV: 'Katılımevim',
  LMKDC: 'Likidite Varlık',
  LOGO: 'Logo Yazılım',
  MGROS: 'Migros',
  NETAS: 'Netaş',
  NTHOL: 'Net Holding',
  ODAS: 'Odas',
  OTKAR: 'Otokar',
  OYAKC: 'Oyak Çimento',
  PENTA: 'Penta Teknoloji',
  PNLSN: 'Pınar Süt',
  POLHO: 'Polisan Holding',
  PRKAB: 'Türk Prysmian Kablo',
  QUAGR: 'Qua Granite',
  SOKM: 'Sokmarket',
  TATGD: 'Tat Gıda',
  TBORG: 'Tab Gıda',
  TKFEN: 'Tekfen Holding',
  TRGYO: 'Torunlar GYO',
  TSGYO: 'TSKB GYO',
  TTRAK: 'Türk Traktör',
  TUKAS: 'Tukaş',
  VAKKO: 'Vakko Tekstil',
  VKGYO: 'Vakıf GYO',
  YATAS: 'Yataş',
  YEOTK: 'Yeo Teknoloji',
  ZOREN: 'Zorlu Enerji',
  AKCNS: 'Akçansa',
  AKFGY: 'Akfen GYO',
  AKSA: 'Aksa Akrilik',
  ANHYT: 'Anadolu Hayat Emeklilik',
  ARENA: 'Arena Bilgisayar',
  ATAGY: 'Ata GYO',
  AVGYO: 'Avrasya GYO',
  BANVT: 'Banvit',
  BRKO: 'Berkosan',
  BRSAN: 'Borusan',
  BUCIM: 'Bursa Çimento',
  CLEBI: 'Çelebi',
  CRFSA: 'CarrefourSA',
  DAPGM: 'Dap Gayrimenkul',
  DESA: 'Desa',
  DEVA: 'Deva Holding',
  DITAS: 'Ditaş',
  EGEPO: 'Ege Profil',
  ELITE: 'Elite Naturel',
  GUBRF: 'Gübretaş',
  ISDMR: 'İskenderun Demir Çelik',
  JANTS: 'Jantsa',
  KAREL: 'Karel',
  KATMR: 'Katmerciler',
  KONYA: 'Konya Çimento',
  KRSTL: 'Kristal Kola',
  KRTEK: 'Karsu Tekstil',
  MAALT: 'Marmaris Altınyunus',
  MARTI: 'Martı Otel',
  NUHCM: 'Nuh Çimento',
  ONCSM: 'Oncosem',
  ORGE: 'Orge Enerji',
  PAGYO: 'Panora GYO',
  PARSN: 'Parsan',
  PKART: 'Plastikkart',
  RAYSG: 'Ray Sigorta',
  SKBNK: 'Şekerbank',
  SMRTG: 'Smart Güneş',
  TERA: 'Tera Yatırım',
  TKNSA: 'Teknosa',
  TRALT: 'Türk Altın',
  TUCLK: 'Tuğçelik',
  YUNSA: 'Yünsa',
  ZRGYO: 'Ziraat GYO',
  ADESE: 'Adese Alışveriş',
  AGHOL: 'AG Anadolu Grubu Holding',
  AKFYE: 'Akfen Yenilenebilir',
  ALCTL: 'Alcatel Lucent Teletaş',
  ALTNY: 'Altınay Savunma',
  BAGFS: 'Bagfaş',
  BJKAS: 'Beşiktaş Futbol',
  EGGUB: 'Ege Gübre',
  FENER: 'Fenerbahçe Futbol',
  GEDIK: 'Gedik Yatırım',
  IHLAS: 'İhlas Holding',
  KLSER: 'Kaleseramik',
  KMPUR: 'Kimteks Poliüretan',
  KRDMD: 'Kardemir (D)',
  KRDMA: 'Kardemir (A)',
  KRDMB: 'Kardemir (B)',
  KRDMC: 'Kardemir (C)',
  OZRDN: 'Özderici',
  PETUN: 'Pınar Et ve Un',
  SELEC: 'Selçuk Ecza',
  SNGYO: 'Sinpaş GYO',
  TRILC: 'Türk İlaç ve Serum',
  VAKFN: 'Vakıf Faktoring',
  YGGYO: 'Yeni Gimat GYO',
  YIGIT: 'Yiğit Akü',
  ZEDUR: 'Zedur Enerji',
};

function normSymbol(symbol: string): string {
  return symbol.replace(/^M\d+_/, '').trim().toUpperCase();
}

function trLoose(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ş/g, 'ş')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Excel’de sık yazılan yanlış kod -> gerçek BIST sembolü */
const BIST_CSV_SYMBOL_ALIASES: Readonly<Record<string, string>> = {
  MIGROS: 'MGROS',
};

let labelLooseToSymbolCache: Record<string, string> | null = null;

function labelLooseToSymbolMap(): Record<string, string> {
  if (labelLooseToSymbolCache) return labelLooseToSymbolCache;
  const m: Record<string, string> = {};
  for (const [sym, label] of Object.entries(BIST_NAMES)) {
    m[trLoose(label)] = sym;
  }
  labelLooseToSymbolCache = m;
  return m;
}

/**
 * Toplu CSV: BIST varlık hücresini DB’deki `symbol` ile eşleşecek metne çevirir.
 * Örn. MIGROS → MGROS; "Migros" → MGROS (BIST_NAMES üzerinden).
 */
export function resolveBistCsvToCanonicalSymbol(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const compact = trimmed.replace(/\s/g, '').toUpperCase();
  const alias = BIST_CSV_SYMBOL_ALIASES[compact];
  if (alias) return alias;
  const fromLabel = labelLooseToSymbolMap()[trLoose(trimmed)];
  if (fromLabel) return fromLabel;
  return trimmed;
}

/** BIST için liste / detay başlığında gösterilecek şirket adı */
export function resolveBistDisplayName(symbol: string, nameFromDb: string | null | undefined): string {
  const sym = normSymbol(symbol);
  const db = (nameFromDb ?? '').trim();
  if (db) {
    const dbCompact = db.replace(/\s/g, '').toUpperCase();
    if (dbCompact !== sym) return db;
  }
  return BIST_NAMES[sym] ?? db ?? sym;
}
