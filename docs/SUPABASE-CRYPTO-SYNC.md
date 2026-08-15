# Crypto sync — Supabase tetikler, GitHub çalıştırır

**Üretim modeli:** Supabase’de **~5 dakikada bir** `pg_cron` → Edge **`dispatch-crypto-sync`** → GitHub API **`workflow_dispatch`** → `.github/workflows/crypto-sync.yml`.

GitHub workflow’unda **`on.schedule` yok**. Kripto, genel **Portfolio sync** (15 dk) işinden ayrıdır; `portfolio-sync.yml` kripto çekmez.

Script: `scripts/sync-crypto-prices.js` (CoinGecko top marketler + XAUT/PAXG emtia token). `price_history` yazılmaz.

## Edge fonksiyonu (`dispatch-crypto-sync`)

Yalnızca GitHub’a dispatch atar; CoinGecko çağrıları **GitHub runner**’da çalışır.

### Secret’lar

Portfolio / ABD dispatch ile **aynı** PAT ve repo yeter:

```bash
npx supabase secrets set --project-ref <PROJECT_REF> "GITHUB_DISPATCH_PAT=ghp_...."
npx supabase secrets set --project-ref <PROJECT_REF> "GITHUB_DISPATCH_REPO=KULLANICI/REPO"
```

Cron header için `PORTFOLIO_CRON_SECRET` kullanılır (ayrı `CRYPTO_CRON_SECRET` yoksa). İstersen ayrı tut:

```bash
npx supabase secrets set --project-ref <PROJECT_REF> "CRYPTO_CRON_SECRET=<uzun-rastgele-metin>"
```

Deploy:

```bash
npx supabase functions deploy dispatch-crypto-sync --project-ref <PROJECT_REF>
```

## Manuel test (PowerShell)

`x-crypto-cron` değeri, Edge’de `CRYPTO_CRON_SECRET` yoksa `PORTFOLIO_CRON_SECRET` ile aynı olmalı.

```powershell
curl.exe -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/dispatch-crypto-sync" -H "x-crypto-cron: <PORTFOLIO_CRON_SECRET>" -H "Content-Type: application/json" -d "{}"
```

## Zamanlayıcı — 5 dakikada bir (UTC)

`pg_cron` + `pg_net` + Vault. Cron: `*/5 * * * *`.

Mevcut `portfolio_project_url` ve `portfolio_cron_secret` vault kayıtları kullanılabilir (header adı `x-crypto-cron`).

```sql
select cron.schedule(
  'crypto_github_dispatch_every_5m',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'portfolio_project_url')
           || '/functions/v1/dispatch-crypto-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-crypto-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'portfolio_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

İptal: `select cron.unschedule('crypto_github_dispatch_every_5m');`

Ayrı `CRYPTO_CRON_SECRET` kullandıysan vault’ta `crypto_cron_secret` oluşturup header’ı ona bağla.

## Sorun giderme

- **`CRYPTO_CRON_SECRET_or_PORTFOLIO_CRON_SECRET_edge_secret_missing`** → secret + deploy.
- **`x_crypto_cron_mismatch`** → header **`x-crypto-cron`** beklenen secret ile birebir aynı olmalı.
- GitHub **404** / workflow bulunamadı → `crypto-sync.yml` `main`’e push edilmiş olmalı.
- CoinGecko **429** → keyless IP limiti; tur atlanır, bir sonraki 5 dk denemesi yapılır.

## İlişkili

- Genel portföy senkronu (BIST / döviz / emtia / TEFAS / ABD holdings / push): `docs/SUPABASE-PORTFOLIO-SYNC.md`
- ABD tam senkron: `docs/SUPABASE-ABD-SYNC.md`
