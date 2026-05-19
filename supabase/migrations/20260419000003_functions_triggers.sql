-- * Role helpers (DEVELOPMENT_GUIDE.md §7)
-- * SECURITY DEFINER functions must pin search_path, otherwise they inherit the
-- * caller's (e.g. supabase_auth_admin) which does not include public.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_backoffice() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','employee'));
$$;

-- * New signup → profile row (role always 'customer'; back-office accounts
-- * are provisioned through the admin-users edge function which sets role).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'customer');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- * Keep clubs.fund_balance in sync with fund_transactions (DEVELOPMENT_GUIDE.md §5)
CREATE OR REPLACE FUNCTION public.sync_fund_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clubs
     SET fund_balance = fund_balance + NEW.amount
   WHERE id = NEW.club_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fund_tx_after_insert
  AFTER INSERT ON fund_transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_fund_balance();
