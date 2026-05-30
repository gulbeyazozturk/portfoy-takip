# Günlük admin raporu — Supabase (20:00 TSİ → hasimozturk@gmail.com)

## En kolay kurulum (terminale uzun anahtar yapıştırmayın)

1. [resend.com](https://resend.com) → **hasimozturk@gmail.com** ile giriş → **API Keys** → Create → `re_...` kopyala.

2. Cursor’da proje kökündeki **`.env`** dosyasını aç (dosya gezgini / Ctrl+P → `.env`).

3. En alta ekle (kendi anahtarını yapıştır):

```env
RESEND_API_KEY=re_gercek_anahtariniz_buraya
```

4. Kaydet (`Ctrl+S`).

5. Terminalde **yalnızca** şunu yaz (kısa, yapıştırma kolay):

```powershell
npm run setup:daily-report
```

Bitti. Her gün ~20:00 TSİ **hasimozturk@gmail.com** adresine rapor gelir.

---

## Terminalde yapıştıramıyorsanız

| Yöntem | Ne yapın |
|--------|----------|
| **.env + npm** (önerilen) | Yukarıdaki 5 adım |
| **Sağ tık** | Windows Terminal / CMD’de bazen sağ tık = yapıştır |
| **Ctrl+Shift+V** | Bazı terminallerde |
| **Supabase Dashboard** | [Dashboard](https://supabase.com/dashboard/project/ndjkkxpqpalwsjhqeulk/settings/functions) → Edge Functions → **Secrets** → `RESEND_API_KEY` = `re_...` → Save. Sonra terminalde: `npm run setup:daily-report -- --resend-only` |

Cron ve Edge zaten kuruluysa yalnızca Resend secret yeterli:

```powershell
npm run setup:daily-report -- --resend-only
```

(Önce `.env` içinde `RESEND_API_KEY` olmalı.)

---

## Sorun giderme

| Belirti | Çözüm |
|--------|--------|
| `RESEND_API_KEY` bulunamadı | `.env` kaydedildi mi? Satır `RESEND_API_KEY=re_` ile başlamalı |
| Resend 403 | Ücretsiz hesap: alıcı = Resend’e kayıt olduğunuz e-posta |
| Mail gelmiyor | `select * from cron.job;` içinde `daily_admin_report_2000_tr` |
