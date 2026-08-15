-- Kripto: 5 dakikada bir GitHub crypto-sync.yml (Edge dispatch-crypto-sync).
-- Vault: mevcut portfolio_project_url + portfolio_cron_secret (header x-crypto-cron).

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'crypto_github_dispatch_every_5m';

SELECT cron.schedule(
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

SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'crypto_github_dispatch_every_5m',
  'portfolio_github_dispatch_every_15m'
)
ORDER BY jobname;
