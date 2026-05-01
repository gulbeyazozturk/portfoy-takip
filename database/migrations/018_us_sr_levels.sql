create table if not exists public.us_sr_levels (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  level_date date not null,
  support_price numeric,
  resistance_price numeric,
  calculated_at timestamptz not null default now(),
  constraint us_sr_levels_unique unique (asset_id, level_date)
);

create index if not exists idx_us_sr_levels_level_date on public.us_sr_levels(level_date);
create index if not exists idx_us_sr_levels_asset_id on public.us_sr_levels(asset_id);

alter table public.us_sr_levels enable row level security;

