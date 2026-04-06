# Apple App Store’a Yükleme (Portföy Takip)

Bu proje **Expo** ile yazıldı. App Store’a yüklemek için **EAS (Expo Application Services)** kullanıyorsun.

---

## Önce gerekli olanlar

1. **Apple Developer hesabı**  
   - [developer.apple.com](https://developer.apple.com) → üyelik: **Apple Developer Program** (yıllık ücret var).

2. **Expo hesabı**  
   - [expo.dev](https://expo.dev) → ücretsiz hesap aç, sonra terminalde giriş yapacaksın.

3. **Bilgisayarında**  
   - Node.js ve proje kurulu (zaten var).  
   - İlk kez EAS kullanıyorsan: `npm install -g eas-cli`

---

## Adım adım

### 1. Expo’ya giriş yap

Terminalde (proje klasöründe):

```bash
npx eas login
```

Expo hesabınla giriş yap.

---

### 2. Projeyi EAS’a bağla

```bash
npx eas build:configure
```

İlk seferde projeyi Expo’ya bağlamak isteyip istemediğini sorar; **Yes** de.

---

### 3. iOS için production build al

```bash
npx eas build --platform ios --profile production
```

- Expo bulutta iOS uygulamasını derler (birkaç dakika sürer).  
- Bittiğinde bir **link** verir; tarayıcıdan build’i indirebilirsin (gerekmez, submit için EAS kullanacağız).

---

### 4. Gizlilik politikası sayfasını yayına al (GitHub Pages)

1. Projeyi GitHub’a push et.  
2. Repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: **main**, folder: **/docs** → Save.  
3. Birkaç dakika sonra gizlilik sayfası şu adresten açılır:  
   **https://gulbeyazozturk.github.io/portfoy-takip/privacy-policy.html**  
   (Repo adı farklıysa `app.json` → `extra.githubRepoSlug` ile uyumlu olmalı; bkz. [HESAP-DEVRI.md](./HESAP-DEVRI.md).)  
   (Proje içinde bu URL Ayarlar’daki “Gizlilik politikası” linkine tanımlı.)

### 5. App Store Connect’te uygulamayı oluştur

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**.
2. **Platform:** iOS.  
3. **Name:** Portföy Takip (veya istediğin isim).  
4. **Primary Language:** Turkish.  
5. **Bundle ID:** Projede `app.json` içinde yazdığımız değer: **com.omnifolio.app**.  
   - Eğer bu Bundle ID’yi hiç kullanmadıysan, Apple Developer sayfasında bir “App ID” oluşturup bu bundle ID’yi orada da tanımlaman gerekir.
6. **SKU:** Örn. `portfoy-takip-1`.  
7. **Privacy Policy URL:** Yukarıdaki GitHub Pages adresini yapıştır:  
   `https://gulbeyazozturk.github.io/portfoy-takip/privacy-policy.html`  
8. Kaydedip çık.

App’i oluşturduktan sonra **App Information** veya **App** sayfasından **Apple ID** (sayı, örn. 1234567890) al. Bunu aşağıda kullanacağız.

---

### 6. Build’i App Store’a gönder (submit)

Build bittikten sonra:

```bash
npx eas submit --platform ios --latest --profile production
```

- **Apple ID (e‑posta):** Apple Developer hesabının e‑postası.  
- **Şifre:** Hesap şifresi. İki faktörlü doğrulama açıksa, **App-specific password** oluşturman istenir: [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords.  
- **Asc App ID:** App Store Connect’te oluşturduğun uygulamanın **Apple ID** (sayı).  
- **Apple Team ID:** [developer.apple.com/account](https://developer.apple.com/account) → Membership → **Team ID**.

Bu bilgileri bir kez verirsen EAS bir daha sorabilir veya `eas.json` içindeki `submit.production.ios` alanlarına yazılabilir (şifre hariç, o her seferinde sorulur).

Submit başarılı olursa build **App Store Connect**’e yüklenir; birkaç dakika içinde **TestFlight** ve **App Store** kısmında görünür.

---

### 7. App Store’da yayına almak

1. App Store Connect → kendi uygulaman → **App Store** sekmesi.  
2. Yeni build’i seç (1.0.0 – …).  
3. **Pricing, Privacy, Description, Screenshots** vb. doldur.  
4. **Submit for Review** de.  
5. İnceleme 1–2 gün sürebilir; onaylanınca yayında olur.

---

## Özet komutlar

| Ne yapıyorsun?        | Komut |
|-----------------------|--------|
| Giriş                 | `npx eas login` |
| İlk kez yapılandırma  | `npx eas build:configure` |
| iOS build al          | `npx eas build --platform ios --profile production` |
| App Store’a gönder    | `npx eas submit --platform ios --latest --profile production` |

---

## Bundle ID’yi değiştirmek

Farklı bir bundle ID (örn. kendi domain’in) kullanmak istersen:

1. `app.json` içinde `expo.ios.bundleIdentifier` değerini değiştir (örn. `com.adiniz.omnifolio`).  
2. Apple Developer’da bu bundle ID ile bir **App ID** oluştur.  
3. EAS build’i bu bundle ID ile alıp, App Store Connect’te de aynı bundle ID ile uygulama oluştur.

---

## Sık sorulanlar

- **Mac gerekli mi?** Build ve submit için hayır; EAS bulutta yapıyor. Sadece Apple Developer ve App Store Connect işlemleri tarayıcıdan yapılıyor.  
- **Ücret?** Apple Developer Program ücreti (yıllık) + Expo’nun ücretsiz kotası (aylık build limiti) çoğu kişi için yeterli.  
- **İlk seferde hata alırsan:** `npx eas build --platform ios --profile production` çıktısındaki hata mesajını kontrol et; çoğu kez Bundle ID veya sertifika/ provisioning ile ilgilidir, Expo dokümanında da anlatılıyor.

Detaylı resmi rehber: [Expo – Submit to App Store](https://docs.expo.dev/submit/ios/).
