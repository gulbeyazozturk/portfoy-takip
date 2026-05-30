-- Günlük admin raporu: pg_cron (17:00 UTC = 20:00 TSİ) → Edge daily-admin-report
--
-- Vault + cron kurulumu: node scripts/setup-daily-report-supabase.mjs re_...
-- (daily_report_project_url, daily_report_cron_secret + RESEND_API_KEY)

select cron.unschedule('daily_admin_report_2000_tr')
where exists (
  select 1 from cron.job where jobname = 'daily_admin_report_2000_tr'
);

select cron.schedule(
  'daily_admin_report_2000_tr',
  '0 17 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_project_url')
           || '/functions/v1/daily-admin-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-daily-report-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
