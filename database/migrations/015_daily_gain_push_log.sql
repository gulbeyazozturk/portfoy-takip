create table if not exists public.daily_gain_push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  alert_date date not null,
  threshold numeric not null default 3,
  change_24h_pct numeric not null,
  sent_at timestamptz not null default now(),
  constraint daily_gain_push_log_unique unique (user_id, asset_id, alert_date, threshold)
);

create index if not exists idx_daily_gain_push_log_alert_date
  on public.daily_gain_push_log(alert_date);

create index if not exists idx_daily_gain_push_log_user_id
  on public.daily_gain_push_log(user_id);

alter table public.daily_gain_push_log enable row level security;

