/**
 * Node ile decodeCsvFileBytes doğrulaması: npx tsx scripts/verify-decode-csv-bytes.ts
 */
import { decodeCsvFileBytes } from '../lib/decode-csv-file-bytes';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const enc = new TextEncoder();

// ASCII / UTF-8
assert(decodeCsvFileBytes(enc.encode('a;b;c\n1;2;3')) === 'a;b;c\n1;2;3', 'plain utf8');

// UTF-8 BOM
const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('header')]);
assert(decodeCsvFileBytes(bom) === 'header', 'strip BOM');

// UTF-8 Turkish (valid multibyte)
const trUtf8 = enc.encode('Portföy;Varlık Tipi;Adet\n');
const trOut = decodeCsvFileBytes(trUtf8);
assert(trOut.includes('Portföy'), 'utf8 TR portfolio');
assert(trOut.includes('Varlık'), 'utf8 TR varlik');

// windows-1254: Portföy;Varlık — küçük ö=0xF6, dotless ı=0xFD
const cp1254 = new Uint8Array([
  0x50, 0x6f, 0x72, 0x74, 0x66, 0xf6, 0x79, 0x3b, 0x56, 0x61, 0x72, 0x6c, 0xfd, 0x6b,
]);
const cpOut = decodeCsvFileBytes(cp1254);
assert(cpOut === 'Portföy;Varlık', `cp1254 roundtrip got ${JSON.stringify(cpOut)}`);
assert(!cpOut.includes('\uFFFD'), 'cp1254 no replacement char');

// Tam başlık satırı CP1254 (Excel TR "CSV") — skorlama UTF-8 yanlış pozitifini ezer
const cp1254Header = new Uint8Array([
  80, 111, 114, 116, 102, 246, 121, 59, 86, 97, 114, 108, 253, 107, 32, 84, 105, 112, 105, 59, 86, 97, 114, 108, 253, 107, 59,
  65, 100, 101, 116,
]);
const hdrOut = decodeCsvFileBytes(cp1254Header);
assert(
  hdrOut.includes('Varlık Tipi') && hdrOut.includes('Adet'),
  `cp1254 header line got ${JSON.stringify(hdrOut)}`
);

assert(decodeCsvFileBytes(new Uint8Array(0)) === '', 'empty file');

// UTF-16 LE + BOM (Excel/Numbers)
function utf16leBom(s: string): Uint8Array {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[2 + i * 2 + 1] = (c >> 8) & 0xff;
  }
  return out;
}
const u16 = decodeCsvFileBytes(utf16leBom('Portföy;Varlık Tipi;Varlık;Adet'));
assert(u16.includes('Varlık Tipi'), 'utf-16le bom turkish header');

// Geçersiz UTF-8 (UTF-16 BOM ile karıştırma) — çökmez
const badUtf8 = new Uint8Array([0xc0, 0xc0, 0x41]);
const badOut = decodeCsvFileBytes(badUtf8);
assert(typeof badOut === 'string', 'invalid utf8 still returns string');

console.log('verify-decode-csv-bytes: all checks passed');
