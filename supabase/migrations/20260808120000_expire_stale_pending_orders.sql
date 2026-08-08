-- * Auto-expire stale pending orders.
-- *
-- * A 'pending' row is inserted at checkout submit, BEFORE the SystemPay
-- * paywall is shown (create-order). When the customer abandons the payment
-- * form, Lyra sends no IPN, so the row stays 'pending' forever and piles up
-- * in the back-office order list. Redoing checkout after a full page leave
-- * also mints a fresh idempotency key, hence the visible duplicates.
-- *
-- * Expiring flips 'pending' → 'abandoned' — a pure status change, like the
-- * IPN UNPAID path: a pending order holds no reservation (stock decrement,
-- * promo claim and prepaid consumption all happen at IPN time via
-- * process_paid_order). 'abandoned' falls through tg_orders_status_changed's
-- * CASE to ELSE NULL, so expiries never dispatch to Footspot.
-- *
-- * The 24h threshold is far beyond any Lyra form-token lifetime, so a PAID
-- * IPN can never arrive for an order this job has expired. Belt-and-braces,
-- * orders with any payment_events row are skipped anyway.

CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    UPDATE orders o
       SET status = 'abandoned'
     WHERE o.status = 'pending'
       AND o.created_at < now() - INTERVAL '24 hours'
       AND NOT EXISTS (SELECT 1 FROM payment_events pe WHERE pe.order_id = o.id)
     RETURNING o.id
  )
  -- * Audit trail: one synthetic event per expired order, so an auto-expiry
  -- * is distinguishable from an IPN UNPAID cancellation in the drawer.
  INSERT INTO payment_events (provider, event_id, order_id, event_type)
  SELECT 'system', 'auto_expire:' || e.id, e.id, 'AUTO_EXPIRED'
    FROM expired e
  ON CONFLICT (provider, event_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- * Hourly. Pure SQL, so the job calls the function directly — no edge
-- * function / net.http_post hop like the Colissimo & Footspot workers need.
-- * cron.schedule with an existing jobname is an UPSERT — safe to re-apply.
SELECT cron.schedule(
  'expire_stale_pending_orders',
  '30 * * * *',
  $cmd$ SELECT public.expire_stale_pending_orders(); $cmd$
);

-- * Clean the existing backlog immediately.
SELECT public.expire_stale_pending_orders();
