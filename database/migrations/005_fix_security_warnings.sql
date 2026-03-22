-- Migration 005: Supabase Security Advisor uyarılarını düzeltir
-- Supabase SQL Editor'da çalıştırın.

-- ============================================================
-- 1) Function Search Path Mutable: set_updated_at
--    search_path sabitlenmeli
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2) RLS Policy Always True: holdings
--    Mevcut "USING (true)" policy'leri kaldırıp
--    portfolio_id bazlı kontrol ekle
-- ============================================================

-- Eski policy'leri temizle (varsa)
DROP POLICY IF EXISTS "anon_read_holdings" ON public.holdings;
DROP POLICY IF EXISTS "anon_insert_holdings" ON public.holdings;
DROP POLICY IF EXISTS "anon_update_holdings" ON public.holdings;
DROP POLICY IF EXISTS "anon_delete_holdings" ON public.holdings;
DROP POLICY IF EXISTS "holdings_all" ON public.holdings;

-- Yeni policy'ler: portfolio_id mevcut portföylerde olmalı
CREATE POLICY "holdings_select" ON public.holdings
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = holdings.portfolio_id)
  );

CREATE POLICY "holdings_insert" ON public.holdings
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = holdings.portfolio_id)
  );

CREATE POLICY "holdings_update" ON public.holdings
  FOR UPDATE TO anon
  USING (
    EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = holdings.portfolio_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = holdings.portfolio_id)
  );

CREATE POLICY "holdings_delete" ON public.holdings
  FOR DELETE TO anon
  USING (
    EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = holdings.portfolio_id)
  );

-- ============================================================
-- 3) RLS Policy Always True: allocation_snapshots
-- ============================================================

DROP POLICY IF EXISTS "anon_read_allocation_snapshots" ON public.allocation_snapshots;
DROP POLICY IF EXISTS "anon_insert_allocation_snapshots" ON public.allocation_snapshots;
DROP POLICY IF EXISTS "allocation_all" ON public.allocation_snapshots;

CREATE POLICY "allocation_select" ON public.allocation_snapshots
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = allocation_snapshots.portfolio_id)
  );

CREATE POLICY "allocation_insert" ON public.allocation_snapshots
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = allocation_snapshots.portfolio_id)
  );

-- ============================================================
-- 4) RLS Policy Always True: portfolio_uploads
-- ============================================================

DROP POLICY IF EXISTS "anon_read_portfolio_uploads" ON public.portfolio_uploads;
DROP POLICY IF EXISTS "anon_insert_portfolio_uploads" ON public.portfolio_uploads;

-- portfolio_uploads: sadece son 24 saatteki kayıtları okuyabilir,
-- insert sınırsız (dosya adı boş olamaz)
CREATE POLICY "uploads_select" ON public.portfolio_uploads
  FOR SELECT TO anon
  USING (created_at > now() - interval '24 hours');

CREATE POLICY "uploads_insert" ON public.portfolio_uploads
  FOR INSERT TO anon
  WITH CHECK (filename IS NOT NULL AND filename <> '');
