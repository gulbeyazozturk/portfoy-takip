-- Yeni auth kullanıcısı için otomatik varsayılan portföy (Ana Portföy).
-- E-posta kayıt, OAuth vb. tüm kayıt yollarında auth.users INSERT ile çalışır.
-- İstemci refresh() ile çift kayıt riski: kullanıcıda zaten portföy varsa ekleme yapılmaz.

CREATE OR REPLACE FUNCTION public.handle_new_user_default_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.portfolios (user_id, name, currency)
  SELECT NEW.id, 'Ana Portföy', 'USD'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.portfolios p WHERE p.user_id = NEW.id LIMIT 1
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_default_portfolio ON auth.users;

CREATE TRIGGER on_auth_user_created_default_portfolio
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_default_portfolio();

COMMENT ON FUNCTION public.handle_new_user_default_portfolio() IS
  'Yeni kullanıcıda henüz portföy yoksa Ana Portföy oluşturur.';
