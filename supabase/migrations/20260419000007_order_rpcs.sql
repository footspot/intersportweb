-- * Order processing RPCs (DEVELOPMENT_GUIDE.md §12)
-- * Both functions are SECURITY DEFINER + pinned search_path so auth workers
-- * and edge functions can call them without hitting public/ resolution issues.

-- * process_paid_order: webhook entry point after a successful payment.
-- * Decrements stock atomically per line, flags OOS lines, credits fund.
CREATE OR REPLACE FUNCTION public.process_paid_order(p_order_id UUID)
RETURNS TABLE(
  item_id UUID,
  product_id UUID,
  variant_id UUID,
  quantity INT,
  out_of_stock BOOLEAN,
  refund_amount NUMERIC,
  fund_credit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_affected INT;
  v_any_ok BOOLEAN := false;
  v_any_oos BOOLEAN := false;
  v_refund_total NUMERIC(10,2) := 0;
  v_club_id UUID;
BEGIN
  SELECT club_id INTO v_club_id FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity,
           oi.unit_price_paid, oi.fund_credit_snapshot
      FROM order_items oi
     WHERE oi.order_id = p_order_id
     ORDER BY oi.id
  LOOP
    UPDATE product_variants
       SET stock = stock - v_item.quantity
     WHERE id = v_item.variant_id
       AND stock >= v_item.quantity;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected = 0 THEN
      v_any_oos := true;
      UPDATE order_items SET status = 'refunded_oos' WHERE id = v_item.id;
      v_refund_total := v_refund_total + (v_item.unit_price_paid * v_item.quantity);

      item_id := v_item.id;
      product_id := v_item.product_id;
      variant_id := v_item.variant_id;
      quantity := v_item.quantity;
      out_of_stock := true;
      refund_amount := v_item.unit_price_paid * v_item.quantity;
      fund_credit := 0;
      RETURN NEXT;
    ELSE
      v_any_ok := true;
      INSERT INTO fund_transactions(club_id, type, amount, reason, reference, order_item_id)
      VALUES (
        v_club_id,
        'auto_sale',
        v_item.fund_credit_snapshot * v_item.quantity,
        'sale',
        (SELECT order_number FROM orders WHERE id = p_order_id),
        v_item.id
      );

      item_id := v_item.id;
      product_id := v_item.product_id;
      variant_id := v_item.variant_id;
      quantity := v_item.quantity;
      out_of_stock := false;
      refund_amount := 0;
      fund_credit := v_item.fund_credit_snapshot * v_item.quantity;
      RETURN NEXT;
    END IF;
  END LOOP;

  UPDATE orders
     SET status = CASE
       WHEN v_any_oos AND NOT v_any_ok THEN 'cancelled'::order_status
       WHEN v_any_oos AND v_any_ok     THEN 'partially_refunded'::order_status
       ELSE 'paid'::order_status
     END,
     paid_at = COALESCE(paid_at, now()),
     refund_total = v_refund_total
   WHERE id = p_order_id;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.process_paid_order(UUID) FROM PUBLIC;

-- * refund_order_lines: manual back-office refund. Reverses fund, optionally
-- * restocks, and bumps orders.refund_total. Does NOT call the payment
-- * processor — that's the edge function's job.
CREATE OR REPLACE FUNCTION public.refund_order_lines(
  p_order_id UUID,
  p_item_ids UUID[],
  p_restock BOOLEAN DEFAULT false,
  p_actor_id UUID DEFAULT NULL
) RETURNS TABLE(
  item_id UUID,
  refund_amount NUMERIC,
  fund_reversal NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_total NUMERIC(10,2) := 0;
BEGIN
  SELECT id, club_id, order_number, status, refund_total
    INTO v_order
    FROM orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity,
           oi.unit_price_paid, oi.fund_credit_snapshot, oi.status
      FROM order_items oi
     WHERE oi.order_id = p_order_id
       AND oi.id = ANY(p_item_ids)
       AND oi.status <> 'refunded_oos'
  LOOP
    v_total := v_total + (v_item.unit_price_paid * v_item.quantity);

    INSERT INTO fund_transactions(club_id, type, amount, reason, reference, order_item_id, created_by)
    VALUES (
      v_order.club_id,
      'refund_reversal',
      -(v_item.fund_credit_snapshot * v_item.quantity),
      'manual refund',
      v_order.order_number,
      v_item.id,
      p_actor_id
    );

    IF p_restock THEN
      UPDATE product_variants SET stock = stock + v_item.quantity WHERE id = v_item.variant_id;
    END IF;

    UPDATE order_items SET status = 'refunded_oos' WHERE id = v_item.id;

    item_id := v_item.id;
    refund_amount := v_item.unit_price_paid * v_item.quantity;
    fund_reversal := -(v_item.fund_credit_snapshot * v_item.quantity);
    RETURN NEXT;
  END LOOP;

  UPDATE orders
     SET refund_total = COALESCE(refund_total, 0) + v_total,
         status = CASE
           WHEN (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = p_order_id AND oi.status = 'ok') = 0
             THEN 'refunded'::order_status
           WHEN v_total > 0
             THEN 'partially_refunded'::order_status
           ELSE status
         END
   WHERE id = p_order_id;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_order_lines(UUID, UUID[], BOOLEAN, UUID) FROM PUBLIC;
