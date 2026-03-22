-- Migration 007: Auth ve kullanıcı bazlı RLS politikaları
-- Supabase SQL Editor'da çalıştırın.

-- portfolios tablosunda user_id yoksa ekle
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON public.portfolios(user_id);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- Mevcut policy'leri temizle
DROP POLICY IF EXISTS "anon_read_categories" ON public.categories;
DROP POLICY IF EXISTS "categories_read" ON public.categories;
DROP POLICY IF EXISTS "auth_read_categories" ON public.categories;

DROP POLICY IF EXISTS "anon_read_assets" ON public.assets;
DROP POLICY IF EXISTS "assets_read" ON public.assets;
DROP POLICY IF EXISTS "auth_read_assets" ON public.assets;

DROP POLICY IF EXISTS "anon_read_portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "portfolios_select" ON public.portfolios;
DROP POLICY IF EXISTS "portfolios_insert" ON public.portfolios;
DROP POLICY IF EXISTS "portfolios_update" ON public.portfolios;
DROP POLICY IF EXISTS "portfolios_delete" ON public.portfolios;

DROP POLICY IF EXISTS "holdings_select" ON public.holdings;
DROP POLICY IF EXISTS "holdings_insert" ON public.holdings;
DROP POLICY IF EXISTS "holdings_update" ON public.holdings;
DROP POLICY IF EXISTS "holdings_delete" ON public.holdings;
DROP POLICY IF EXISTS "holdings_all" ON public.holdings;

DROP POLICY IF EXISTS "allocation_select" ON public.allocation_snapshots;
DROP POLICY IF EXISTS "allocation_insert" ON public.allocation_snapshots;
DROP POLICY IF EXISTS "allocation_update" ON public.allocation_snapshots;
DROP POLICY IF EXISTS "allocation_delete" ON public.allocation_snapshots;
DROP POLICY IF EXISTS "allocation_all" ON public.allocation_snapshots;

DROP POLICY IF EXISTS "uploads_select" ON public.portfolio_uploads;
DROP POLICY IF EXISTS "uploads_insert" ON public.portfolio_uploads;
DROP POLICY IF EXISTS "uploads_update" ON public.portfolio_uploads;
DROP POLICY IF EXISTS "uploads_delete" ON public.portfolio_uploads;

DROP POLICY IF EXISTS "read_price_history" ON public.price_history;
DROP POLICY IF EXISTS "insert_price_history_service" ON public.price_history;
DROP POLICY IF EXISTS "auth_read_price_history" ON public.price_history;

-- Referans tablolar: authenticated + anon read
CREATE POLICY "auth_read_categories" ON public.categories
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "auth_read_assets" ON public.assets
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "auth_read_price_history" ON public.price_history
  FOR SELECT TO authenticated, anon USING (true);

-- portfolios: sadece kendi kayıtları
CREATE POLICY "portfolios_select" ON public.portfolios
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "portfolios_insert" ON public.portfolios
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "portfolios_update" ON public.portfolios
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "portfolios_delete" ON public.portfolios
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- holdings: ilgili portfolio auth.uid()'e ait olmalı
CREATE POLICY "holdings_select" ON public.holdings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = holdings.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "holdings_insert" ON public.holdings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = holdings.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "holdings_update" ON public.holdings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = holdings.portfolio_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = holdings.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "holdings_delete" ON public.holdings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = holdings.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

-- allocation_snapshots: ilgili portfolio auth.uid()'e ait olmalı
CREATE POLICY "allocation_select" ON public.allocation_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = allocation_snapshots.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "allocation_insert" ON public.allocation_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = allocation_snapshots.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "allocation_update" ON public.allocation_snapshots
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = allocation_snapshots.portfolio_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = allocation_snapshots.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "allocation_delete" ON public.allocation_snapshots
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolios p
      WHERE p.id = allocation_snapshots.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

-- portfolio_uploads: authenticated kullanıcı sadece kendi kayıtlarını görsün/yazsın
ALTER TABLE public.portfolio_uploads
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_portfolio_uploads_user_id ON public.portfolio_uploads(user_id);

CREATE POLICY "uploads_select" ON public.portfolio_uploads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "uploads_insert" ON public.portfolio_uploads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND filename IS NOT NULL AND filename <> '');

CREATE POLICY "uploads_update" ON public.portfolio_uploads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "uploads_delete" ON public.portfolio_uploads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
