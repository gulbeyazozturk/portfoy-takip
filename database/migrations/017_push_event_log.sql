create table if not exists public.push_event_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  event_date date not null,
  event_ref text not null,
  created_at timestamptz not null default now(),
  constraint push_event_log_unique unique (user_id, event_type, event_date, event_ref)
);

create index if not exists idx_push_event_log_event_date
  on public.push_event_log(event_date);

create index if not exists idx_push_event_log_user_event
  on public.push_event_log(user_id, event_type);

alter table public.push_event_log enable row level security;

