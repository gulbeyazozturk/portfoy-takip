# GitHub ve Expo (EAS) hesap devri

Projeyi başka bir GitHub kullanıcısına ve başka bir Expo hesabına taşıyacaksanız aşağıdaki sırayı izleyin.

## 1) `app.json` — zorunlu düzenlemeler

| Alan | Ne yapılır |
|------|------------|
| `expo.owner` | Yeni kişinin **Expo kullanıcı adı** (ör. `johndoe`). `YOUR_EXPO_ACCOUNT` yerine yazın. |
| `expo.extra.githubUsername` | **GitHub kullanıcı adı** (şu an: `gulbeyazozturk`). Değişirse güncelleyin. |
| `expo.extra.githubRepoSlug` | Repo GitHub’da farklı isimdeyse güncelleyin; aynıysa `portfoy-takip` kalabilir. |

Gizlilik politikası linki uygulama içinde bu değerlerden üretilir:  
`https://<githubUsername>.github.io/<githubRepoSlug>/privacy-policy.html`

## 2) EAS projesini yeni Expo hesabına bağlama

Eski `extra.eas.projectId` kaldırıldı; yeni hesap kendi projesini oluşturmalı.

```bash
npx eas-cli login
cd /path/to/portfoy-takip
npx eas-cli init
```

- Mevcut bir Expo projesine bağlamayı veya yeni proje oluşturmayı sorar; **yeni sahibin hesabı** altında seçin.
- Komut bittiğinde `app.json` içinde `extra.eas.projectId` tekrar oluşur. `eas init` bazen yalnızca `eas` bloğunu ekler; **`githubUsername` / `githubRepoSlug` satırları silindiyse** `app.json`’a geri ekleyin.

## 3) EAS ortam değişkenleri (Supabase)

Eski Expo projesindeki **Environment variables** yeni projede yoktur. [expo.dev](https://expo.dev) → yeni proje → **Environment variables** → `production` için yeniden tanımlayın:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Ayrıntı: [EAS-ENV.md](./EAS-ENV.md)

## 4) GitHub

- Repoyu **transfer** edin veya yeni hesapta **yeni repo** oluşturup kodu push edin.
- **GitHub Pages** (gizlilik sayfası): Yeni repo → Settings → Pages → `main` + `/docs`.
- Mağaza / [APP-STORE-LISTING.md](./APP-STORE-LISTING.md) içindeki **Support URL** ve gizlilik URL’sini yeni `githubUsername` / repo ile güncelleyin.

## 5) Apple / App Store (kısa)

Bundle ID ve imzalama **Apple Developer ekibine** bağlıdır. Uygulama mağazada kalacaksa [App Store uygulama transferi](https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer) veya yeni hesapta yeni kayıt senaryosunu ayrıca planlayın. EAS submit için yeni ekibin Apple kimlik bilgileri kullanılır.

## 6) Supabase ve OAuth

- Supabase projesinde yeni geliştiriciyi **ekip üyesi** yapın veya projeyi devredin.
- **Authentication → URL Configuration → Redirect URLs** içinde uygulamanın kullandığı yönlendirmeler güncel şema ile uyumlu olmalı (`app.json` içindeki `scheme`).
