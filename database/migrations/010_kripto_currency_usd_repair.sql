-- Tek seferlik: Eski sync-crypto (TRY) sonrası kalan kripto satırlarında para birimini USD yapar.
-- ÖNEMLİ: Bu güncelleme yalnızca `currency` sütununu düzeltir; `current_price` hâlâ TL cinsinden
-- olabilir. Hemen ardından güncel fiyat + USD için çalıştırın:
--   npm run sync-crypto
--   (veya: node scripts/sync-crypto-prices.js)

UPDATE public.assets
SET currency = 'USD'
WHERE category_id = 'kripto'
  AND upper(trim(currency)) IN ('TRY', 'TL');
