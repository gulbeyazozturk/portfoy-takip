-- SİLME: hasimozturk@gmail.com — "5 Haziran" HARİÇ tüm portföyler
-- holdings + allocation_snapshots CASCADE ile silinir. Master assets dokunulmaz.

WITH cfg AS (
  SELECT 'hasimozturk@gmail.com'::text AS email, '5 haziran'::text AS keep_name_norm
),
u AS (
  SELECT au.id AS user_id
  FROM auth.users au
  CROSS JOIN cfg
  WHERE lower(au.email) = lower(cfg.email)
)
DELETE FROM public.portfolios p
USING u, cfg
WHERE p.user_id = u.user_id
  AND lower(trim(p.name)) <> cfg.keep_name_norm;
