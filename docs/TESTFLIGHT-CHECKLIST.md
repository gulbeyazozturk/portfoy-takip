# TestFlight Hazirlik Checklist

Bu dosya, projeyi TestFlight'a gondermek icin minimum adimlari siralar.

## 0) EAS ortam degiskenleri (Supabase) — sart

Yerel `.env` **EAS build'e gitmez**. Asagidakileri **Expo Dashboard → Environment variables** (production) veya `eas env:create` ile tanimlayin; sonra **yeni iOS build** alin:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Ayrintilar: **`docs/EAS-ENV.md`**. Bunlar yoksa TestFlight surumu acilirken coker veya oturum acilmaz.

## 0b) Uygulama ikonu

`app.json` icindeki `./assets/images/icon.png` dosyasi **1024x1024** kare, markaniza ait PNG olmali. Su an varsayilan **Expo logosu** ise TestFlight / App Store’da da Expo ikonu gorunur — dosyayi degistirip yeni build alin.

## 1) Apple ve App Store Connect

- Apple Developer Program aktif olmali.
- App Store Connect'te uygulama olusturulmus olmali.
- Bundle Identifier `app.json` ile birebir ayni olmali (`com.omnifolio.app`).
- App'in Apple ID'si (sayi) not edilmeli (`ascAppId`).
- Team ID not edilmeli.

## 2) Apple kimlikleri (cok karisan yer)

| Degisken / soru | Dogru ornek | Yanlis |
|-----------------|-------------|--------|
| **Apple ID** (EAS/Apple girisi) | `sen@icloud.com` | `6760969435` (bu ASC App ID, Apple ID degil) |
| **ascAppId** (App Store Connect) | Sadece rakam: `1234567890` | E-posta veya bos |
| **Team ID** | Tam **10** karakter, harf/rakam: `AB12CD34EF` | Kisa/uzun veya kucuk harf (bazen kabul edilir; buyuk deneyin) |

- App Store Connect → **Uygulama** → **App Information** → **Apple ID** (sayi) = `ascAppId`.
- [developer.apple.com/account](https://developer.apple.com/account) → Membership → **Team ID**.

## 2b) Submit: interaktif (onerilen)

`eas.json` icinde bu alanlar bos birakildi; `eas submit` calistirinca CLI **sorarak** ister. Boylece `$EXPO_APPLE_ID` genislememesi yuzunden gelen "Invalid ..." hatalari olmaz.

Istersen ayni oturumda PowerShell ile de verebilirsin (submit oncesi):

```powershell
$env:EXPO_APPLE_ID = "you@example.com"
$env:EXPO_ASC_APP_ID = "1234567890"
$env:EXPO_APPLE_TEAM_ID = "AB12CD34EF"
```

Kontrol: `echo $env:EXPO_APPLE_ID` gercekten e-posta mi gosteriyor?

## 3) Expo/EAS Giris

```powershell
npx eas-cli login
npx eas-cli whoami
```

(`eas-cli` projede dependency olarak tutulmaz; `npx` ile çağırın — `expo doctor` uyarısını böylece görmezsiniz.)

## 4) TestFlight Build

```powershell
npm run ios:testflight:build
```

Alternatif:

```powershell
npx eas build --platform ios --profile testflight
```

## 5) TestFlight'a Submit

**Once basarili bir iOS build olmali.** Build basarisizsa submit edilecek .ipa yoktur.

```powershell
npm run ios:testflight:submit
```

Alternatif:

```powershell
npx eas-cli submit --platform ios --profile testflight
```

## 6) Build "Prebuild" hatasi (Unknown error)

EAS ciktisindaki **build logs** linkini ac; **Prebuild** asamasindaki ilk kirmizi satiri oku.

### `EACCES: permission denied, mkdir '.expo/web'`

Expo, iOS ikon önbelleğini proje kökünde `.expo/web/...` altına yazar; bazı EAS ortamlarında bu yol **yazılamıyor**. Bu repoda `@expo/image-utils` için **patch-package** yaması var (`patches/@expo+image-utils+0.8.12.patch`): önbellek `os.tmpdir()` altına alınır. `npm install` sonrası `postinstall` yamayı uygular; EAS build de `npm ci` ile aynı akışı kullanır.

### Windows uyarısı

**Windows’ta `npx expo prebuild --platform ios` iOS projesi üretmez** (Expo bilerek atlar). Çıkan
`At least one platform must be enabled when syncing` hatası bu yüzdendir; **build’inizle ilgili gerçek bir hata göstermez.**

Yerelde iOS prebuild denemek icin:

- **macOS** veya **Linux** (WSL2 dahil) kullanın, veya
- Sadece **EAS Build log**’una güvenin (`eas build` sunucuda prebuild yapar).

```bash
# macOS / Linux / WSL
npx expo prebuild --platform ios --clean
```

## 7) Kontrol

- Build durumu: `npx eas-cli build:list --platform ios --limit 5`
- Submit durumu: `npx eas-cli submit:list --platform ios --limit 5`
- App Store Connect -> TestFlight sekmesinde build gorunmeli.
