-- Uygulama oturumları: günlük giriş sayısı ve ekranda geçirilen süre raporu için.
-- İstemci AppState (foreground/background) ile started_at / ended_at yazar.

create table if not exists public.app_usage_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  platform text not null default 'unknown',
  created_at timestamptz not null default now(),
  constraint app_usage_sessions_platform_check
    check (platform in ('ios', 'android', 'web', 'unknown')),
  constraint app_usage_sessions_duration_nonneg
    check (duration_seconds is null or duration_seconds >= 0),
  constraint app_usage_sessions_time_order
    check (ended_at is null or ended_at >= started_at)
);

create index if not exists idx_app_usage_sessions_user_started
  on public.app_usage_sessions (user_id, started_at desc);

create index if not exists idx_app_usage_sessions_report_date
  on public.app_usage_sessions (
    ((started_at at time zone 'Europe/Istanbul')::date)
  );

alter table public.app_usage_sessions enable row level security;

drop policy if exists app_usage_sessions_select_own on public.app_usage_sessions;
create policy app_usage_sessions_select_own
  on public.app_usage_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists app_usage_sessions_insert_own on public.app_usage_sessions;
create policy app_usage_sessions_insert_own
  on public.app_usage_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists app_usage_sessions_update_own on public.app_usage_sessions;
create policy app_usage_sessions_update_own
  on public.app_usage_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Günlük özet (TSİ takvim günü)
create or replace view public.v_app_usage_daily as
select
  user_id,
  (started_at at time zone 'Europe/Istanbul')::date as usage_date,
  count(*)::int as session_count,
  coalesce(
    sum(
      coalesce(
        duration_seconds,
        greatest(0, extract(epoch from (coalesce(ended_at, now()) - started_at))::int)
      )
    ),
    0
  )::int as total_seconds
from public.app_usage_sessions
group by user_id, (started_at at time zone 'Europe/Istanbul')::date;

comment on view public.v_app_usage_daily is
  'Kullanıcı × gün: oturum sayısı ve toplam süre (saniye, TSİ).';
