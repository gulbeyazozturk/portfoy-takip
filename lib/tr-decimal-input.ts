/** TR locale ondalık metin girişi (virgül veya nokta). */

export function sanitizeTrDecimalInput(raw: string, maxDecimals = 10): string {
  const normalized = raw.replace(/\./g, ',');
  let out = '';
  let seenComma = false;
  for (const ch of normalized) {
    if (ch >= '0' && ch <= '9') {
      if (seenComma) {
        const decLen = out.length - out.indexOf(',') - 1;
        if (decLen < maxDecimals) out += ch;
      } else if (out.length < 14) {
        out += ch;
      }
    } else if (ch === ',' && !seenComma) {
      if (out.length === 0) out = '0';
      out += ',';
      seenComma = true;
    }
  }
  return out;
}

export function parseTrDecimal(raw: string | undefined | null): number {
  const s = (raw ?? '').trim();
  if (!s) return 0;
  const t = s.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}
