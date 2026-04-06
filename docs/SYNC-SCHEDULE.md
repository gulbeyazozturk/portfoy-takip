# Portföy senkronu – 15 dakikada bir çalıştırma

GitHub Actions içindeki `schedule` (cron) **garanti etmez**; yük nedeniyle tetikleme 2–3 saate kadar gecikebiliyor. Gerçekten **her 15 dakikada bir** çalışmasını istiyorsanız aşağıdaki yöntemi kullanın.

## Yöntem: Dış cron ile workflow tetikleme

Ücretsiz bir “cron” servisi (ör. [cron-job.org](https://cron-job.org)) kullanarak her 15 dakikada bir GitHub API’ye istek atıp `Portfolio sync` workflow’unu tetikleyebilirsiniz.

### 1. GitHub Personal Access Token (PAT)

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**.
3. İsim verin (örn. `portfoy-sync-cron`).
4. Scope: **repo** (tümü) ve **workflow** (Actions’ı tetiklemek için) işaretleyin.
5. Token’ı oluşturup **bir yere kopyalayın** (bir daha gösterilmez).

### 2. cron-job.org ayarı

1. [cron-job.org](https://cron-job.org) ücretsiz hesap açın.
2. **Create cronjob**.
3. **URL** kısmına şunu yazın (kendi kullanıcı adı ve repo adınızı yazın):

   ```
   https://api.github.com/repos/KULLANICI_ADI/REPO_ADI/actions/workflows/portfolio-sync.yml/dispatches
   ```

   Örnek (repo `gulbeyazozturk/portfoy-takip`):

   ```
   https://api.github.com/repos/gulbeyazozturk/portfoy-takip/actions/workflows/portfolio-sync.yml/dispatches
   ```

4. **Request method:** `POST`.
5. **Request headers** ekleyin:
   - `Authorization`: `token BURAYA_PAT_YAPIŞTIRIN`
   - `Accept`: `application/vnd.github.v3+json`
6. **Request body:** `{"ref":"main"}`  
   (Varsayılan branch farklıysa, örn. `master` ise `"ref":"master"` yazın.)
7. **Schedule:** Her 15 dakika → **Every 15 minutes** veya `*/15 * * * *` (cron ifadesi destekleniyorsa).
8. Kaydedin.

Bundan sonra bu cron job her 15 dakikada bir GitHub’a istek atacak ve **Portfolio sync** workflow’u tetiklenecektir.

### 3. Kontrol

- GitHub repo → **Actions** sekmesinde “Portfolio sync” çalışmalarının yaklaşık 15 dakika arayla başladığını kontrol edin.
- cron-job.org panelinde son tetiklemeleri ve HTTP yanıt kodlarını görebilirsiniz (204 veya 200 başarılı sayılır).

---

**Not:** Workflow dosyasındaki `schedule` (5,20,35,50. dakikalar) yine de duruyor; GitHub tetiklemeyi geciktirse bile bazen çalışır. Dış cron, **garanti** için ek bir yöntemdir.
