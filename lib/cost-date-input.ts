function parseCostDateParts(day: string, month: string, year: string): Date | null {
  if (!(day && month && year)) return null;
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

/** GG.AA.YYYY / GG/AA/YYYY / GG-AA-YYYY */
export function parseCostDateText(text: string): Date | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  return parseCostDateParts(m[1], m[2], m[3]);
}

export function formatCostDateText(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  return `${day}.${month}.${year}`;
}

export function formatCostDateFromIso(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function sanitizeCostDateText(raw: string): string {
  return raw.replace(/[^\d./-]/g, '').slice(0, 10);
}
