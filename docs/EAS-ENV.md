# EAS build: Supabase ortam değişkenleri (TestFlight / mağaza)

`EXPO_PUBLIC_*` değişkenleri **derleme sırasında** uygulamaya gömülür.  
Yerel `.env` dosyanız **Git’e girmez**; **EAS sunucusunda** tanımlanmazsa TestFlight’ta URL/anahtar **boş** kalır ve uygulama açılmaz veya oturum açılamaz.

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
