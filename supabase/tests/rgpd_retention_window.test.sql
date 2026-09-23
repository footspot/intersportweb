-- * Tests for the RGPD order-retention window.
-- *
-- * Run against a database that has 20260923000004_rgpd_retention_single_window.sql
-- * applied:
-- *
-- *   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rgpd_retention_window.test.sql
-- *
-- * The whole file runs inside one transaction and ends in ROLLBACK, so it leaves
-- * nothing behind and is safe to run against a database with real data. Any failed
-- * assertion raises and aborts, which also rolls back.
-- *
-- * What this file is really guarding: the retention window must have exactly ONE
-- * definition. customer-account used to re-implement it in TypeScript and filtered
-- * on `created_at`; the SQL sweep filters on COALESCE(delivered_at, …). The two
-- * disagree precisely for an order created long before it was delivered, and the
-- * TypeScript one was wrong — RGPD art. 17.3.b defers to legal retention
-- * obligations, and the consumer-law obligation runs from DELIVERY
-- * (C. consommation L.213-1 / D.213-2). Test 1 is that exact case.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(p_cond boolean, p_label text) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL — %', p_label;
  END IF;
  RAISE NOTICE 'ok — %', p_label;
END
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The predicate. Pure — touches no rows.
-- ─────────────────────────────────────────────────────────────────────────────
DO $t1$
BEGIN
  -- ! THE REGRESSION. created_at is outside the window, delivered_at is inside it.
  -- ! The order is still within its legal retention obligation, so it must be KEPT
  -- ! with its identity intact. Filtering on created_at would wrongly expire it.
  PERFORM pg_temp.ok(
    public.rgpd_order_retention_expired(
      'delivered'::order_status,
      now() - interval '1 year',    -- delivered_at → inside the window
      NULL,
      NULL,
      now() - interval '4 years',   -- created_at   → outside the window
      '{}'::jsonb
    ) IS FALSE,
    'order created 4y ago but delivered 1y ago is KEPT (clock runs from delivery, not creation)');

  -- * The same order once delivery itself ages past the window.
  PERFORM pg_temp.ok(
    public.rgpd_order_retention_expired(
      'delivered'::order_status,
      now() - interval '4 years',
      NULL, NULL,
      now() - interval '5 years',
      '{}'::jsonb
    ) IS TRUE,
    'order delivered 4y ago IS expired');

  -- * Never delivered or shipped: the clock falls back down the chain.
  PERFORM pg_temp.ok(
    public.rgpd_order_retention_expired(
      'cancelled'::order_status,
      NULL, NULL,
      now() - interval '4 years',   -- paid_at
      now() - interval '4 years',
      '{}'::jsonb
    ) IS TRUE,
    'cancelled order paid 4y ago falls back to paid_at and IS expired');

  PERFORM pg_temp.ok(
    public.rgpd_order_retention_anchor(
      NULL, now() - interval '2 years', now() - interval '3 years', now() - interval '4 years'
    ) = now() - interval '2 years',
    'anchor prefers shipped_at when delivered_at is absent');

  -- * A live order is not finished, however old the basket is.
  PERFORM pg_temp.ok(
    public.rgpd_order_retention_expired(
      'paid'::order_status,
      NULL, NULL, now() - interval '9 years', now() - interval '9 years', '{}'::jsonb
    ) IS FALSE,
    'non-terminal status is never expired');

  -- * Idempotence: an already-anonymised row is not picked up again.
  PERFORM pg_temp.ok(
    public.rgpd_order_retention_expired(
      'delivered'::order_status,
      now() - interval '9 years', NULL, NULL, now() - interval '9 years',
      '{"anonymised": true}'::jsonb
    ) IS FALSE,
    'already-anonymised order is skipped (idempotent)');
END
$t1$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. End to end through rgpd_anonymise_orders(), the function customer-account
--    calls over RPC. Two fixture orders under one e-mail: one inside the window,
--    one outside.
-- ─────────────────────────────────────────────────────────────────────────────
DO $t2$
DECLARE
  v_email      text := 'rgpd-retention-test@example.invalid';
  v_keep_id    uuid;
  v_expire_id  uuid;
  v_product_id uuid;
  v_anonymised integer;
  v_row        record;
BEGIN
  SELECT id INTO v_product_id FROM products LIMIT 1;

  -- * Created 4 years ago, delivered 1 year ago → inside the obligation → KEEP.
  INSERT INTO orders (order_number, status, subtotal, total, shipping_address,
                      guest_email, guest_first_name, guest_last_name,
                      created_at, paid_at, delivered_at)
  VALUES ('TEST-RGPD-KEEP', 'delivered', 100, 100,
          '{"postal_code":"75001","country":"FR","line1":"1 rue de Test"}'::jsonb,
          v_email, 'Jean', 'Testeur',
          now() - interval '4 years', now() - interval '4 years', now() - interval '1 year')
  RETURNING id INTO v_keep_id;

  -- * Delivered 4 years ago → obligation elapsed → ANONYMISE.
  INSERT INTO orders (order_number, status, subtotal, total, shipping_address,
                      guest_email, guest_first_name, guest_last_name,
                      created_at, paid_at, delivered_at)
  VALUES ('TEST-RGPD-EXPIRE', 'delivered', 100, 100,
          '{"postal_code":"75002","country":"FR","line1":"2 rue de Test"}'::jsonb,
          v_email, 'Jean', 'Testeur',
          now() - interval '5 years', now() - interval '5 years', now() - interval '4 years')
  RETURNING id INTO v_expire_id;

  IF v_product_id IS NOT NULL THEN
    INSERT INTO order_items (order_id, product_id, quantity, size,
                             buying_price_snapshot, selling_price_snapshot,
                             unit_price_paid, fund_credit_snapshot, flocking_name)
    VALUES (v_keep_id,   v_product_id, 1, 'M', 10, 100, 100, 0, 'DUPONT'),
           (v_expire_id, v_product_id, 1, 'M', 10, 100, 100, 0, 'DUPONT');
  END IF;

  -- * Scoped to this customer only, exactly as customer-account calls it.
  v_anonymised := public.rgpd_anonymise_orders(v_email);

  PERFORM pg_temp.ok(v_anonymised = 1,
    format('exactly one of the two orders was anonymised (got %s)', v_anonymised));

  -- ! The order still inside its obligation: row present, identity untouched.
  SELECT * INTO v_row FROM orders WHERE id = v_keep_id;
  PERFORM pg_temp.ok(v_row.id IS NOT NULL,
    'in-window order still exists (never hard-deleted)');
  PERFORM pg_temp.ok(v_row.guest_email = v_email,
    'in-window order keeps its real e-mail');
  PERFORM pg_temp.ok(v_row.guest_first_name = 'Jean' AND v_row.guest_last_name = 'Testeur',
    'in-window order keeps the buyer name');
  PERFORM pg_temp.ok((v_row.shipping_address->>'anonymised') IS DISTINCT FROM 'true',
    'in-window order keeps its shipping address');

  -- * The elapsed order: pseudonymised in place, still present for accounting.
  SELECT * INTO v_row FROM orders WHERE id = v_expire_id;
  PERFORM pg_temp.ok(v_row.id IS NOT NULL,
    'expired order still exists (pseudonymised, never hard-deleted)');
  PERFORM pg_temp.ok(v_row.guest_email = 'anonymise+TEST-RGPD-EXPIRE@invalid',
    'expired order gets an RFC 2606 .invalid address built from the order number');
  PERFORM pg_temp.ok(v_row.guest_email IS NOT NULL,
    'guest_email is never NULL (orders_guest_email_check)');
  PERFORM pg_temp.ok(v_row.guest_first_name IS NULL AND v_row.guest_last_name IS NULL,
    'expired order loses the buyer name');
  PERFORM pg_temp.ok((v_row.shipping_address->>'anonymised') = 'true',
    'expired order address is replaced by the anonymised stub');
  PERFORM pg_temp.ok(v_row.shipping_address->>'postal_code' = '75002',
    'expired order keeps postal_code for statistics');
  PERFORM pg_temp.ok(v_row.shipping_address->>'line1' IS NULL,
    'expired order drops the street address');

  -- * Accounting fields must survive anonymisation on both rows.
  PERFORM pg_temp.ok(v_row.total = 100 AND v_row.order_number = 'TEST-RGPD-EXPIRE',
    'expired order keeps amounts and order_number (invoice PDF is keyed on it)');

  IF v_product_id IS NOT NULL THEN
    PERFORM pg_temp.ok(
      (SELECT flocking_name FROM order_items WHERE order_id = v_keep_id) = 'DUPONT',
      'in-window order keeps its flocking name');
    PERFORM pg_temp.ok(
      (SELECT flocking_name FROM order_items WHERE order_id = v_expire_id) IS NULL,
      'expired order has its flocking name wiped');
  ELSE
    RAISE NOTICE 'skip — no product row available for order_items assertions';
  END IF;

  -- * Second run changes nothing.
  PERFORM pg_temp.ok(public.rgpd_anonymise_orders(v_email) = 0,
    're-running over the same customer anonymises nothing (idempotent)');
END
$t2$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The accounting floor.
--
--    art. L123-22 C. com. keeps accounting records 10 years from the CLOSE OF THE
--    FINANCIAL YEAR, not from the order date. For an order delivered in January the
--    obligation therefore runs almost 11 years past delivery.
--
--    These assertions record, deliberately, that the 3-year window is far SHORTER
--    than that. This is not a bug: the orders row is not the pièce justificative —
--    the invoice PDF in the `invoices` bucket is, and it is addressed as
--    `<year>/<order_number>.pdf`, a key anonymisation preserves. The row only ever
--    loses buyer identity; amounts, dates, items and order_number all survive.
--
-- !  The corollary is a real operational dependency: an order that reaches a
-- !  terminal state WITHOUT an invoice PDF ever having been generated loses its
-- !  only record of buyer identity when it is anonymised. Invoices are generated
-- !  lazily, on demand, so that case is reachable. Guard it operationally.
-- ─────────────────────────────────────────────────────────────────────────────
DO $t3$
DECLARE
  v_delivered   timestamptz := make_timestamptz(2026, 1, 15, 12, 0, 0);
  v_fy_close    timestamptz;
  v_acct_until  timestamptz;
  v_anon_at     timestamptz;
BEGIN
  v_fy_close   := date_trunc('year', v_delivered) + interval '1 year' - interval '1 day';
  v_acct_until := v_fy_close + interval '10 years';
  v_anon_at    := v_delivered + public.rgpd_order_retention_window();

  PERFORM pg_temp.ok(v_anon_at < v_acct_until,
    'the row is anonymised well before the 10-year accounting obligation ends — '
    'so the invoice PDF, not the row, is the piece justificative');

  PERFORM pg_temp.ok(v_acct_until - v_delivered > interval '10 years',
    'accounting obligation runs >10y past delivery because it starts at financial year close');

  PERFORM pg_temp.ok(public.rgpd_order_retention_window() = interval '3 years',
    'retention window is 3 years (must match the period published on /confidentialite)');
END
$t3$;

ROLLBACK;
