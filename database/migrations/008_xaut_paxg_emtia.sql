-- XAUT / PAXG: kripto → emtia (tek sefer; uuid korunur)
UPDATE public.assets
SET category_id = 'emtia'
WHERE category_id = 'kripto'
  AND upper(trim(symbol)) IN ('XAUT', 'PAXG');
