/** Holding `notes` içinde maliyet tarihi: `[cost_date:YYYY-MM-DD]` */

export function extractCostDateFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/\[cost_date:(\d{4}-\d{2}-\d{2})\]/);
  return m?.[1] ?? null;
}

export function upsertCostDateInNotes(notes: string | null | undefined, isoDate: string | null): string | null {
  const base = (notes ?? '').replace(/\s*\[cost_date:\d{4}-\d{2}-\d{2}\]\s*/g, '').trim();
  if (!isoDate) return base || null;
  return base ? `${base} [cost_date:${isoDate}]` : `[cost_date:${isoDate}]`;
}
