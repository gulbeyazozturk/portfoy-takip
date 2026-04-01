const stripQuotes = (value: string) =>
  (value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();

/**
 * Toplu CSV: **GG.AA.YYYY** (veya `/` `-` ayraçlı). Boş hücre = `empty`.
 */
export function parseBulkCsvPurchaseDate(raw: string | null | undefined): { iso: string } | 'invalid' | 'empty' {
  const s = stripQuotes(raw ?? '').trim();
  if (!s) return 'empty';
  const parts = s.split(/[.\/\-]/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length !== 3) return 'invalid';
  const d = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10);
  const y = parseInt(parts[2]!, 10);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return 'invalid';
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return 'invalid';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return 'invalid';
  return { iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}
