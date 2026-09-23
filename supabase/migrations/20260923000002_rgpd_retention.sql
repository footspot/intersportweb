-- * RGPD art. 5.1.e (limitation de la conservation) — purge + anonymisation.
-- *
-- * Nothing was ever deleted before this: contact messages kept the sender's IP
-- * forever and orders kept full buyer identity indefinitely. Retention periods
-- * below were confirmed by the client on 2026-09-23 and are mirrored, in plain
-- * French, in /confidentialite — if you change an interval here, change it there
-- * in the same commit or the published policy becomes a lie.
-- *
-- * Accounting safety: the invoice PDF is rendered by generate-invoice and stored
-- * in the `invoices` bucket (orders.invoice_path). Anonymising the orders ROW
-- * therefore does NOT destroy the pièce justificative required for 10 years by
-- * art. L123-22 C. com. — the document itself is untouched by these jobs.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Contact messages — IP after 6 months, whole message after 1 year.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rgpd_purge_contact_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  -- * The IP is only ever used to rate-limit the contact form; past 6 months it
  -- * has no purpose and becomes plain surveillance data.
  UPDATE contact_messages
     SET ip = NULL
   WHERE ip IS NOT NULL
     AND created_at < now() - INTERVAL '6 months';

  DELETE FROM contact_messages
   WHERE created_at < now() - INTERVAL '1 year';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Orders — anonymise buyer identity 3 years after the order reached a
--    terminal state. Amounts, items and dates stay for accounting.
-- ─────────────────────────────────────────────────────────────────────────────
-- ! guest_email is pseudonymised, never NULLed: `orders_guest_email_check`
-- !   CHECK (guest_email IS NOT NULL)
-- ! so nulling it raises a check violation on every guest order and the whole
-- ! job aborts. (There is no `user_id` column on orders and no `orders_identity_chk`
-- ! — an earlier version of this comment claimed both; it was wrong.)
-- ! We write an undeliverable RFC 2606 `.invalid` address built from
-- ! the order NUMBER — not from a hash of the real e-mail, which would still be
-- ! linkable by brute force over a known address list and so would not be
-- ! anonymisation at all (CNIL: pseudonymised data is still personal data).
-- ! SUPERSEDED by 20260923000004_rgpd_retention_single_window.sql, which moves this
-- ! body into rgpd_anonymise_orders(p_email) so the erasure endpoint shares one
-- ! definition of the window. Edit the window THERE, not here.
CREATE OR REPLACE FUNCTION public.rgpd_anonymise_old_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH stale AS (
    SELECT id, order_number
      FROM orders
     WHERE status IN ('delivered', 'picked_up', 'cancelled', 'refunded', 'abandoned')
       AND COALESCE(delivered_at, shipped_at, paid_at, created_at)
             < now() - INTERVAL '3 years'
       AND (shipping_address->>'anonymised') IS DISTINCT FROM 'true'
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
  )
  -- * Flocking carries a real person's name / initials / number printed on the
  -- * garment — just as identifying as the delivery address.
  UPDATE order_items oi
     SET flocking_name    = NULL,
         flocking_initial = NULL,
         flocking_number  = NULL
    FROM anonymised a
   WHERE oi.order_id = a.id
     AND (oi.flocking_name IS NOT NULL
          OR oi.flocking_initial IS NOT NULL
          OR oi.flocking_number IS NOT NULL);

  SELECT count(*) INTO v_count
    FROM orders
   WHERE (shipping_address->>'anonymised') = 'true';

  RETURN v_count;
END;
$$;

-- * These touch personal data with definer rights: keep them off the API roles.
REVOKE ALL ON FUNCTION public.rgpd_purge_contact_messages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rgpd_anonymise_old_orders()   FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.rgpd_purge_contact_messages() IS
  'RGPD retention: nulls contact_messages.ip after 6 months, deletes rows after 1 year. Returns rows deleted.';
COMMENT ON FUNCTION public.rgpd_anonymise_old_orders() IS
  'RGPD retention: anonymises buyer identity on terminal orders older than 3 years. Invoice PDFs are untouched. Returns total anonymised orders.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Schedules — pure SQL, so cron calls the functions directly (same pattern
--    as expire_stale_pending_orders). cron.schedule on an existing jobname is
--    an UPSERT, so re-applying this migration is safe.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'rgpd_purge_contact_messages',
  '15 3 * * *',
  $cmd$ SELECT public.rgpd_purge_contact_messages(); $cmd$
);

SELECT cron.schedule(
  'rgpd_anonymise_old_orders',
  '30 3 * * 0',
  $cmd$ SELECT public.rgpd_anonymise_old_orders(); $cmd$
);

-- ! Deliberately NOT run here on the existing backlog. Anonymisation is
-- ! irreversible: run the preview below first, check the number is plausible,
-- ! then call the function manually.
-- !
-- !   SELECT count(*) FROM orders
-- !    WHERE status IN ('delivered','picked_up','cancelled','refunded','abandoned')
-- !      AND COALESCE(delivered_at, shipped_at, paid_at, created_at)
-- !            < now() - INTERVAL '3 years'
-- !      AND (shipping_address->>'anonymised') IS DISTINCT FROM 'true';
