# Portföy Takip – Veritabanı Tasarımı

Supabase (PostgreSQL) kullanıyorsunuz. Aşağıdaki şema, portföy + varlık türleri + holding’ler için yeterli ve ileride büyütülebilir.

---

## 1. Önerilen tablolar (özet)

| Tablo | Açıklama |
|-------|----------|
| `categories` | Varlık türleri (Yurtdışı, Bist, Döviz, Emtia, Fon, Kripto) |
| `assets` | Master varlık listesi (Bitcoin, Ethereum, Gram Altın, USD, vb.) |
| `portfolios` | Kullanıcıya ait portföy (tek veya çoklu) |
| `holdings` | Portföydeki pozisyonlar (hangi varlık, miktar, ortalama fiyat) |
| `allocation_snapshots` | (İsteğe bağlı) Donut için tarihsel dağılım yüzdeleri |

Auth kullanacaksanız `auth.users` zaten var; `portfolios.user_id` ile bağlarsınız.

---

## 2. Tablolar (SQL)

Supabase SQL Editor’da sırayla çalıştırabilirsiniz.

```sql
-- 1) Varlık türleri (portföy filtreleri + ekleme sayfası kategorileri)
create table public.categories (
  id text primary key,
  name text not null,
  subtitle text,
  sort_order int not null default 0
);

insert into public.categories (id, name, subtitle, sort_order) values
  ('yurtdisi', 'Yurtdışı', 'Global Hisse Senetleri', 1),
  ('bist', 'Bist', 'Borsa İstanbul', 2),
  ('doviz', 'Döviz', 'Yabancı Para Birimleri', 3),
  ('emtia', 'Emtia', 'Altın, Petrol ve Değerli Metaller', 4),
  ('fon', 'Fon', 'Yatırım Fonları', 5),
  ('kripto', 'Kripto', 'Dijital Varlıklar', 6);

-- 2) Master varlık listesi (arama + “varlık seç” listesi)
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references public.categories(id) on delete restrict,
  name text not null,
  symbol text not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  unique(category_id, symbol)
);

-- Örnek kripto varlıkları
insert into public.assets (category_id, name, symbol, currency) values
  ('kripto', 'Bitcoin', 'BTC', 'USD'),
  ('kripto', 'Ethereum', 'ETH', 'USD'),
  ('kripto', 'Ripple', 'XRP', 'USD'),
  ('kripto', 'Solana', 'SOL', 'USD'),
  ('kripto', 'Polkadot', 'DOT', 'USD'),
  ('kripto', 'Cardano', 'ADA', 'USD');

-- 3) Portföy (auth açıldığında user_id eklenir)
create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null default 'Portföyüm',
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Anonim / tek kullanıcı için örnek portföy (user_id null olabilir)
insert into public.portfolios (name, currency) values ('Portföyüm', 'USD');

-- 4) Holding’ler (portföydeki pozisyonlar)
create table public.holdings (
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

-- 5) (İsteğe bağlı) Dağılım özeti – donut için kategori bazlı yüzde
create table public.allocation_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  category_id text not null references public.categories(id) on delete restrict,
  percentage numeric not null check (percentage >= 0 and percentage <= 100),
  total_value numeric,
  snapshot_at timestamptz not null default now()
);

-- Updated_at tetikleyicisi
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger holdings_updated_at
  before update on public.holdings
  for each row execute function public.set_updated_at();

create trigger portfolios_updated_at
  before update on public.portfolios
  for each row execute function public.set_updated_at();
```

---

## 3. Row Level Security (RLS)

Auth kullanmadan önce tüm tabloları “herkes okuyabilsin, yazabilsin” yapabilirsiniz; auth ekleyince aşağıdaki gibi sıkılaştırırsınız.

```sql
alter table public.categories enable row level security;
alter table public.assets enable row level security;
alter table public.portfolios enable row level security;
alter table public.holdings enable row level security;
alter table public.allocation_snapshots enable row level security;

-- Kategoriler ve varlıklar herkese açık (sadece okuma)
create policy "categories_read" on public.categories for select using (true);
create policy "assets_read" on public.assets for select using (true);

-- Portföy: sadece kendi kayıtları (user_id = auth.uid())
create policy "portfolios_select" on public.portfolios for select using (user_id is null or user_id = auth.uid());
create policy "portfolios_insert" on public.portfolios for insert with check (user_id is null or user_id = auth.uid());
create policy "portfolios_update" on public.portfolios for update using (user_id is null or user_id = auth.uid());

-- Holding ve allocation: ilgili portföy kullanıcıya ait olmalı
create policy "holdings_all" on public.holdings for all using (
  exists (select 1 from public.portfolios p where p.id = portfolio_id and (p.user_id is null or p.user_id = auth.uid()))
);
create policy "allocation_all" on public.allocation_snapshots for all using (
  exists (select 1 from public.portfolios p where p.id = portfolio_id and (p.user_id is null or p.user_id = auth.uid()))
);
```

Auth kullanmıyorsanız RLS’i kapatabilir veya tek bir “anon” policy ile tüm insert/update/select’e izin verebilirsiniz.

---

## 4. Nasıl ilerleyebilirsiniz?

1. **Supabase Dashboard → SQL Editor**  
   Yukarıdaki “Tablolar (SQL)” bölümündeki script’i (RLS hariç veya RLS ile birlikte) çalıştırın.  
   İsterseniz önce `categories` + `assets` + `portfolios` + `holdings` ile başlayın; `allocation_snapshots`’ı sonra ekleyebilirsiniz.

2. **Uygulama tarafı**  
   - Kategoriler: `supabase.from('categories').select('*')`  
   - Varlık listesi (örn. Kripto): `supabase.from('assets').select('*').eq('category_id','kripto')`  
   - Holding’ler: `supabase.from('holdings').select('*, asset:assets(*)').eq('portfolio_id', portfolioId)`  
   - Yeni holding: `supabase.from('holdings').insert({ portfolio_id, asset_id, quantity, avg_price })`

3. **Donut / dağılım**  
   - Ya `allocation_snapshots` tablosuna periyodik yüzde yazarsınız,  
   - Ya da holding’lerden anlık toplam değerleri hesaplayıp (fiyat API’si ile) kategorilere göre yüzde hesaplarsınız. İkinci yol daha dinamik olur.

4. **Fiyat verisi**  
   Başta `avg_price` ve manuel güncelleme yeterli olabilir; sonra bir fiyat API’si (örn. CoinGecko, Alpha Vantage) ile `assets` için güncel fiyat çekip değer hesaplayabilirsiniz.

İsterseniz bir sonraki adımda: hangi tabloyu önce doldurmak istediğinizi (ör. sadece kripto mu, BIST/emtia da var mı?) söyleyin, ona göre `assets` için ek `insert` script’leri ve uygulama tarafında ilk Supabase sorgularını birlikte netleştirebiliriz.
