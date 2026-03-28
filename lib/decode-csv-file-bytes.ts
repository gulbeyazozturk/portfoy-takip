/**
 * iOS: Expo File.text() bazen kodlama tespit edemez. Ham bayttan çözüm.
 * TR Excel "CSV" çoğu zaman Windows-1254; UTF-8 gibi okununca başlık tanınmaz (0 adet olsa bile).
 * Birden fazla TextDecoder çıktısı puanlanır, en olası Türkçe CSV metni seçilir.
 * UTF-16 BOM ayrı ele alınır.
 */

/** İçerik metninin Türkçe CSV / başlık satırına ne kadar benzediği (yüksek = daha iyi). */
export function scoreCsvDecodingCandidate(text: string): number {
  if (!text || !text.trim()) return -1_000_000;
  let score = 0;
  const replacement = text.split('\uFFFD').length - 1;
  score -= replacement * 20;

  const probe = text.slice(0, 2000);
  const firstLine = probe.split(/\r\n|\n|\r/).find((l) => l.trim()) ?? '';
  const fl = firstLine.trim();
  if (!fl) return score - 500;

  const semi = (fl.match(/;/g) || []).length;
  if (semi >= 2) score += 14;
  if (semi >= 3) score += 10;
  if (semi >= 5) score += 6;

  const low = fl.normalize('NFC').toLowerCase();
  if (low.includes('varlık') || low.includes('varlik')) score += 22;
  if (low.includes('tipi') || low.includes('type')) score += 6;
  if (low.includes('portföy') || low.includes('portfoy') || low.includes('portfolio')) score += 12;
  if (low.includes('adet') || low.includes('quantity') || low.includes('miktar')) score += 12;
  if (low.includes('maliyet') || low.includes('average') || low.includes('cost')) score += 8;
  if (low.includes('sembol') || low.includes('symbol')) score += 4;

  // CP1254 yanlışlıkla UTF-8 sanılınca sık görülen anlamsız diziler
  if (fl.includes('Ã') || fl.includes('Â') || fl.includes('Ä')) score -= 28;

  return score;
}

function tryDecodeLabel(slice: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label).decode(slice);
  } catch {
    return null;
  }
}

function uniqueCandidates(strings: string[]): string[] {
  const out: string[] = [];
  for (const s of strings) {
    if (out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

export function decodeCsvFileBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    try {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    } catch {
      /* aşağı */
    }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    try {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    } catch {
      /* aşağı */
    }
  }

  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    start = 3;
  }
  const slice = bytes.subarray(start);

  const utf8Loose = new TextDecoder('utf-8', { fatal: false }).decode(slice);

  const candidates: string[] = [utf8Loose];
  for (const label of ['windows-1254', 'iso-8859-9', 'windows-1252'] as const) {
    const s = tryDecodeLabel(slice, label);
    if (s != null) candidates.push(s);
  }

  const uniq = uniqueCandidates(candidates);
  let best = uniq[0]!;
  let bestScore = scoreCsvDecodingCandidate(best);
  for (let i = 1; i < uniq.length; i++) {
    const s = uniq[i]!;
    const sc = scoreCsvDecodingCandidate(s);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return best;
}
