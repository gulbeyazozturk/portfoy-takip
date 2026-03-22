-- Enable RLS on all public tables and add anon policies
-- service_role key bypasses RLS automatically (sync scripts unaffected)

-- 1. categories (read-only reference data)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_categories" ON public.categories
  FOR SELECT TO anon USING (true);

-- 2. assets (read-only for app; sync scripts use service_role)
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_assets" ON public.assets
  FOR SELECT TO anon USING (true);

-- 3. portfolios (read-only for app)
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_portfolios" ON public.portfolios
  FOR SELECT TO anon USING (true);

-- 4. holdings (full CRUD for portfolio management)
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_holdings" ON public.holdings
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_holdings" ON public.holdings
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_holdings" ON public.holdings
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_holdings" ON public.holdings
  FOR DELETE TO anon USING (true);

-- 5. allocation_snapshots
ALTER TABLE public.allocation_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_allocation_snapshots" ON public.allocation_snapshots
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_allocation_snapshots" ON public.allocation_snapshots
  FOR INSERT TO anon WITH CHECK (true);

-- 6. portfolio_uploads
ALTER TABLE public.portfolio_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_portfolio_uploads" ON public.portfolio_uploads
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_portfolio_uploads" ON public.portfolio_uploads
  FOR INSERT TO anon WITH CHECK (true);
