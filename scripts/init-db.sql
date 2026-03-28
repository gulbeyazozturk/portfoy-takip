-- Portföy Takip - Supabase tabloları
-- Supabase Dashboard → SQL Editor → bu dosyayı yapıştırıp Run ile çalıştır.

-- 1) Varlık türleri
create table if not exists public.categories (
  id text primary key,
  name text not null,
  subtitle text,
  sort_order int not null default 0
);

insert into public.categories (id, name, subtitle, sort_order) values
  ('yurtdisi', 'ABD', 'Global Hisse Senetleri', 1),
  ('bist', 'Bist', 'Borsa İstanbul', 2),
  ('doviz', 'Döviz', 'Yabancı Para Birimleri', 3),
  ('emtia', 'Emtia', 'Altın, Petrol ve Değerli Metaller', 4),
  ('fon', 'Fon', 'Yatırım Fonları', 5),
  ('kripto', 'Kripto', 'Dijital Varlıklar', 6)
on conflict (id) do nothing;

-- Zaten kurulu veritabanı: display adı güncellemek için
-- update public.categories set name = 'ABD' where id = 'yurtdisi';

-- 2) Master varlık listesi
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references public.categories(id) on delete restrict,
  name text not null,
  symbol text not null,
  currency text not null default 'USD',
  -- Son senkronize edilen piyasa fiyatı (ör. CoinGecko, BIST)
  current_price numeric,
  price_updated_at timestamptz,
  -- Son 24 saatteki yüzde değişim (piyasa verisi)
  change_24h_pct numeric,
  created_at timestamptz not null default now(),
  unique(category_id, symbol)
);

insert into public.assets (category_id, name, symbol, currency) values
  ('kripto', 'Bitcoin', 'BTC', 'USD'),
  ('kripto', 'Ethereum', 'ETH', 'USD'),
  ('kripto', 'Ripple', 'XRP', 'USD'),
  ('kripto', 'Solana', 'SOL', 'USD'),
  ('kripto', 'Polkadot', 'DOT', 'USD'),
  ('kripto', 'Cardano', 'ADA', 'USD')
on conflict (category_id, symbol) do nothing;

-- 3) Portföy
create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null default 'Portföyüm',
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Not: auth geldiği için burada global/anon seed portfolio oluşturmayın.
-- Kullanıcıya ait portfolio, uygulama katmanında user_id ile oluşturulmalı.

-- 4) Holding'ler
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  quantity numeric not null check (quantity >= 0),
  avg_price numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(portfolio_id, asset_id)
);

-- 5) Dağılım özeti (donut)
create table if not exists public.allocation_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  category_id text not null references public.categories(id) on delete restrict,
  percentage numeric not null check (percentage >= 0 and percentage <= 100),
  total_value numeric,
  snapshot_at timestamptz not null default now()
);

-- updated_at tetikleyicileri
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists holdings_updated_at on public.holdings;
create trigger holdings_updated_at
  before update on public.holdings
  for each row execute function public.set_updated_at();

drop trigger if exists portfolios_updated_at on public.portfolios;
create trigger portfolios_updated_at
  before update on public.portfolios
  for each row execute function public.set_updated_at();
