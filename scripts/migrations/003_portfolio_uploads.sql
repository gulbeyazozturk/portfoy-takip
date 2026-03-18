-- Toplu yükleme ile atılan dosyaların kaydı
-- Supabase SQL Editor'da çalıştırın.

create table if not exists public.portfolio_uploads (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_size bigint,
  raw_content text,
  created_at timestamptz not null default now()
);

-- RLS (isterseniz açın)
-- alter table public.portfolio_uploads enable row level security;
-- create policy "Allow insert for anon" on public.portfolio_uploads for insert with (true);
-- create policy "Allow select for anon" on public.portfolio_uploads for select with (true);
