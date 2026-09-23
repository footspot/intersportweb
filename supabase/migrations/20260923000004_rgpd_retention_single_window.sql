-- * RGPD retention — ONE definition of the retention window, shared by the
-- * nightly SQL job and the customer-facing erasure endpoint.
-- *
-- * Why this migration exists: customer-account's DELETE handler had re-implemented
-- * the window in TypeScript and filtered on `created_at`, while the SQL job filters
-- * on COALESCE(delivered_at, shipped_at, paid_at, created_at). Those disagree for
-- * any order created long before it was delivered, and the TypeScript version was
-- * the wrong one — RGPD art. 17.3.b defers to legal retention obligations, and the
-- * consumer-law obligation runs from DELIVERY (C. consommation L.213-1 / D.213-2),
-- * not from the moment the basket was created. An order created 4 years ago but
-- * delivered last year is still inside its obligation and must NOT be anonymised.
-- *
-- * The fix is not to copy the right filter into TypeScript — it is to have exactly
-- * one definition. The edge function now calls rgpd_anonymise_orders() over RPC, so
-- * the window is defined here and nowhere else.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The window, as composable pieces. Pure functions, no table access, so they
--    are safe to expose and cheap to call once per row.
-- ─────────────────────────────────────────────────────────────────────────────

-- * Change the retention period HERE and nowhere else. It is mirrored in plain
-- * French on /confidentialite — if you change it, change that page in the same
-- * commit or the published policy becomes a lie.
CREATE OR REPLACE FUNCTION public.rgpd_order_retention_window()
RETURNS interval LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT INTERVAL '3 years'
$$;

-- * A basket that was never paid is not a sale; a delivered order is. Only these
-- * states are "finished" enough for the retention clock to be running at all.
CREATE OR REPLACE FUNCTION public.rgpd_order_terminal_statuses()
RETURNS order_status[] LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT ARRAY['delivered', 'picked_up', 'cancelled', 'refunded', 'abandoned']::order_status[]
$$;

-- * When the retention clock starts. Delivery first — that is the event the legal
-- * obligation hangs off. The fallbacks are for orders that never reached delivery
-- * (cancelled, abandoned), in decreasing order of how well they evidence the sale.
CREATE OR REPLACE FUNCTION public.rgpd_order_retention_anchor(
  p_delivered_at timestamptz,
  p_shipped_at   timestamptz,
  p_paid_at      timestamptz,
  p_created_at   timestamptz
) RETURNS timestamptz LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(p_delivered_at, p_shipped_at, p_paid_at, p_created_at)
$$;

-- * The single predicate. Both the sweep and the per-customer erasure go through
-- * this, so they cannot drift apart again.
CREATE OR REPLACE FUNCTION public.rgpd_order_retention_expired(
  p_status           order_status,
  p_delivered_at     timestamptz,
  p_shipped_at       timestamptz,
  p_paid_at          timestamptz,
  p_created_at       timestamptz,
  p_shipping_address jsonb
) RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT p_status = ANY (public.rgpd_order_terminal_statuses())
     AND public.rgpd_order_retention_anchor(
           p_delivered_at, p_shipped_at, p_paid_at, p_created_at
         ) < now() - public.rgpd_order_retention_window()
     -- * Already done: makes the job idempotent and keeps re-runs cheap.
     AND (p_shipping_address->>'anonymised') IS DISTINCT FROM 'true'
$$;

COMMENT ON FUNCTION public.rgpd_order_retention_expired(order_status, timestamptz, timestamptz, timestamptz, timestamptz, jsonb) IS
  'Single source of truth for the order retention window. The clock runs from delivery (C. consommation L.213-1 / D.213-2), not from created_at.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The anonymisation itself, optionally scoped to one customer.
-- ─────────────────────────────────────────────────────────────────────────────
-- ! guest_email is pseudonymised, never NULLed: `orders_guest_email_check`
-- !   CHECK (guest_email IS NOT NULL)
-- ! so nulling it raises a check violation on every row and the whole job aborts.
-- ! (There is no `user_id` column on orders and no `orders_identity_chk` — earlier
-- ! comments in this directory claimed both; they were wrong.)
-- !
-- ! We write an undeliverable RFC 2606 `.invalid` address built from the order
-- ! NUMBER — not from a hash of the real e-mail, which would still be linkable by
-- ! brute force over a known address list and so would not be anonymisation at all
-- ! (CNIL: pseudonymised data is still personal data).
--
-- * p_email NULL  → the global sweep (the weekly cron).
-- * p_email set   → just that customer's orders (art. 17 erasure via customer-account).
-- * Returns the number of orders anonymised BY THIS CALL.
CREATE OR REPLACE FUNCTION public.rgpd_anonymise_orders(p_email text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH stale AS (
    SELECT o.id, o.order_number
      FROM orders o
     WHERE public.rgpd_order_retention_expired(
             o.status, o.delivered_at, o.shipped_at, o.paid_at, o.created_at, o.shipping_address)
       AND (p_email IS NULL OR lower(o.guest_email) = lower(p_email))
  ), anonymised AS (
    UPDATE orders o
       SET guest_email      = 'anonymise+' || s.order_number || '@invalid',
           guest_first_name = NULL,
           guest_last_name  = NULL,
           -- * Keep only what serves statistics, never what identifies.
           shipping_address = jsonb_build_object(
             'anonymised',  true,
             'postal_code', o.shipping_address->>'postal_code',
             'country',     o.shipping_address->>'country'
           )
      FROM stale s
     WHERE o.id = s.id
    RETURNING o.id
  ), items AS (
    -- * Flocking carries a real person's name / initials / number printed on the
    -- * garment — just as identifying as the delivery address.
    -- * Data-modifying CTEs always run to completion even when the outer query does
    -- * not read them, so this executes whether or not it is selected from.
    UPDATE order_items oi
       SET flocking_name    = NULL,
           flocking_initial = NULL,
           flocking_number  = NULL
      FROM anonymised a
     WHERE oi.order_id = a.id
       AND (oi.flocking_name IS NOT NULL
            OR oi.flocking_initial IS NOT NULL
            OR oi.flocking_number IS NOT NULL)
    RETURNING oi.order_id
  )
  SELECT count(*) INTO v_count FROM anonymised;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.rgpd_anonymise_orders(text) IS
  'Anonymises buyer identity on orders past the retention window. p_email NULL = global sweep; set = that customer only. Returns rows anonymised by this call. Invoice PDFs are untouched.';

-- * Now a thin wrapper over the shared implementation. Its return value is
-- * unchanged (cumulative total of anonymised orders) so the existing cron entry
-- * and its documented contract keep working exactly as before.
CREATE OR REPLACE FUNCTION public.rgpd_anonymise_old_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  PERFORM public.rgpd_anonymise_orders(NULL);

  SELECT count(*) INTO v_total
    FROM orders
   WHERE (shipping_address->>'anonymised') = 'true';

  RETURN v_total;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants — definer rights over personal data stay off the public API roles.
--    service_role needs EXECUTE because customer-account calls it over RPC.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.rgpd_anonymise_orders(text)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rgpd_anonymise_old_orders()  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rgpd_anonymise_orders(text) TO service_role;
