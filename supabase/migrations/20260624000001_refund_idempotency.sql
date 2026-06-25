-- * R3 fix — make manual refunds idempotent against concurrent / retried calls.
-- *
-- * A double refund (to the customer via Lyra and/or to the club fund) is
-- * financially inadmissible. The fund reversal in refund_order_lines is already
-- * safe (it locks the order FOR UPDATE and skips lines already 'refunded_oos'),
-- * and refund-order returns early on a sequential retry. The remaining window
-- * is two *simultaneous* in-flight requests that both read status = 'ok' and
-- * both reach the Lyra CancelOrRefund call before either commits — refunding
-- * the customer twice.
-- *
-- * We close it with an atomic per-line claim taken BEFORE the processor call:
-- * begin_refund_lines flips eligible lines' refund_started_at under the order
-- * lock and returns only the rows it actually claimed. A concurrent or repeated
-- * call claims zero rows and must not proceed to Lyra. cancel_refund_lines
-- * releases the claim if the processor refund fails so a corrected retry works.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS refund_started_at timestamptz;

-- * Atomically claim the eligible lines (status 'ok', not already claimed).
CREATE OR REPLACE FUNCTION public.begin_refund_lines(
  p_order_id uuid,
  p_item_ids uuid[]
)
RETURNS TABLE(item_id uuid, unit_price_paid numeric, quantity integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM 1 FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  RETURN QUERY
  UPDATE order_items oi
     SET refund_started_at = now()
   WHERE oi.order_id = p_order_id
     AND oi.id = ANY(p_item_ids)
     AND oi.status = 'ok'
     AND oi.refund_started_at IS NULL
  RETURNING oi.id, oi.unit_price_paid, oi.quantity;
END;
$$;

-- * Release a claim when the processor refund fails (only still-unprocessed
-- * 'ok' lines), so a corrected retry can re-claim the same lines.
CREATE OR REPLACE FUNCTION public.cancel_refund_lines(
  p_order_id uuid,
  p_item_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE order_items
     SET refund_started_at = NULL
   WHERE order_id = p_order_id
     AND id = ANY(p_item_ids)
     AND status = 'ok';
END;
$$;
