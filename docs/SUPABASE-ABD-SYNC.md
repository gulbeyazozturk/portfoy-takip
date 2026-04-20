# ABD (yurtdışı) fiyat senkronu — Supabase Edge Function

GitHub’daki **ABD Sync** workflow’una dokunmadan, aynı veri kaynağı mantığıyla (`assets` / Yahoo) **Supabase Edge** üzerinden periyodik güncelleme.

## Davranış

- Fonksiyon: **`sync-abd-prices`**
- Her çağrıda en fazla **1000** `yurtdisi` sembolü işlenir (`symbol` sırasına göre sabit sıra).
- `public.abd_sync_cursor` tablosundaki `symbol_offset` ile **bir sonraki 1000’lik dilime** geçilir; liste sonunda **başa sarar**.
- Yahoo: `query1.finance.yahoo.com/v7/finance/quote` — semboller **45’lik** gruplar halinde istenir (rate limit için kısa gecikme).

## 1) Veritabanı migration

SQL Editor’da çalıştır veya CLI migration ile uygula:

`database/migrations/013_abd_sync_cursor.sql`

## 2) Edge secret’lar

`SERVICE_ROLE_KEY` zaten TEFAS Edge’i için set edildiyse **aynı** kalabilir.

Ek secret:

```bash
npx supabase secrets set --project-ref <PROJECT_REF> "ABD_CRON_SECRET=<uzun-rastgele-metin>"
```

## 3) Deploy

```bash
npx supabase functions deploy sync-abd-prices --project-ref <PROJECT_REF>
```

## 4) Manuel test (PowerShell, tek satır)

```powershell
curl.exe -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/sync-abd-prices" -H "x-abd-cron: <ABD_CRON_SECRET>" -H "Content-Type: application/json" -d "{}"
```

## 5) Zamanlayıcı — 15 dakikada bir (UTC)

`pg_cron` + `pg_net` + Vault (TEFAS dokümanındaki gibi). Örnek cron:

```text
*/15 * * * *
```

Vault’ta örneğin:

- `abd_project_url` → `https://<PROJECT_REF>.supabase.co`
- `abd_cron_secret` → `ABD_CRON_SECRET` ile **aynı** metin

Örnek job (job adını değiştirebilirsin):

```sql
select cron.schedule(
  'abd_prices_edge_every_15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'abd_project_url')
           || '/functions/v1/sync-abd-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-abd-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'abd_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

İptal: `select cron.unschedule('abd_prices_edge_every_15m');`

## GitHub ABD Sync ile birlikte

- `.github/workflows/us-sync.yml` **değiştirilmedi**.
- İkisi aynı anda çalışırsa Yahoo’ya iki kat istek gider; genelde **birini** zamanlayıcı olarak bırakmak daha güvenli (ya GitHub ya Supabase cron).

## Kaynak

- Zamanlama modeli: [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
