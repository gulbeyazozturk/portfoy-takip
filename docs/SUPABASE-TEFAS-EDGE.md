# TEFAS senkronu — Supabase Edge Function + zamanlayıcı

GitHub Actions IP’leri TEFAS’ta **Request Rejected** ile engellenebiliyor. Bu akış, TEFAS’ı **Supabase Edge Function** üzerinden çalıştırır; zamanlama **Postgres `pg_cron` + `pg_net`** ile yapılır (Supabase’in resmi yöntemi).

## Önkoşullar

- [Supabase CLI](https://supabase.com/docs/guides/cli) kurulu (`supabase --version`).
- Projede `supabase link` yapılmış (veya `--project-ref` ile deploy).
- Dashboard’ta **Database → Extensions**: `pg_cron` ve `pg_net` açık (gerekirse `vault`).

## 1) Edge secret’ları

Terminal (proje kökünde):

```bash
supabase secrets set --project-ref <PROJECT_REF> SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
supabase secrets set --project-ref <PROJECT_REF> TEFAS_CRON_SECRET="<uzun-rastgele-string>"
```

- `SUPABASE_SERVICE_ROLE_KEY`: Dashboard → **Settings → API → service_role** (asla istemciye koyma).
- `TEFAS_CRON_SECRET`: Senin ürettiğin gizli değer; aşağıdaki `pg_net` isteğinde header olarak kullanılacak.

`SUPABASE_URL` Edge ortamında zaten tanımlıdır; ayrıca set etmene gerek yok.

## 2) Fonksiyonu deploy et

```bash
supabase functions deploy sync-tefas --project-ref <PROJECT_REF>
```

`supabase/config.toml` içinde `[functions.sync-tefas] verify_jwt = false` tanımlıdır; çünkü `pg_net` çağrısında kullanıcı JWT’si yoktur. Yetkilendirme **`x-tefas-cron`** header’ı ile yapılır.

## 3) Manuel test

```bash
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/sync-tefas" \
  -H "x-tefas-cron: <TEFAS_CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d "{}"
```

Başarılı yanıt örneği: `{"ok":true,"funds":2400,"affected":2400}` (sayılar değişir).

## 4) Zamanlayıcı (TSİ 08:00–13:00, saatte bir)

`pg_cron` ifadesi **UTC**’dir. Türkiye (UTC+3) için **08:00–13:00** aralığı:

`0 5,6,7,8,9,10 * * *` → UTC 05–10 = TSİ 08–13.

### 4a) Vault’ta URL ve gizli anahtar

SQL Editor’da (değerleri kendi projenle değiştir):

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'tefas_project_url');
select vault.create_secret('YOUR_TEFAS_CRON_SECRET_VALUE', 'tefas_cron_secret');
```

### 4b) Cron job

```sql
select cron.schedule(
  'tefas_sync_morning_tr',
  '0 5,6,7,8,9,10 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tefas_project_url')
           || '/functions/v1/sync-tefas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-tefas-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'tefas_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

İptal etmek için: `select cron.unschedule('tefas_sync_morning_tr');` (isim aynı olmalı).

## 5) Kotalar ve beklentiler

- Ücretsiz planda Edge çağrısı ve DB kaynakları sınırlıdır; TEFAS isteği ağır olduğundan **günde birkaç kez** ile başlamak mantıklıdır.
- `pg_cron` tetikleri birkaç dakika kayabilir; “tam saniye” garantisi yoktur, fakat GitHub Actions’taki büyük gecikmelerden genelde daha stabildir.

## 6) Yerel Node script ile ilişki

- Aynı mantık: `scripts/sync-tefas-funds.js` (CI / lokal debug için durabilir).
- Üretimde TEFAS güncellemesi bu Edge Function üzerinden gidiyorsa GitHub workflow’una TEFAS adımı eklemene gerek yok.

## Kaynak

- [Scheduling Edge Functions (Supabase)](https://supabase.com/docs/guides/functions/schedule-functions)
