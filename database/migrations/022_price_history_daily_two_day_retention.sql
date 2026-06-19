-- price_history: günde 1 kayıt/varlık, en fazla 2 takvim günü (bugün + dün).
-- 021 insert engelini kaldırır; mevcut geçmişi truncate eder.
-- Günlük bakım: pg_cron 23:55 TSİ (20:55 UTC).

-- 021 engeli
DROP TRIGGER IF EXISTS price_history_reject_insert ON public.price_history;
DROP FUNCTION IF EXISTS public.reject_price_history_insert();

-- Eski geçmiş (kota)
TRUNCATE TABLE public.price_history;

-- Günde en fazla bir satır / varlık (Europe/Istanbul takvim günü)
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS price_day date;

UPDATE public.price_history
SET price_day = (timezone('Europe/Istanbul', recorded_at))::date
WHERE price_day IS NULL;

ALTER TABLE public.price_history
  ALTER COLUMN price_day SET DEFAULT ((timezone('Europe/Istanbul', now()))::date);

ALTER TABLE public.price_history
  ALTER COLUMN price_day SET NOT NULL;

DROP INDEX IF EXISTS idx_price_history_asset_price_day;
CREATE UNIQUE INDEX idx_price_history_asset_price_day
  ON public.price_history (asset_id, price_day);

-- 2 gün tut: bugün + dün (daha eski price_day silinir)
CREATE OR REPLACE FUNCTION public.cleanup_old_price_history(retention_days int DEFAULT 2)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted bigint;
  today_istanbul date := (timezone('Europe/Istanbul', now()))::date;
  cutoff date;
BEGIN
  IF retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1';
  END IF;
  cutoff := today_istanbul - (retention_days - 1);
  DELETE FROM public.price_history WHERE price_day < cutoff;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- assets.current_price → bugünkü satır (upsert) + eski günleri temizle
CREATE OR REPLACE FUNCTION public.run_daily_price_history_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_istanbul date := (timezone('Europe/Istanbul', now()))::date;
  upserted bigint := 0;
  deleted bigint := 0;
BEGIN
  INSERT INTO public.price_history (asset_id, price, recorded_at, price_day)
  SELECT a.id, a.current_price, now(), today_istanbul
  FROM public.assets a
  WHERE a.current_price IS NOT NULL
    AND a.current_price > 0
  ON CONFLICT (asset_id, price_day)
  DO UPDATE SET
    price = EXCLUDED.price,
    recorded_at = EXCLUDED.recorded_at;

  GET DIAGNOSTICS upserted = ROW_COUNT;
  deleted := public.cleanup_old_price_history(2);

  RETURN jsonb_build_object(
    'price_day', today_istanbul,
    'upserted', upserted,
    'deleted', deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_price_history(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_daily_price_history_maintenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_price_history(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_daily_price_history_maintenance() TO service_role;

DROP POLICY IF EXISTS "insert_price_history_service" ON public.price_history;
CREATE POLICY "insert_price_history_service" ON public.price_history
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "update_price_history_service" ON public.price_history;
CREATE POLICY "update_price_history_service" ON public.price_history
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "delete_price_history_service" ON public.price_history;
CREATE POLICY "delete_price_history_service" ON public.price_history
  FOR DELETE TO service_role
  USING (true);

-- 23:55 TSİ = 20:55 UTC
SELECT cron.unschedule('price_history_daily_maintenance_2355_tr')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'price_history_daily_maintenance_2355_tr'
);

SELECT cron.schedule(
  'price_history_daily_maintenance_2355_tr',
  '55 20 * * *',
  $$SELECT public.run_daily_price_history_maintenance();$$
);
