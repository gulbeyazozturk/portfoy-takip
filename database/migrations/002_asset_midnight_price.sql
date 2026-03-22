-- Gece 00:00 (Türkiye) açılış kuru – günlük değişim yüzdesi hesaplamak için
-- Supabase SQL Editor'da çalıştır.

alter table public.assets
  add column if not exists price_at_midnight numeric,
  add column if not exists price_midnight_date date;

comment on column public.assets.price_at_midnight is 'O gün gece 00:00 (TR) anındaki kur/fiyat';
comment on column public.assets.price_midnight_date is 'price_at_midnight hangi güne ait (TR tarih)';
