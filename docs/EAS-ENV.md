# EAS build: Supabase ortam değişkenleri (TestFlight / mağaza)

`EXPO_PUBLIC_*` değişkenleri **derleme sırasında** uygulamaya gömülür.  
Yerel `.env` dosyanız **Git’e girmez**; **EAS sunucusunda** tanımlanmazsa TestFlight’ta URL/anahtar **boş** kalır ve uygulama açılmaz veya oturum açılamaz.

Expo hesabı / proje değiştiriyorsanız ortam değişkenlerini yeni projede yeniden oluşturmanız gerekir: [HESAP-DEVRI.md](./HESAP-DEVRI.md).

## Tanımlanması gerekenler

| Değişken | Açıklama |
|----------|----------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase proje URL’si (`https://xxxxx.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon (public)** anahtarı |

## Expo web arayüzü

1. [expo.dev](https://expo.dev) → projeniz (**omnifolio**) → **Environment variables**
2. **Environment:** `production` (veya kullandığınız build profili ile eşleşen ortam)
3. İki değişkeni **Plain text** veya uygun görünürlükte ekleyin
4. Yeni bir **`eas build`** alın (eski .ipa’da eski gömülü değerler kalır)

## EAS CLI (örnek)

```bash
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --environment production --type string
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_ANON_KEY" --environment production --type string --visibility sensitive
```

Komutlar sürüme göre küçük farklar gösterebilir; güncel seçenekler için: `npx eas-cli env:create --help`

## Doğrulama

Build loglarında “Injecting environment variables” benzeri satırlar görebilirsiniz.  
Yerelde: `npx expo prebuild` öncesi `echo %EXPO_PUBLIC_SUPABASE_URL%` yalnızca shell’inizi gösterir; **kanıt** her zaman yeni bir EAS build + TestFlight açılışıdır.

## OAuth redirect (Google / Apple tarayıcı akışı)

Supabase **Authentication → URL Configuration → Redirect URLs** listesine, uygulamanın kullandığı adres **aynı metinle** eklenmeli. Kodda bu adres `Linking.createURL('oauth-callback')` ile üretilir (`app.json` içindeki `scheme` ve çalışma moduna bağlıdır).

- **Expo Go / LAN:** genelde `exp://<IP>:<port>/--/oauth-callback`. Bu string’i Supabase Redirect URLs ile **birebir** eşleştirin; tünel kullanıyorsanız Metro’nun gösterdiği güncel `exp://…` adresini alın.
- **Dev / mağaza / TestFlight build:** `omnifolio://oauth-callback` — **özel IP yok**; Supabase ile uyum genelde sorunsuz.

### Neden TestFlight’ta Google çalışır, Expo Go (LAN) çalışmaz?

Supabase Auth tarafında, redirect URL içinde **özel ağ IP’si** (`192.168.x.x`, `10.x`, vb.) olduğunda isteğin **reddedildiği** raporlanıyor; `exp://**` whitelist olsa bile IP eşlemesi devreye girebiliyor. TestFlight’ta kullanılan `omnifolio://oauth-callback` bu yüzden sorunsuz, LAN’daki `exp://192.168…` ise başarısız kalabilir. Kaynak: [supabase/auth#2039](https://github.com/supabase/auth/issues/2039).

**Ne yapmalı?**

1. **OAuth’u gerçek build’de test et** (TestFlight / EAS development build) — günlük akış için en güvenilir yol.
2. **Tünel:** `npx expo start --tunnel` (veya `npm run start:tunnel`) — Metro’nun yazdığı **yeni** `exp://…` satırını hem **Supabase Redirect URLs**’e ekleyin hem (isteğe bağlı) `.env` içinde **`EXPO_PUBLIC_OAUTH_REDIRECT_URL`** olarak tanımlayıp Metro’yu yeniden başlatın; kod `__DEV__` iken bu değeri kullanır.
3. `exp://**` wildcard denemek mümkün; **#2039** nedeniyle LAN IP’li URL yine de sorun çıkarabilir.

Eksik veya yanlış redirect, Google hesabı seçildikten sonra uygulamaya dönüşte oturum oluşmamasına yol açar.

### PKCE / WebCrypto (Expo Go)

Metro’da **`WebCrypto API is not supported... plain instead of sha256`** uyarısı görürseniz, `@supabase/auth-js` PKCE’yi zayıf moda alır ve OAuth kırılabilir. `lib/native-webcrypto-polyfill.ts` kök `_layout` üzerinden yüklenir; uyarı kaybolmalıdır.
