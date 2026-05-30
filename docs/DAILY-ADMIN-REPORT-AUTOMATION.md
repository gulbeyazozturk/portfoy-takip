# Günlük admin raporu — otomasyon (20:00 TSİ + e-posta)

Rapor içeriği: kullanıcı sayısı, portföy/varlık özeti, (varsa) günlük oturum ve süre.

## Önerilen: GitHub Actions (PC kapalıyken de çalışır)

Workflow: `.github/workflows/daily-admin-report.yml`  
Zamanlama: **17:00 UTC** = **20:00 TSİ** (Türkiye UTC+3). GitHub bazen 0–15 dk gecikebilir.

### 1) SMTP hazırlığı (örnek: Gmail)

1. Google hesabında **2 adımlı doğrulama** açık olsun.
2. [Uygulama şifreleri](https://myaccount.google.com/apppasswords) → yeni şifre (Posta).
3. Değerler:
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
   - `SMTP_USER=siz@gmail.com`
   - `SMTP_PASS=` (16 karakterlik uygulama şifresi)
   - `SMTP_FROM=` (opsiyonel, genelde `SMTP_USER` ile aynı)

### 2) GitHub repo secrets

Settings → Secrets and variables → Actions → **New repository secret**

| Secret | Açıklama |
|--------|----------|
| `SUPABASE_URL` | Zaten portfolio sync için varsa aynısı |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role |
| `DAILY_REPORT_TO` | Raporun gideceği adres (virgülle çoklu) |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gönderen hesap |
| `SMTP_PASS` | Uygulama şifresi |
| `SMTP_FROM` | Opsiyonel |

### 3) Test

1. Actions → **Daily admin report** → **Run workflow**.
2. Gelen kutusu / spam klasörünü kontrol edin.

### Yerel dry-run (e-posta yok)

```powershell
# .env içinde Supabase anahtarları
node scripts/daily-admin-report.js

# SMTP tanımlıysa göndermeden önizleme
node scripts/send-daily-admin-report-email.js --dry-run
```

---

## Alternatif: Windows Görev Zamanlayıcı (PC 20:00’de açık olmalı)

`.env` dosyasında Supabase + SMTP değişkenleri olmalı.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-daily-admin-report-task.ps1
```

Kaldırmak:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-daily-admin-report-task.ps1 -Unregister
```

Log: `scripts/windows/daily-admin-report.log`

---

## .env örneği (yerel / Windows)

```env
DAILY_REPORT_TO=hasimozturk@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=hasimozturk@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx
SMTP_FROM=hasimozturk@gmail.com
```

`SUPABASE_SERVICE_ROLE_KEY` ve `EXPO_PUBLIC_SUPABASE_URL` zaten tanımlı olmalı.

---

## Kullanım verisi (giriş / süre)

`app_usage_sessions` tablosu (`database/migrations/019_app_usage_sessions.sql`) Supabase’e uygulanmadıysa rapordaki kullanım sütunları **örnek** kalır. Gerçek metrik için migration + uygulama oturum kaydı gerekir.
