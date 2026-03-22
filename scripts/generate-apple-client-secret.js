/**
 * Apple "Sign in with Apple" OAuth client secret (JWT) üretir.
 * .p8 dosyası sadece senin bilgisayarında kalır; repoya ekleme (*.p8 .gitignore'da).
 *
 * Kullanım (PowerShell):
 *   $env:APPLE_TEAM_ID="XXXXXXXXXX"
 *   $env:APPLE_KEY_ID="XXXXXXXXXX"
 *   $env:APPLE_CLIENT_ID="com.omnifolio.signin"
 *   node scripts/generate-apple-client-secret.js "C:\path\to\AuthKey_XXXXXXXXXX.p8"
 *
 * Çıktı: tek satır JWT → Supabase → Apple → Secret Key alanına yapıştır.
 */
const fs = require('fs');
const path = require('path');
const { SignJWT, importPKCS8 } = require('jose');

/** Apple: max 6 ay = 15_552_000 saniye */
const MAX_EXP_SECONDS = 15552000;

/**
 * Windows'ta bazen "Yol olarak kopyala" `:\Users\...` üretir (başta `C` eksik).
 * Node path.resolve bunu göreli sanıp proje klasörüne yapıştırır → bozuk yol.
 */
function normalizeP8PathInput(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  let s = raw.trim().replace(/^["']|["']$/g, '');
  s = s.replace(/\//g, '\\');
  if (/^:\\Users\\/i.test(s)) {
    s = 'C' + s;
  } else if (/^\\Users\\/i.test(s)) {
    s = 'C:' + s;
  }
  return s;
}

async function main() {
  const p8Path = process.argv[2] || process.env.APPLE_P8_PATH;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID || 'com.omnifolio.signin';

  if (!p8Path || !teamId || !keyId) {
    console.error(`
Eksik parametre.

Gerekli ortam değişkenleri:
  APPLE_TEAM_ID    → developer.apple.com → Membership → Team ID
  APPLE_KEY_ID     → Keys sayfasında indirdiğin .p8 için Key ID
  APPLE_CLIENT_ID  → Services ID (örn. com.omnifolio.signin), opsiyonel varsayılan bu

Argüman:
  .p8 dosyasının tam yolu

Örnek:
  set APPLE_TEAM_ID=YOURTEAMID
  set APPLE_KEY_ID=ABC123XYZ
  set APPLE_CLIENT_ID=com.omnifolio.signin
  node scripts/generate-apple-client-secret.js C:\\Users\\You\\Downloads\\AuthKey_ABC123XYZ.p8
`);
    process.exit(1);
  }

  const cleaned = normalizeP8PathInput(p8Path);
  const resolved = path.isAbsolute(cleaned)
    ? path.normalize(cleaned)
    : path.resolve(cleaned);
  const looksPlaceholder =
    /Tam\\Yol|Tam\/Yol|XXXXX/i.test(resolved) || /placeholder/i.test(resolved);
  if (looksPlaceholder) {
    console.error(`
Bu yol örnek metindi — Apple'dan indirdiğiniz gerçek .p8 dosyasının tam yolunu kullanın.

Örnek (İndirilenler):
  "C:\\Users\\Haşim Öztürk\\Downloads\\AuthKey_AB12CD34EF.p8"

İpucu: Dosyaya Explorer'da sağ tık → "Yol olarak kopyala" (Windows 11) veya sürükleyip terminal penceresine bırakın.
`);
    process.exit(1);
  }
  if (!fs.existsSync(resolved)) {
    console.error('Dosya bulunamadı:', resolved);
    console.error('Yolu kontrol edin; dosya adı genelde AuthKey_XXXXXXXXXX.p8 şeklindedir.');
    process.exit(1);
  }

  const pem = fs.readFileSync(resolved, 'utf8');
  const privateKey = await importPKCS8(pem);

  const now = Math.floor(Date.now() / 1000);
  const exp = now + MAX_EXP_SECONDS;

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  console.log(jwt);
}

main().catch((e) => {
  console.error('Hata:', e.message || e);
  process.exit(1);
});
