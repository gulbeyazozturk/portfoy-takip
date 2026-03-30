-- price_history tek komutta boşaltma (milyon satırda DELETE döngüsü yerine).
-- Supabase Dashboard → SQL → çalıştır. Sonra: node scripts/truncate-price-history.js
-- veya SEED_NUKE_ALL ile seed script bu fonksiyonu çağırır.

CREATE OR REPLACE FUNCTION public.truncate_price_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE TABLE public.price_history;
END;
$$;

REVOKE ALL ON FUNCTION public.truncate_price_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.truncate_price_history() TO service_role;
