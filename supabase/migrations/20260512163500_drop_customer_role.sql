-- * Remove the customer role and account flow entirely. Going forward every
-- * order is a guest order — the storefront has no login, no register, no
-- * "my orders" page. Admins + employees stay (they need the back office).

-- =========================================================================
-- * 1. Backfill orders.guest_* from profiles, then sever user_id.
-- =========================================================================

UPDATE public.orders o
   SET guest_email      = COALESCE(o.guest_email,      p.email),
       guest_first_name = COALESCE(o.guest_first_name, split_part(p.full_name, ' ', 1)),
       guest_last_name  = COALESCE(o.guest_last_name,  NULLIF(regexp_replace(p.full_name, '^\S+\s*', ''), ''))
  FROM public.profiles p
 WHERE o.user_id = p.id
   AND o.user_id IS NOT NULL;

-- =========================================================================
-- * 2. Drop the RLS policies + CHECK that reference user_id.
-- =========================================================================

DROP POLICY IF EXISTS "own orders"      ON public.orders;
DROP POLICY IF EXISTS "own order items" ON public.order_items;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_owner_check;

-- =========================================================================
-- * 3. Drop orders.user_id (FK + column).
-- =========================================================================

ALTER TABLE public.orders DROP COLUMN IF EXISTS user_id;

-- * Re-add a CHECK that simply requires guest_email — every order is a
-- * guest order now.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_guest_email_check
  CHECK (guest_email IS NOT NULL);

-- =========================================================================
-- * 4. Delete every customer profile (cascades through auth.users).
-- =========================================================================

DELETE FROM auth.users
 WHERE id IN (SELECT id FROM public.profiles WHERE role = 'customer');

-- =========================================================================
-- * 5. Narrow the user_role enum to ('admin', 'employee').
-- =========================================================================
-- *
-- * Postgres can't drop an enum value in place, so we swap the type.

ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

CREATE TYPE public.user_role_new AS ENUM ('admin', 'employee');

ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.user_role_new
  USING role::text::public.user_role_new;

DROP TYPE public.user_role;
ALTER TYPE public.user_role_new RENAME TO user_role;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'employee'::public.user_role;

-- =========================================================================
-- * 6. is_admin / is_backoffice helpers don't need changes — they already
-- *    just check the role string against admin / employee values.
-- =========================================================================
