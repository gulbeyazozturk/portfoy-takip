-- Günlük admin raporu (Supabase SQL Editor veya service role ile).
-- :report_date → rapor günü (TSİ), örn. current_date veya '2026-05-30'
--
-- Önkoşul: 019_app_usage_sessions.sql uygulanmış olmalı (kullanım metrikleri için).
-- auth.users doğrudan SQL'de okunamaz; e-posta için scripts/daily-admin-report.js kullanın.

-- ---------------------------------------------------------------------------
-- 1) Özet (portföy / varlık — auth.users sayısı SQL Editor'da yok)
-- ---------------------------------------------------------------------------
with holding_counts as (
  select
    p.user_id,
    p.id as portfolio_id,
    p.name as portfolio_name,
    count(h.id)::int as asset_count
  from public.portfolios p
  left join public.holdings h on h.portfolio_id = p.id
  where p.user_id is not null
  group by p.user_id, p.id, p.name
),
user_rollups as (
  select
    user_id,
    count(distinct portfolio_id)::int as portfolio_count,
    coalesce(sum(asset_count), 0)::int as total_assets
  from holding_counts
  group by user_id
)
select
  (select count(distinct user_id) from public.portfolios where user_id is not null) as users_with_portfolio,
  (select count(*) from public.portfolios where user_id is not null) as total_portfolios,
  (select count(*) from public.holdings h
   join public.portfolios p on p.id = h.portfolio_id
   where p.user_id is not null) as total_holdings,
  coalesce(sum(portfolio_count), 0) as sum_portfolios_in_rollup,
  coalesce(sum(total_assets), 0) as sum_assets_in_rollup
from user_rollups;

-- ---------------------------------------------------------------------------
-- 2) Kullanıcı × portföy × varlık sayısı
-- ---------------------------------------------------------------------------
select
  p.user_id,
  p.id as portfolio_id,
  p.name as portfolio_name,
  count(h.id)::int as asset_count
from public.portfolios p
left join public.holdings h on h.portfolio_id = p.id
where p.user_id is not null
group by p.user_id, p.id, p.name
order by p.user_id, p.name;

-- ---------------------------------------------------------------------------
-- 3) Seçilen gün — kullanım (oturum sayısı, süre)
--    :report_date yerine sabit tarih: date '2026-05-30'
-- ---------------------------------------------------------------------------
select
  s.user_id,
  count(*)::int as sessions_that_day,
  coalesce(
    sum(
      coalesce(
        s.duration_seconds,
        greatest(0, extract(epoch from (coalesce(s.ended_at, s.started_at) - s.started_at))::int)
      )
    ),
    0
  )::int as total_seconds_that_day,
  round(
    coalesce(
      sum(
        coalesce(
          s.duration_seconds,
          greatest(0, extract(epoch from (coalesce(s.ended_at, s.started_at) - s.started_at))::int)
        )
      ),
      0
    ) / 60.0,
    1
  ) as total_minutes_that_day
from public.app_usage_sessions s
where (s.started_at at time zone 'Europe/Istanbul')::date = date '2026-05-30' -- :report_date
group by s.user_id
order by total_seconds_that_day desc;

-- ---------------------------------------------------------------------------
-- 4) Birleşik günlük rapor satırları (view + portföy; e-posta JS'te eklenir)
-- ---------------------------------------------------------------------------
select
  u.usage_date,
  u.user_id,
  u.session_count,
  u.total_seconds,
  round(u.total_seconds / 60.0, 1) as total_minutes,
  r.portfolio_count,
  r.total_assets
from public.v_app_usage_daily u
left join (
  select
    p.user_id,
    count(distinct p.id)::int as portfolio_count,
    count(h.id)::int as total_assets
  from public.portfolios p
  left join public.holdings h on h.portfolio_id = p.id
  where p.user_id is not null
  group by p.user_id
) r on r.user_id = u.user_id
where u.usage_date = date '2026-05-30' -- :report_date
order by u.total_seconds desc;
