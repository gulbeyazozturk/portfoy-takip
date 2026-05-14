# Portfolio sync — Supabase tetikler, GitHub çalıştırır

**Üretim modeli:** Supabase’de **~15 dakikada bir** `pg_cron` → Edge **`dispatch-portfolio-sync`** → GitHub API **`workflow_dispatch`** → `.github/workflows/portfolio-sync.yml`.

GitHub workflow’unda **`on.schedule` yok**; tetikleme buradan veya Actions’tan manuel çalıştırmadan gelir.

## Edge fonksiyonu (`dispatch-portfolio-sync`)

Yalnızca GitHub’a dispatch atar; script’ler **GitHub runner**’da çalışır.

### Secret’lar

```bash
npx supabase secrets set --project-ref <PROJECT_REF> "PORTFOLIO_CRON_SECRET=<uzun-rastgele-metin>"
npx supabase secrets set --project-ref <PROJECT_REF> "GITHUB_DISPATCH_PAT=ghp_...."
npx supabase secrets set --project-ref <PROJECT_REF> "GITHUB_DISPATCH_REPO=KULLANICI/REPO"
```

**PAT:** ABD dispatch ile **aynı** token kullanılabilir. İzinler: repo + **Workflows: Read and write**.

İsteğe bağlı (varsayılan `main`):

```bash
npx supabase secrets set --project-ref <PROJECT_REF> "GITHUB_DISPATCH_REF=main"
```

Deploy:

```bash
npx supabase functions deploy dispatch-portfolio-sync --project-ref <PROJECT_REF>
```

## Manuel test (PowerShell)

```powershell
curl.exe -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/dispatch-portfolio-sync" -H "x-portfolio-cron: <PORTFOLIO_CRON_SECRET>" -H "Content-Type: application/json" -d "{}"
```

## Zamanlayıcı — 15 dakikada bir (UTC)

`pg_cron` + `pg_net` + Vault. Örnek cron: `*/15 * * * *`.

Vault’ta örneğin:

- `portfolio_project_url` → `https://<PROJECT_REF>.supabase.co` (ABD ile aynı URL ise tek secret da kullanılabilir)
- `portfolio_cron_secret` → `PORTFOLIO_CRON_SECRET` ile **aynı** metin

Örnek job:

```sql
select cron.schedule(
  'portfolio_github_dispatch_every_15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'portfolio_project_url')
           || '/functions/v1/dispatch-portfolio-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-portfolio-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'portfolio_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

İptal: `select cron.unschedule('portfolio_github_dispatch_every_15m');`

## Sorun giderme: `unauthorized`

- **`PORTFOLIO_CRON_SECRET_edge_secret_missing`** → secret + deploy.
- **`x_portfolio_cron_mismatch`** → header **`x-portfolio-cron`** secret ile birebir aynı olmalı.

## İlişkili

- ABD tam senkron (ayrı workflow): `docs/SUPABASE-ABD-SYNC.md`
- Harici cron (cron-job.org) alternatifi: `docs/SYNC-SCHEDULE.md`

## GitHub workflow: günlük fiyat push’ları

`portfolio-sync.yml` sonunda `node scripts/send-daily-gain-push.js` çalışır.

- **Kademeli eşikler (varsayılan):** günlük artış için `4, 7, 10, 15` %; düşüş için `-4, -7, -10, -15` %. Aynı kullanıcı + varlık + İstanbul günü için **her eşik değeri** en fazla bir bildirim (`public.daily_gain_push_log` satırındaki `threshold`).
- **Ortam değişkenleri:** `DAILY_GAIN_PUSH_TIERS` ve `DAILY_FALL_PUSH_TIERS` virgülle ayrılmış liste (workflow’da set edilir; boş bırakılırsa script varsayılanları kullanır). Bildirim saat penceresi: `DAILY_GAIN_PUSH_LOCAL_START_HOUR`, `DAILY_GAIN_PUSH_LOCAL_END_HOUR`. Gün sonu portföy özeti: `DAILY_SUMMARY_LOCAL_HOUR`.
- **ABD destek/direnç yaklaşım bildirimleri:** Kaldırıldı; `send-us-sr-alerts` script’i ve workflow adımı artık yok.
