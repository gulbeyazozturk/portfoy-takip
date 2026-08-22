-- Migration 023: Fon stopaj metadata (TEFAS sınıflandırması + referans stopaj oranları)
-- Supabase SQL Editor'da çalıştırın veya setup script ile uygulayın.

create table if not exists public.fund_tax_metadata (
  symbol text primary key,
  asset_id uuid references public.assets(id) on delete set null,
  fund_kind text not null check (fund_kind in ('YAT', 'EMK', 'BYF', 'GYF', 'GSYF')),
  fund_name text not null,
  umbrella_type text,
  category text,
  is_hisse_yogun boolean not null default false,
  is_serbest boolean not null default false,
  tefas_listed boolean not null default false,
  stopaj_pct_reference numeric not null default 17.5,
  stopaj_schedule jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.fund_tax_metadata is
  'TEFAS fon sınıflandırması ve GVK Geçici 67 referans stopaj oranları; günlük sync-fund-tax-metadata ile güncellenir.';

comment on column public.fund_tax_metadata.stopaj_pct_reference is
  'İktisap tarihi bilinmediğinde kullanılan referans stopaj % (0–100).';

comment on column public.fund_tax_metadata.stopaj_schedule is
  'Dönem tablosu + kural özeti (JSON); lib/fund-stopaj.ts ile uyumlu.';

create index if not exists idx_fund_tax_metadata_asset_id
  on public.fund_tax_metadata(asset_id);

create index if not exists idx_fund_tax_metadata_fund_kind
  on public.fund_tax_metadata(fund_kind);

alter table public.fund_tax_metadata enable row level security;

drop policy if exists "auth_read_fund_tax_metadata" on public.fund_tax_metadata;
create policy "auth_read_fund_tax_metadata" on public.fund_tax_metadata
  for select to authenticated, anon using (true);

-- Yazma: yalnızca service_role (sync script); istemci insert/update yok.
