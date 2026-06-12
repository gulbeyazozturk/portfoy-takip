-- Supabase SQL Editor → ÖNİZLEME (silmez)
-- hasimozturk@gmail.com — "5 Haziran" portföyü HARİÇ diğer tüm portföyler

WITH cfg AS (
  SELECT 'hasimozturk@gmail.com'::text AS email, '5 haziran'::text AS keep_name_norm
),
u AS (
  SELECT au.id AS user_id
  FROM auth.users au
  CROSS JOIN cfg
  WHERE lower(au.email) = lower(cfg.email)
),
ports AS (
  SELECT
    p.id,
    p.name,
    p.created_at,
  lower(trim(p.name)) AS name_norm,
    CASE
      WHEN lower(trim(p.name)) = (SELECT keep_name_norm FROM cfg) THEN 'KEEP'
      ELSE 'DELETE'
    END AS action
  FROM public.portfolios p
  JOIN u ON p.user_id = u.user_id
)
SELECT
  action,
  name AS portfolio_name,
  id AS portfolio_id,
  created_at,
  (SELECT count(*) FROM public.holdings h WHERE h.portfolio_id = ports.id) AS holding_count,
  (SELECT count(*) FROM public.allocation_snapshots s WHERE s.portfolio_id = ports.id) AS snapshot_count
FROM ports
ORDER BY action DESC, name;

-- Holding detayı (silinecek portföyler):
/*
WITH cfg AS (SELECT 'hasimozturk@gmail.com'::text AS email, '5 haziran'::text AS keep_name_norm),
u AS (SELECT id AS user_id FROM auth.users au CROSS JOIN cfg WHERE lower(au.email) = lower(cfg.email)),
del_ports AS (
  SELECT p.id FROM public.portfolios p JOIN u ON p.user_id = u.user_id
  WHERE lower(trim(p.name)) <> (SELECT keep_name_norm FROM cfg)
)
SELECT p.name, a.symbol, a.category_id, h.quantity, h.avg_price
FROM public.holdings h
JOIN del_ports dp ON dp.id = h.portfolio_id
JOIN public.portfolios p ON p.id = h.portfolio_id
JOIN public.assets a ON a.id = h.asset_id
ORDER BY p.name, a.symbol;
*/

-- === SİLME (yalnızca önizlemeyi onayladıktan sonra) ===
/*
WITH cfg AS (SELECT 'hasimozturk@gmail.com'::text AS email, '5 haziran'::text AS keep_name_norm),
u AS (SELECT id AS user_id FROM auth.users au CROSS JOIN cfg WHERE lower(au.email) = lower(cfg.email))
DELETE FROM public.portfolios p
USING u, cfg
WHERE p.user_id = u.user_id
  AND lower(trim(p.name)) <> cfg.keep_name_norm;
*/
