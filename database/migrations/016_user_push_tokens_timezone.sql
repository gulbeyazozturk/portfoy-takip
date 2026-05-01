alter table public.user_push_tokens
  add column if not exists timezone text not null default 'Europe/Istanbul';

create index if not exists idx_user_push_tokens_timezone
  on public.user_push_tokens(timezone);

