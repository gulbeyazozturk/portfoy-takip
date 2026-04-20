-- ABD (yurtdisi) fiyat senkronu için sıralı batch offset’i (Supabase Edge / dış cron).
-- Service role RLS’yi bypass eder; uygulama anon key ile bu tabloya erişmemeli.

create table if not exists public.abd_sync_cursor (
  id text primary key,
  symbol_offset int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.abd_sync_cursor (id, symbol_offset)
values ('yurtdisi_prices', 0)
on conflict (id) do nothing;

alter table public.abd_sync_cursor enable row level security;

-- Anon/authenticated: erişim yok (service_role RLS’yi bypass eder)
create policy "abd_sync_cursor_deny_all"
  on public.abd_sync_cursor
  for all
  using (false);

comment on table public.abd_sync_cursor is 'Yurtdisi fiyat Edge senkronu: son işlenen sembol sırası offset (order by symbol).';
