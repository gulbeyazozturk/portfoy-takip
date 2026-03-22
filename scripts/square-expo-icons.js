/**
 * Expo / expo-doctor: icon ve adaptive görseller kare olmalı (ör. 1024×1024).
 * Geniş format (1376×768 vb.) merkezden kırpılıp yeniden boyutlanır.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SIZE = 1024;

const FILES = [
  { file: 'assets/images/icon.png', fit: 'cover' },
  { file: 'assets/images/android-icon-foreground.png', fit: 'cover' },
  { file: 'assets/images/android-icon-background.png', fit: 'cover' },
  { file: 'assets/images/android-icon-monochrome.png', fit: 'cover' },
  { file: 'assets/images/splash-icon.png', fit: 'contain' },
  { file: 'assets/images/favicon.png', fit: 'cover' },
];

async function fixOne(rel, fit) {
  const input = path.join(ROOT, rel);
  if (!fs.existsSync(input)) {
    console.warn('Atlandı (yok):', rel);
    return;
  }
  const tmp = path.join(ROOT, rel + '.__square__.png');
  const resizeOpts =
    fit === 'contain'
      ? {
          fit: 'contain',
          position: 'centre',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        }
      : { fit: 'cover', position: 'centre' };

  await sharp(input).resize(SIZE, SIZE, resizeOpts).png().toFile(tmp);
  fs.renameSync(tmp, input);
  console.log('OK', rel, '→', SIZE, '×', SIZE, `(${fit})`);
}

async function main() {
  for (const { file, fit = 'cover' } of FILES) {
    await fixOne(file, fit);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
