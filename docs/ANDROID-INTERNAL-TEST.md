# Android test dağıtımı (EAS — 1. yol: internal / preview)

TestFlight benzeri “link ile kur” akışı: **EAS Build** + **`preview`** profili (`distribution: internal`).

## Ön koşullar

- [Expo](https://expo.dev) hesabı (projede `owner: hozturk907` tanımlı).
- Bilgisayarda **Node.js** ve proje klasörü.
- Android testçiler: Gmail ile Expo’ya davet edilebilir (isteğe bağlı; link paylaşımı da yeterli olabilir).

## Adım adım tarife

### 1) Bağımlılıklar

Proje kökünde:

```bash
npm install
```

### 2) EAS CLI ile giriş

```bash
npm run eas:login
```

veya:

```bash
npx eas-cli login
```

Tarayıcıda Expo hesabınla oturum aç.

### 3) Build ortam değişkenleri (Supabase — kritik)

Uygulama `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_ANON_KEY` ile çalışır. **EAS build sunucusunda** bu değerler tanımlı olmalı (yerel `.env` otomatik gitmez).

1. [expo.dev](https://expo.dev) → **hozturk907** → proje **omnifolio** (veya slug: omnifolio).
2. **Environment variables** (veya Secrets).
3. **Preview** (ve gerekiyorsa **Production**) için şunları ekle:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Değerler `.env` ile aynı olmalı. Ayrıntı: `docs/EAS-ENV.md`.

### 4) Android preview build başlat

Proje kökünde:

```bash
npm run android:preview:build
```

veya:

```bash
npx eas-cli build --platform android --profile preview
```

İlk seferde EAS sorabilir:

- **Yeni Android keystore** oluşturulsun mu? → Genelde **Evet** (Expo yönetimi).
- Sözleşme / hesap onayı.

### 5) Build bitene kadar bekle

Terminalde link veya **Expo dashboard** → **Builds** → ilgili Android build → durum **Finished**.

### 6) Testçilere paylaş

- Build sayfasındaki **Install** / **Download** / **internal distribution** linkini kopyala.
- Testçilere gönder (WhatsApp, e-posta).
- Testçi **telefonda linke tıklar** → tarayıcı / Expo akışı ile **APK indirip kurar** (cihaza göre “bilinmeyen kaynaklara izin” gerekebilir).

### 7) Yeni sürüm

Kod değişince aynı komutu tekrar çalıştır:

```bash
npm run android:preview:build
```

Yeni link veya aynı internal grup güncellemesi (Expo arayüzüne göre değişir).

---

## Sorun giderme

| Durum | Ne yap |
|--------|--------|
| Uygulama açılıyor ama Supabase hata veriyor | EAS Environment variables’da `EXPO_PUBLIC_*` eksik/yanlış |
| Build başlamıyor | `eas login`, internet, Expo hesap kotası |
| Kurulum engelleniyor | Ayarlar → Güvenlik → Bilinmeyen uygulamalara izin (markaya göre değişir) |

## Profil özeti (`eas.json`)

- **`preview`**: `distribution: internal` → dahili test linki.
- İleride mağaza için: `--profile production` ile **AAB** ve Play Console adımları (`docs/` içinde ayrı anlatılabilir).
