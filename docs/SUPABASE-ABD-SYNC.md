# ABD (yurtdışı) fiyat senkronu — Supabase tetikler, GitHub çalıştırır

**Üretim modeli:** Supabase’de **~15 dakikada bir** `pg_cron` → Edge **`sync-abd-prices`** → GitHub API **`workflow_dispatch`** → `.github/workflows/us-sync.yml` (Yahoo ve script’ler **yalnızca GitHub runner**’da).

GitHub workflow’unda **`on.schedule` yok**; çift tetik ve Yahoo’ya iki kat yük oluşmaması için zamanlama burada toplanır.

## Edge fonksiyonu (`sync-abd-prices`)

- **`ABD_PRICE_SOURCE=github_dispatch`** (önerilen): Yahoo’yu Edge’de çağırmaz; `us-sync.yml` dosyasını dispatch eder.
- Eski alternatif: Yahoo’yu Edge’den batch (1000’lik dilim + `abd_sync_cursor`) — Edge IP’lerinde Yahoo sık **401** verir; pratikte `github_dispatch` kullan.

### Mod: `github_dispatch`

Ek secret’lar:

```bash
npx supabase secrets set --project-ref <PROJECT_REF> "ABD_PRICE_SOURCE=github_dispatch"
npx supabase secrets set --project-ref <PROJECT_REF> "GITHUB_DISPATCH_REPO=KULLANICI/REPO"
npx supabase secrets set --project-ref <PROJECT_REF> "GITHUB_DISPATCH_PAT=ghp_...."
```

**PAT:** GitHub → Settings → Developer settings → Fine-grained token veya classic PAT.  
İzinler: ilgili repo için **Contents: Read** (veya repo erişimi) + **Workflows: Read and write** (dispatch için).

Ortak secret’lar (cron doğrulama + servis erişimi ihtiyacına göre):

```bash
npx supabase secrets set --project-ref <PROJECT_REF> "ABD_CRON_SECRET=<uzun-rastgele-metin>"
npx supabase secrets set --project-ref <PROJECT_REF> "SERVICE_ROLE_KEY=<service_role>"
```

Deploy:

```bash
npx supabase functions deploy sync-abd-prices --project-ref <PROJECT_REF>
```

Bu modda **`abd_sync_cursor` kullanılmaz** (fiyat güncellemesi tamamen GitHub job’ına bırakılır).

## Yahoo `401` / “User is unable to access this feature” (Edge’den doğrudan Yahoo)

Yahoo Finance, **Supabase Edge** çıkış IP’lerinden bu tip istekleri reddedebilir. Edge’de Yahoo kullanacaksan migration `013` gerekir; günlük kullanımda **`github_dispatch`** yeterli.

## Veritabanı (yalnızca Edge’de Yahoo modu)

`database/migrations/013_abd_sync_cursor.sql` — Yahoo’yu Edge’den çalıştırırken `abd_sync_cursor` için.

## Manuel test (PowerShell)

```powershell
curl.exe -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/sync-abd-prices" -H "x-abd-cron: <ABD_CRON_SECRET>" -H "Content-Type: application/json" -d "{}"
```

## Zamanlayıcı — 15 dakikada bir (UTC)

`pg_cron` + `pg_net` + Vault (TEFAS dokümanındaki gibi). Örnek:

```text
*/15 * * * *
```

Vault’ta örneğin:

- `abd_project_url` → `https://<PROJECT_REF>.supabase.co`
- `abd_cron_secret` → `ABD_CRON_SECRET` ile **aynı** metin

Örnek job:

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

## Sorun giderme: `{"error":"unauthorized"}`

Deploy ettiğin sürümde `reason` alanı var:

- **`ABD_CRON_SECRET_edge_secret_missing`** → Edge’e secret set + fonksiyonu yeniden deploy.
- **`x_abd_cron_mismatch`** → `x-abd-cron` header’ı secret ile birebir aynı (trim/boşluk).

Header adı: **`x-abd-cron`**.

## GitHub tarafı

- `.github/workflows/us-sync.yml`: yalnızca **`workflow_dispatch`**; Actions sekmesinden veya Edge dispatch ile çalışır.
- Eski **GitHub `schedule`** kapatıldı; periyot Supabase cron ile yönetilir.

## İlişkili

- **Portfolio sync** (kripto/BIST/döviz vb.) GitHub tetiklemesi: `docs/SUPABASE-PORTFOLIO-SYNC.md`

## Kaynak

- [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
