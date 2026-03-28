-- XAUT ve PAXG varlıklarını kripto sınıfından emtia sınıfına taşır.
-- Aynı satır (uuid) güncellenir; holdings ve price_history bağları korunur.
--
-- Supabase: SQL Editor’da çalıştırın. Ardından fiyat senkronu için:
--   node scripts/sync-crypto-prices.js

UPDATE public.assets
SET category_id = 'emtia'
WHERE category_id = 'kripto'
  AND upper(trim(symbol)) IN ('XAUT', 'PAXG');
