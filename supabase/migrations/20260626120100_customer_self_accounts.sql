-- * Customer self-service accounts — passwordless (magic-link), email is the
-- * identity. Optional: guest checkout, promo codes, prepaid codes and the
-- * access_token order pages all keep working exactly as before. The only
-- * benefit of an account is a consolidated order history + easy tracking.
-- *
-- * Depends on 20260626120000_re_add_customer_role.sql having been committed
-- * first (the 'customer' enum value must already exist).

-- * 1. New auth.users default to the LEAST-PRIVILEGED role.
-- *    Public storefront sign-ups (magic link) become 'customer'. Back-office
-- *    accounts are created via the admin-users edge function, which inserts
-- *    through this trigger and then EXPLICITLY updates the role to
-- *    admin/employee right after — so this default never grants back-office
-- *    access by accident.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- * Least privilege: a brand-new auth user is a storefront customer until an
  -- * admin promotes them. admin-users overwrites this immediately for staff.
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'customer'::public.user_role);
  RETURN NEW;
END;
$$;

-- * 2. Order history for a logged-in customer.
-- *    Identity is the verified account email: return every order whose
-- *    guest_email matches it. SECURITY DEFINER so we don't have to widen RLS
-- *    on the orders table — the function only ever exposes a buyer's OWN rows,
-- *    and only summary columns (incl. the access_token, which is already the
-- *    buyer's own magic link to the full order page).
CREATE OR REPLACE FUNCTION public.get_my_orders()
RETURNS TABLE (
  id              uuid,
  order_number    text,
  status          public.order_status,
  total           numeric,
  delivery_method public.delivery_method,
  created_at      timestamptz,
  paid_at         timestamptz,
  access_token    uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.order_number, o.status, o.total, o.delivery_method,
         o.created_at, o.paid_at, o.access_token
  FROM public.orders o
  WHERE o.guest_email IS NOT NULL
    AND lower(o.guest_email) = lower(nullif(auth.jwt() ->> 'email', ''))
  ORDER BY o.created_at DESC;
$$;

-- * Only signed-in users may call it (anon has no email claim anyway).
REVOKE EXECUTE ON FUNCTION public.get_my_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_orders() TO authenticated;
