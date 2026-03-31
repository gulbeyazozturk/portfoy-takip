type Params = {
  categoryId?: string;
  symbol?: string;
};

function toNum(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseTrNum(v: string): number | null {
  const n = Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function instantYurtdisi(symbol: string): Promise<number | null> {
  const s = symbol.toLowerCase();
  const baseUrl = `http://stooq.com/q/l/?s=${encodeURIComponent(s)}.us&f=sd2t2ohlcv&h&e=csv`;
  let csv = await fetchText(baseUrl.replace('http://', 'https://'));
  // Web/CORS fallback: jina proxy üzerinden getir
  if (!csv) {
    csv = await fetchText(`https://r.jina.ai/${baseUrl}`);
  }
  if (!csv) return null;
  // r.jina.ai cevabında markdown önsözü olabilir; CSV satırlarını ayıkla
  const csvStart = csv.indexOf('Symbol,Date,Time,Open,High,Low,Close,Volume');
  const effective = csvStart >= 0 ? csv.slice(csvStart) : csv;
  const lines = effective.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const cols = lines[1].split(',');
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  return toNum(cols[6]);
}

async function instantDoviz(symbol: string): Promise<number | null> {
  const data = await fetchJson('https://open.er-api.com/v6/latest/USD');
  if (!data?.rates?.TRY) return null;
  const usdTry = Number(data.rates.TRY);
  if (!Number.isFinite(usdTry) || usdTry <= 0) return null;
  if (symbol === 'USD') return usdTry;
  const rate = Number(data.rates[symbol]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return usdTry / rate;
}

async function instantKripto(symbol: string): Promise<number | null> {
  const search = await fetchJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
  const coins = Array.isArray(search?.coins) ? search.coins : [];
  const exact = coins.find((c: any) => String(c?.symbol || '').toUpperCase() === symbol.toUpperCase());
  const id = exact?.id;
  if (!id) return null;
  const p = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=try`
  );
  return toNum(p?.[id]?.try);
}

async function instantFon(symbol: string): Promise<number | null> {
  const now = new Date();
  const d1 = new Date(now);
  d1.setDate(now.getDate() - 7);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  const body = `fontip=YAT&fonkod=${encodeURIComponent(symbol)}&bastarih=${fmt(d1)}&bittarih=${fmt(now)}`;
  try {
    const res = await fetch('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://www.tefas.gov.tr',
        'Referer': 'https://www.tefas.gov.tr/TarihselVeriler.aspx',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const arr = Array.isArray(json?.data) ? json.data : [];
    if (!arr.length) return null;
    const last = arr[0];
    return toNum(last?.FIYAT);
  } catch {
    return null;
  }
}

async function instantEmtia(symbol: string): Promise<number | null> {
  const keyMap: Record<string, string> = {
    ALTIN_22_AYAR_BILEZIK: '22-ayar-bilezik',
    ALTIN_14_AYAR: '14-ayar-altin',
    ALTIN_18_AYAR: '18-ayar-altin',
    GAU_TRY: 'gram-altin',
    GUMUS_GRAM: 'gumus',
    CEYREK_YENI: 'ceyrek-altin',
    YARIM_YENI: 'yarim-altin',
    TAM_YENI: 'tam-altin',
    CUMHURIYET_YENI: 'cumhuriyet-altini',
  };
  const key = keyMap[symbol];
  if (!key) return null;
  const data = await fetchJson('https://finans.truncgil.com/v3/today.json');
  const row = data?.[key];
  if (!row?.Buying) return null;
  return parseTrNum(String(row.Buying));
}

async function instantBist(symbol: string): Promise<number | null> {
  const html = await fetchText('https://www.borsa.net/hisse');
  if (!html) return null;
  const upper = symbol.toUpperCase();
  const rowRegex = new RegExp(
    `<tr[^>]*>[\\s\\S]*?<td[^>]*>\\s*${upper}\\s*</td>[\\s\\S]*?<td[^>]*>[\\s\\S]*?</td>[\\s\\S]*?<td[^>]*>([\\d.,]+)</td>`,
    'i'
  );
  const m = html.match(rowRegex);
  if (!m?.[1]) return null;
  return parseTrNum(m[1]);
}

export async function fetchInstantUnitPrice({ categoryId, symbol }: Params): Promise<number | null> {
  if (!categoryId || !symbol) return null;
  const s = symbol.toUpperCase();
  switch (categoryId) {
    case 'yurtdisi':
      return await instantYurtdisi(s);
    case 'doviz':
      return await instantDoviz(s);
    case 'kripto':
      return await instantKripto(s);
    case 'fon':
      return await instantFon(s);
    case 'emtia':
      return await instantEmtia(s);
    case 'bist':
      return await instantBist(s);
    default:
      return null;
  }
}
