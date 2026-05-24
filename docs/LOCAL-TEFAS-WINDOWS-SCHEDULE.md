# TEFAS — Windows’ta yerel zamanlama (07:30–12:30)

`scripts/sync-tefas-funds.js` bilgisayarındaki **Node** ile çalışır; proje kökünde **`.env`** (Supabase URL + `SUPABASE_SERVICE_ROLE_KEY` vb.) gerekir.

## Zamanlama

Her gün, bilgisayar saatine göre: **07:30, 08:30, 09:30, 10:30, 11:30, 12:30** (toplam 6 çalışma). Türkiye’de kullanıyorsan Windows saatini **TSİ** tut.

## Kurulum (bir kez)

PowerShell’i aç, proje klasörüne geç:

```powershell
cd "C:\Users\Haşim Öztürk\OneDrive\Desktop\CURSOR\portfoy-takip"
powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-tefas-morning-task.ps1
```

Varsayılan görev adı: `PortfoyTakip-TEFAS-0730-1230`.

## Test

```powershell
Start-ScheduledTask -TaskName 'PortfoyTakip-TEFAS-0730-1230'
```

Ardından Görev Zamanlayıcı’da (`taskschd.msc`) görevi açıp **Geçmiş** / son çalışma sonucuna bak.

## Elle bir kez çalıştırma

```powershell
cd "...\portfoy-takip"
.\scripts\windows\tefas-sync-once.cmd
```

## Kaldırma

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-tefas-morning-task.ps1 -Unregister
```

## Notlar

- **API:** TEFAS 2026’da eski `BindHistoryInfo` kapatıldı; script artık `POST .../api/funds/fonGnlBlgSiraliGetir` (JSON) kullanır. Fon tipleri: **YAT, EMK, BYF, GYF, GSYF** (proje GYF’ler `GYF` altında). Tipler arası bekleme: ortam `TEFAS_INTER_KIND_DELAY_MS` (varsayılan 11000 ms, dakikada ~6 istek sınırına uyum).
- Görev **oturum açıkken** tetiklenir (`Interactive`). Kapalı oturumda da çalışsın istersen Görev Zamanlayıcı’dan “Kullanıcı oturum açmış olsun ya da olmasın” ve şifre girmen gerekir.
- **Node**, görevi çalıştıran kullanıcının **PATH**’inde olmalı (ör. nvm kullanıyorsan PATH’i görev ortamında görmeyebilir; o zaman `register-tefas-morning-task.ps1` içinde tam `node.exe` yolu kullanmak gerekebilir).
- Supabase Edge’teki TEFAS akışı (`docs/SUPABASE-TEFAS-EDGE.md`) bundan bağımsızdır; bu doküman yalnızca **PC’de yerel** senkron içindir.

## “Hiç çalışmıyor” kontrol listesi

1. **Saat penceresi:** Görev yalnızca günde **6 kez** (07:30, 08:30, … 12:30) çalışır. Bu saatler dışında tetiklenmez.
2. **Elle test:** `.\scripts\windows\tefas-sync-once.cmd` — hata varsa ekranda görünür.
3. **Log:** Aynı klasörde `scripts\windows\tefas-sync.log` oluşur; Görev Zamanlayıcı başarısız olsa bile burada Node / script çıktısı olur.
4. **Node yolu:** Görev `cmd` ile çalışır; nvm ile kurulu Node bazen PATH’te olmaz. Çözüm: sistem ortam değişkeni **`NODE_EXE`** = `node.exe` tam yolu (ör. `C:\Program Files\nodejs\node.exe`) veya Görev eylemine `set NODE_EXE=...` ile aynı satırda ekleme.
5. **Görev Geçmişi:** `taskschd.msc` → ilgili görev → **Geçmiş** sekmesi (Windows sürümüne göre “History” / son çalışma kodu).
