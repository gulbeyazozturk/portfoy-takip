-- Kripto fiyat ve ikon alanları (günlük batch ile doldurulacak)
-- Supabase SQL Editor'da çalıştır.

alter table public.assets
  add column if not exists external_id text,
  add column if not exists current_price numeric,
  add column if not exists icon_url text,
  add column if not exists price_updated_at timestamptz;

comment on column public.assets.external_id is 'CoinGecko coin id (örn: bitcoin)';
comment on column public.assets.current_price is 'Son çekilen fiyat (USD)';
comment on column public.assets.icon_url is 'CoinGecko ikon URL';
comment on column public.assets.price_updated_at is 'Fiyatın son güncellenme zamanı';
