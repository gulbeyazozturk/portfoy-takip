const usdTryHistoryCache = new Map<string, number | null>();

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** Tarihsel USD/TRY (1 USD kaç TL); Stooq günlük kapanış, yoksa Frankfurter. */
export async function fetchUsdTryHistorical(date: Date): Promise<number | null> {
  const targetIso = date.toISOString().slice(0, 10);
  if (usdTryHistoryCache.has(targetIso)) return usdTryHistoryCache.get(targetIso) ?? null;

  const baseUrl = 'http://stooq.com/q/d/l/?s=usdtry&i=d';
  let csv = await fetchText(baseUrl.replace('http://', 'https://'));
  if (!csv) csv = await fetchText(`https://r.jina.ai/${baseUrl}`);
  if (!csv) {
    usdTryHistoryCache.set(targetIso, null);
    return null;
  }

  const header = 'Date,Open,High,Low,Close,Volume';
  const start = csv.indexOf(header);
  const effective = start >= 0 ? csv.slice(start) : csv;
  const lines = effective.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    usdTryHistoryCache.set(targetIso, null);
    return null;
  }

  let bestDate = '';
  let bestClose: number | null = null;
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    if (cols.length < 5) continue;
    const d = String(cols[0] || '').trim();
    if (!d || d > targetIso) continue;
    const close = Number(cols[4]);
    if (!Number.isFinite(close) || close <= 0) continue;
    if (bestDate === '' || d > bestDate) {
      bestDate = d;
      bestClose = close;
    }
  }

  usdTryHistoryCache.set(targetIso, bestClose);
  if (bestClose != null && bestClose > 0) return bestClose;

  const toIso = targetIso;
  const from = new Date(date);
  from.setUTCDate(from.getUTCDate() - 14);
  const fromIso = from.toISOString().slice(0, 10);
  const ffUrl = `https://api.frankfurter.app/${fromIso}..${toIso}?from=USD&to=TRY`;
  try {
    const r = await fetch(ffUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const json = await r.json();
      const rates = json?.rates && typeof json.rates === 'object' ? json.rates : null;
      if (rates) {
        let ffBestDate = '';
        let ffBestRate: number | null = null;
        for (const [d, row] of Object.entries(rates as Record<string, unknown>)) {
          if (!d || d > targetIso) continue;
          const n = Number((row as { TRY?: number })?.TRY);
          if (!Number.isFinite(n) || n <= 0) continue;
          if (ffBestDate === '' || d > ffBestDate) {
            ffBestDate = d;
            ffBestRate = n;
          }
        }
        usdTryHistoryCache.set(targetIso, ffBestRate);
        return ffBestRate;
      }
    }
  } catch {
    /* ignore */
  }

  return bestClose;
}
