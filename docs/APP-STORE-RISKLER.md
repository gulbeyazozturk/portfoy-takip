# App Store gönderiminde red riskleri – kontrol listesi

Proje taranmış; aşağıdaki noktalar **red riskini** azaltmak için dikkate alınmalı.

---

## Yapılan düzeltmeler (kodda)

- **Ayarlar ekranı:** "Buraya uygulama ayarları gelecek" metni kaldırıldı; sürüm numarası ve (isteğe bağlı) gizlilik politikası linki eklendi.
- **Dil tutarlılığı:** Ana ekrandaki "Asset Allocation" → "Varlık dağılımı" olarak Türkçeleştirildi.
- **Şablon içerik:** `explore.tsx` (tab’da gizli olsa da) Expo şablon metinleri kaldırıldı; basit "Hakkında" metni kondu.

---

## Gizlilik politikası (hazır)

- **Metin ve sayfa:** `docs/privacy-policy.html` – Türkçe gizlilik politikası projeye eklendi.
- **Uygulama içi link:** Ayarlar ekranında "Gizlilik politikası" linki, aşağıdaki URL’e bağlı (Ayarlar’da tıklanınca açılır).
- **Yayına almak:** Repo’yu GitHub’a push ettikten sonra:
  - GitHub → repo → **Settings** → **Pages**
  - **Source:** Deploy from a branch
  - **Branch:** main, klasör **/docs** → Save
  - Birkaç dakika sonra adres açılır: `https://YOUR_GITHUB_USERNAME.github.io/portfoy-takip/privacy-policy.html` (`app.json` → `extra.githubUsername` ile uyumlu olmalı)
- **App Store Connect:** Bu URL’i uygulama sayfasındaki **Privacy Policy URL** alanına yaz.

### 2. Uygulama açıklaması ve ekran görüntüleri

- Açıklama: Uygulamanın ne yaptığını (portföy takibi, varlık türleri, fiyat güncellemesi vb.) net yaz.
- Ekran görüntüleri: Farklı ekran boyutları için güncel ve gerçek ekranlar koy; "şablon" veya boş ekranlar red sebebi olabilir.

### 3. Test hesabı (eğer giriş varsa)

Şu an uygulama **giriş zorunluluğu** olmadan tek portföy kullanıyor. İleride giriş eklersen, incelemecinin test edebilmesi için App Store Connect’te **demo hesap** (kullanıcı adı/şifre) vermen gerekir. Şu anki yapıda zorunlu değil.

### 4. "Sign in with Apple"

Uygulama **sadece** e-posta/şifre veya sadece Supabase anon key ile çalışıyorsa, Apple "Sign in with Apple" zorunluluğu **genelde** uygulanmaz. İleride **Google / Facebook** vb. ile giriş eklersen, Apple aynı uygulama içinde **"Apple ile Giriş"** seçeneği de isteyebilir. Şu anki sürümde ek bir işlem yok.

---

## Projede kontrol edilen ve risk görülmeyen noktalar

- **Kamera / konum / mikrofon:** Kullanılmıyor; ek izin açıklaması gerekmiyor.
- **Ödeme / In-App Purchase:** Yok; ödeme kuralı riski yok.
- **WebView / harici sayfa açma:** Sadece (varsa) gizlilik politikası linki; reklam veya keyfi web içeriği yok.
- **Çökme riski:** Portföy/holding ve fiyat alanları null kontrolü ile kullanılıyor; bariz çökme nedeni görülmedi.
- **Placeholder / test metni:** Ayarlar ve explore düzeltildi; diğer ekranlarda kullanıcıya dönük placeholder (“Varlık ara…” vb.) normal arayüz metni, red sebebi değil.

---

## Özet

| Konu | Durum |
|------|--------|
| Gizlilik politikası metni + sayfa | Hazır: `docs/privacy-policy.html`; GitHub Pages ile yayınla, App Store Connect’e URL’i yaz |
| Ayarlar placeholder | Kaldırıldı |
| Dil (Asset Allocation) | Türkçe yapıldı |
| Şablon içerik (explore) | Kaldırıldı |
| İzin / ödeme / giriş | Mevcut yapıda ek risk yok |

Gönderimden önce **mutlaka:** Repo’da GitHub Pages’i aç (main, /docs), gizlilik sayfası açılsın; sonra aynı URL’i App Store Connect → Privacy Policy URL’e yaz.
