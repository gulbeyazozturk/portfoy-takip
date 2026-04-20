-- Migration 012: Kullanıcının kendi hesabını ve ilişkili verilerini silmesi için RPC
-- Not: portfolios.user_id ve portfolio_uploads.user_id FK'leri ON DELETE CASCADE olduğu için
-- auth.users satırı silindiğinde kullanıcıya ait veriler de temizlenir.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM auth.users
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
