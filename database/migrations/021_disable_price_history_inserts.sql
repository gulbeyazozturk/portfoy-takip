-- price_history tablosuna yeni kayıt yazımını engelle (kota tasarrufu; SELECT devam eder).
-- Tekrar açmak: DROP TRIGGER price_history_reject_insert ON public.price_history;

CREATE OR REPLACE FUNCTION public.reject_price_history_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'price_history inserts are disabled';
END;
$$;

DROP TRIGGER IF EXISTS price_history_reject_insert ON public.price_history;
CREATE TRIGGER price_history_reject_insert
  BEFORE INSERT ON public.price_history
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_price_history_insert();

DROP POLICY IF EXISTS "price_history_insert" ON public.price_history;
DROP POLICY IF EXISTS "insert_price_history_service" ON public.price_history;
