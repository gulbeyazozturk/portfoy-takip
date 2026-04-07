import * as Linking from 'expo-linking';

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseUrlParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const [, hash = ''] = url.split('#');
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';

  const all = [query, hash].filter(Boolean).join('&');
  all.split('&').forEach((entry) => {
    if (!entry) return;
    const eq = entry.indexOf('=');
    const k = eq >= 0 ? entry.slice(0, eq) : entry;
    const v = eq >= 0 ? entry.slice(eq + 1) : '';
    if (!k) return;
    out[safeDecode(k)] = safeDecode(v);
  });
  return out;
}

/** Deep link / OAuth / şifre sıfırlama dönüşü için URL parçaları. */
export function parseAuthCallbackParams(url: string): Record<string, string> {
  const out = parseUrlParams(url);
  try {
    const parsed = Linking.parse(url);
    if (parsed.queryParams) {
      for (const [k, v] of Object.entries(parsed.queryParams)) {
        if (v == null) continue;
        const raw = Array.isArray(v) ? v[0] : v;
        if (raw == null) continue;
        out[k] = typeof raw === 'string' ? safeDecode(raw) : safeDecode(String(raw));
      }
    }
  } catch {
    /* parseUrlParams yeterli */
  }
  return out;
}
