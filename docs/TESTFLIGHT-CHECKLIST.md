# TestFlight Hazirlik Checklist

Bu dosya, projeyi TestFlight'a gondermek icin minimum adimlari siralar.

## 1) Apple ve App Store Connect

- Apple Developer Program aktif olmali.
- App Store Connect'te uygulama olusturulmus olmali.
- Bundle Identifier `app.json` ile birebir ayni olmali (`com.omnifolio.app`).
- App'in Apple ID'si (sayi) not edilmeli (`ascAppId`).
- Team ID not edilmeli.

## 2) Ortam Degiskenleri

Asagidaki degiskenleri terminalde set et:

- `EXPO_APPLE_ID` (Apple gelistirici e-postasi)
- `EXPO_ASC_APP_ID` (App Store Connect Apple ID - sayi)
- `EXPO_APPLE_TEAM_ID` (Apple Team ID)

PowerShell ornek:

```powershell
$env:EXPO_APPLE_ID="you@example.com"
$env:EXPO_ASC_APP_ID="1234567890"
$env:EXPO_APPLE_TEAM_ID="ABCDE12345"
```

## 3) Expo/EAS Giris

```powershell
npx eas login
npx eas whoami
```

## 4) TestFlight Build

```powershell
npm run ios:testflight:build
```

Alternatif:

```powershell
npx eas build --platform ios --profile testflight
```

## 5) TestFlight'a Submit

```powershell
npm run ios:testflight:submit
```

Alternatif:

```powershell
npx eas submit --platform ios --profile testflight
```

## 6) Kontrol

- Build durumu: `npx eas build:list --platform ios --limit 5`
- Submit durumu: `npx eas submit:list --platform ios --limit 5`
- App Store Connect -> TestFlight sekmesinde build gorunmeli.
