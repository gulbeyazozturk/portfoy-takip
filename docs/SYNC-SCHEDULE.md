# Portföy senkronu — 15 dakikada bir tetikleme

GitHub Actions **`schedule`** güvenilir değil; yük nedeniyle tetikleme saatlerce gecikebiliyor. Bu repoda **Portfolio sync** ve **ABD Sync** için GitHub cron **kapalı**; periyot **Supabase** üzerinden yönetilir.

## Önerilen: Supabase `pg_cron` + Edge

- **Portfolio sync:** Edge `dispatch-portfolio-sync` → `portfolio-sync.yml` — `docs/SUPABASE-PORTFOLIO-SYNC.md`
- **ABD Sync:** Edge `sync-abd-prices` (`ABD_PRICE_SOURCE=github_dispatch`) → `us-sync.yml` — `docs/SUPABASE-ABD-SYNC.md`

Her ikisi de aynı GitHub PAT/repo secret’larını (`GITHUB_DISPATCH_PAT`, `GITHUB_DISPATCH_REPO`) kullanabilir; cron doğrulama header’ları ayrıdır (`x-portfolio-cron` / `x-abd-cron`).

## Alternatif: Harici cron (ör. cron-job.org)

Kendi Supabase cron’unuzu kullanmak istemezseniz, üçüncü parti bir cron servisiyle doğrudan GitHub API’ye `POST` atarak `workflow_dispatch` tetikleyebilirsiniz.

### 1. GitHub Personal Access Token (PAT)

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**.
3. Scope: **repo** ve **workflow** (Actions tetiklemek için).

### 2. cron-job.org ayarı

1. **Create cronjob**.
2. **URL:**

   ```
   https://api.github.com/repos/KULLANICI_ADI/REPO_ADI/actions/workflows/portfolio-sync.yml/dispatches
   ```

3. **Request method:** `POST`.
4. **Headers:**
   - `Authorization`: `token <PAT>`
   - `Accept`: `application/vnd.github.v3+json`
5. **Body:** `{"ref":"main"}` (branch farklıysa uyarlayın.)
6. **Schedule:** Her 15 dakika.

### 3. Kontrol

GitHub → **Actions** → “Portfolio sync” çalışmalarının beklenen aralıkla başladığını doğrulayın. Başarılı yanıt genelde **204**.
