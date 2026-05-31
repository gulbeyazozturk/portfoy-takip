# Google Play Store — yükleme ve push hazırlığı

Play Console’a **AAB** yüklemek ve Android push bildirimlerinin çalışması için adım adım rehber.

Ön koşul: [EAS-ENV.md](./EAS-ENV.md) (Supabase ortam değişkenleri), [ANDROID-INTERNAL-TEST.md](./ANDROID-INTERNAL-TEST.md) (preview APK deneyimi).

---

## 1) Supabase üretim kontrolü

Proje kökünde:

```bash
npm run verify:supabase
```

Beklenen: `user_push_tokens`, `daily_gain_push_log`, `push_event_log` **OK**; edge fonksiyonları (`send-push` dahil) **deployed**.

`pg_cron` satırı `DATABASE_URL yok` diyorsa yerel `.env`’e opsiyonel `DATABASE_URL` ekleyip tekrar çalıştırabilirsiniz; yoksa Supabase Dashboard → Database → Extensions → `pg_cron` job listesinden `portfolio_github_dispatch_*` job’larının **active** olduğunu doğrulayın (`docs/SUPABASE-PORTFOLIO-SYNC.md`).

---

## 2) Expo — ortam değişkenleri (production)

[expo.dev](https://expo.dev) → **gulbeyazozturk** → **omnifolio** → **Environment variables** → ortam **production**:

| Değişken | Değer |
|----------|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase proje URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon (public) key |

Aynı değerleri **preview** ortamında da tutun (internal test build’leri için).

CLI ile kontrol:

```bash
npx eas-cli env:list --environment production
```

---

## 3) FCM V1 — Android push teslimi (kritik)

`google-services.json` istemci içindir; **Expo’nun bildirimi cihaza iletmesi** için FCM **service account** Expo projesine yüklenmelidir.

### Firebase Console

1. [console.firebase.google.com](https://console.firebase.google.com) → proje **omnifolio-ce45e**
2. ⚙️ **Project settings** → **Service accounts**
3. **Generate new private key** → JSON indir (repoya **eklemeyin**; `.gitignore`’da)

### Expo Dashboard

1. [expo.dev](https://expo.dev) → **omnifolio** → **Credentials** → **Android**
2. **Google Service Account Key for Push Notifications (FCM V1)** → indirdiğiniz JSON’u yükleyin

Alternatif CLI:

```bash
npx eas-cli credentials --platform android
```

→ Push Notifications → FCM V1 → JSON yükle.

**Doğrulama (telefon olmadan):** Bir Android kullanıcı uygulamaya giriş yaptıktan sonra Supabase’de:

```sql
select expo_push_token, platform, enabled, last_seen_at
from user_push_tokens
where platform = 'android'
order by last_seen_at desc
limit 5;
```

Token `ExponentPushToken[...]` ise istemci tarafı OK. [expo.dev/notifications](https://expo.dev/notifications) ile test push gönderin — geliyorsa FCM de OK.

---

## 4) GitHub Actions — portfolio sync secrets

Repo → **Settings** → **Secrets and variables** → **Actions**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

`portfolio-sync.yml` bu secret’larla fiyat senkronu ve `send-daily-gain-push.js` çalıştırır.

---

## 5) Production AAB build

Değişiklikler commit’lenmiş olmalı (`eas.json` → `requireCommit: true`).

```bash
npm run android:production:build
```

Build bitince Expo dashboard’dan **.aab** indirin.

---

## 6) Google Play Console

1. [play.google.com/console](https://play.google.com/console) → uygulama oluştur veya mevcut
2. **Release** → **Production** (veya **Internal testing**) → **Create new release** → AAB yükle
3. **App content**:
   - **Privacy policy:** `https://gulbeyazozturk.github.io/portfoy-takip/privacy-policy.html` (GitHub Pages `/docs` yayında olmalı)
   - **Data safety:** Hesap, finansal portföy verisi, push token / cihaz tanımlayıcıları bildirin; reklam yok
4. **Store listing:** ekran görüntüleri, kısa/uzun açıklama
5. **Google Sign-In kullanıyorsanız:** Play App Signing **SHA-1** fingerprint’ini Firebase / Google Cloud OAuth client’a ekleyin (`eas credentials` veya Play Console → App integrity)

---

## 7) Supabase Auth redirect (OAuth)

**Authentication → URL Configuration → Redirect URLs** listesinde:

- `omnifolio://oauth-callback`

Mağaza build’inde özel IP’li `exp://` adresi kullanılmaz (`docs/EAS-ENV.md`).

---

## Hızlı kontrol listesi

- [ ] `npm run verify:supabase` — tablolar + edge OK
- [ ] Expo production env: `EXPO_PUBLIC_SUPABASE_*`
- [ ] Expo FCM V1 service account yüklü
- [ ] GitHub Actions secret’ları tanımlı
- [ ] `npm run android:production:build` → AAB
- [ ] Play Console: gizlilik URL, Data safety, listing
- [ ] (İsteğe bağlı) İlk Android kullanıcı → `user_push_tokens` satırı + Expo push tool testi
