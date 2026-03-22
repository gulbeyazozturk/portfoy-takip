-- Varlık fiyat geçmişi tablosu
-- Her sync döngüsünde tüm varlıkların current_price değeri burada kayıt altına alınır.
-- asset-entry ekranındaki grafik bu tablodan beslenir.

CREATE TABLE IF NOT EXISTS public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_asset_time
  ON public.price_history (asset_id, recorded_at DESC);

-- RLS
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_history_select" ON public.price_history
  FOR SELECT USING (true);

CREATE POLICY "price_history_insert" ON public.price_history
  FOR INSERT WITH CHECK (true);

-- Eski verileri temizlemek için (isteğe bağlı): 6 aydan eski kayıtları silme fonksiyonu
CREATE OR REPLACE FUNCTION public.cleanup_old_price_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.price_history
  WHERE recorded_at < now() - INTERVAL '6 months';
END;
$$;
