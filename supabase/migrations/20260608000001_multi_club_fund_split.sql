-- * Multi-club orders: credit each club's fund from its own order_items.
-- *
-- * Background: a cart may now span several clubs in a single order (create-order
-- * no longer rejects mixed-club carts). For such orders orders.club_id is NULL,
-- * so the fund RPCs can no longer read the club off the order row — they must
-- * resolve the club PER ITEM from products.club_id. Both functions already JOIN
-- * products, so this is a localised change: swap the order-level v_club_id for a
-- * per-line item club.
-- *
-- * Single-club orders are unaffected (every line resolves to the same club).

-- 1. process_paid_order — fund credit keyed to each item's product club.
DROP FUNCTION IF EXISTS public.process_paid_order(UUID);

CREATE FUNCTION public.process_paid_order(p_order_id UUID)
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
  v_item         RECORD;
  v_comp         RECORD;
  v_affected     INT;
  v_any_ok       BOOLEAN := false;
  v_any_oos      BOOLEAN := false;
  v_refund_total NUMERIC(10,2) := 0;
  v_order_number TEXT;
  v_oos_comp_ids UUID[];
BEGIN
  -- * Lock the order; club is now resolved per item, not off the order row.
  SELECT order_number INTO v_order_number
    FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity,
           oi.unit_price_paid, oi.fund_credit_snapshot,
           p.is_pack, p.club_id AS item_club_id, p.name->>'fr' AS product_name
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = p_order_id
     ORDER BY oi.id
  LOOP
    IF v_item.is_pack THEN
      -- * Bundle: attempt decrement on every component; if any OOS, whole bundle refunds.
      v_oos_comp_ids := ARRAY[]::UUID[];

      FOR v_comp IN
        SELECT oic.component_variant_id, oic.quantity_per_unit
          FROM order_item_components oic
         WHERE oic.order_item_id = v_item.id
      LOOP
        UPDATE product_variants
           SET stock = stock - (v_comp.quantity_per_unit * v_item.quantity)
         WHERE id = v_comp.component_variant_id
           AND stock >= (v_comp.quantity_per_unit * v_item.quantity);
        GET DIAGNOSTICS v_affected = ROW_COUNT;
        IF v_affected = 0 THEN
          v_oos_comp_ids := array_append(v_oos_comp_ids, v_comp.component_variant_id);
        END IF;
      END LOOP;

      IF array_length(v_oos_comp_ids, 1) > 0 THEN
        -- Roll back successful component decrements for this bundle line
        FOR v_comp IN
          SELECT oic.component_variant_id, oic.quantity_per_unit
            FROM order_item_components oic
           WHERE oic.order_item_id = v_item.id
             AND oic.component_variant_id <> ALL(v_oos_comp_ids)
        LOOP
          UPDATE product_variants
             SET stock = stock + (v_comp.quantity_per_unit * v_item.quantity)
           WHERE id = v_comp.component_variant_id;
        END LOOP;

        v_any_oos := true;
        UPDATE order_items SET status = 'refunded_oos' WHERE id = v_item.id;
        v_refund_total := v_refund_total + (v_item.unit_price_paid * v_item.quantity);

        PERFORM notify_backoffice(
          'bundle_component_oos_at_sale',
          jsonb_build_object(
            'order_id', p_order_id,
            'order_number', v_order_number,
            'bundle_id', v_item.product_id,
            'bundle_name', v_item.product_name,
            'oos_component_ids', to_jsonb(v_oos_comp_ids)
          )
        );

        item_id        := v_item.id;
        product_id     := v_item.product_id;
        variant_id     := v_item.variant_id;
        quantity       := v_item.quantity;
        out_of_stock   := true;
        refund_amount  := v_item.unit_price_paid * v_item.quantity;
        fund_credit    := 0;
        RETURN NEXT;
      ELSE
        v_any_ok := true;
        INSERT INTO fund_transactions(club_id, type, amount, reason, reference, order_item_id)
        VALUES (v_item.item_club_id, 'auto_sale', v_item.fund_credit_snapshot * v_item.quantity,
                'sale', v_order_number, v_item.id);
        item_id        := v_item.id;
        product_id     := v_item.product_id;
        variant_id     := v_item.variant_id;
        quantity       := v_item.quantity;
        out_of_stock   := false;
        refund_amount  := 0;
        fund_credit    := v_item.fund_credit_snapshot * v_item.quantity;
        RETURN NEXT;
      END IF;
    ELSE
      -- * Non-bundle: original flow.
      UPDATE product_variants
         SET stock = stock - v_item.quantity
       WHERE id = v_item.variant_id
         AND stock >= v_item.quantity;
      GET DIAGNOSTICS v_affected = ROW_COUNT;

      IF v_affected = 0 THEN
        v_any_oos := true;
        UPDATE order_items SET status = 'refunded_oos' WHERE id = v_item.id;
        v_refund_total := v_refund_total + (v_item.unit_price_paid * v_item.quantity);

        item_id        := v_item.id;
        product_id     := v_item.product_id;
        variant_id     := v_item.variant_id;
        quantity       := v_item.quantity;
        out_of_stock   := true;
        refund_amount  := v_item.unit_price_paid * v_item.quantity;
        fund_credit    := 0;
        RETURN NEXT;
      ELSE
        v_any_ok := true;
        INSERT INTO fund_transactions(club_id, type, amount, reason, reference, order_item_id)
        VALUES (v_item.item_club_id, 'auto_sale', v_item.fund_credit_snapshot * v_item.quantity,
                'sale', v_order_number, v_item.id);
        item_id        := v_item.id;
        product_id     := v_item.product_id;
        variant_id     := v_item.variant_id;
        quantity       := v_item.quantity;
        out_of_stock   := false;
        refund_amount  := 0;
        fund_credit    := v_item.fund_credit_snapshot * v_item.quantity;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  UPDATE orders
     SET status = CASE
       WHEN v_any_oos AND NOT v_any_ok THEN 'cancelled'::order_status
       WHEN v_any_oos AND v_any_ok     THEN 'partially_refunded'::order_status
       ELSE 'paid'::order_status
     END,
     paid_at      = COALESCE(paid_at, now()),
     refund_total = v_refund_total
   WHERE id = p_order_id;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.process_paid_order(UUID) FROM PUBLIC;

-- 2. refund_order_lines — fund reversal keyed to each item's product club.
DROP FUNCTION IF EXISTS public.refund_order_lines(UUID, UUID[], BOOLEAN, UUID);

CREATE FUNCTION public.refund_order_lines(
  p_order_id UUID,
  p_item_ids UUID[],
  p_restock  BOOLEAN DEFAULT false,
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
  v_item  RECORD;
  v_order RECORD;
  v_total NUMERIC(10,2) := 0;
BEGIN
  SELECT id, order_number, status, refund_total
    INTO v_order
    FROM orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity,
           oi.unit_price_paid, oi.fund_credit_snapshot, oi.status,
           p.is_pack, p.club_id AS item_club_id
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = p_order_id
       AND oi.id = ANY(p_item_ids)
       AND oi.status <> 'refunded_oos'
  LOOP
    v_total := v_total + (v_item.unit_price_paid * v_item.quantity);

    INSERT INTO fund_transactions(club_id, type, amount, reason, reference, order_item_id, created_by)
    VALUES (
      v_item.item_club_id,
      'refund_reversal',
      -(v_item.fund_credit_snapshot * v_item.quantity),
      'manual refund',
      v_order.order_number,
      v_item.id,
      p_actor_id
    );

    IF p_restock THEN
      IF v_item.is_pack THEN
        UPDATE product_variants pv
           SET stock = stock + (oic.quantity_per_unit * v_item.quantity)
          FROM order_item_components oic
         WHERE oic.order_item_id = v_item.id
           AND pv.id = oic.component_variant_id;
      ELSE
        UPDATE product_variants
           SET stock = stock + v_item.quantity
         WHERE id = v_item.variant_id;
      END IF;
    END IF;

    UPDATE order_items SET status = 'refunded_oos' WHERE id = v_item.id;

    item_id       := v_item.id;
    refund_amount := v_item.unit_price_paid * v_item.quantity;
    fund_reversal := -(v_item.fund_credit_snapshot * v_item.quantity);
    RETURN NEXT;
  END LOOP;

  UPDATE orders
     SET refund_total = COALESCE(refund_total, 0) + v_total,
         status = CASE
           WHEN (SELECT COUNT(*) FROM order_items oi
                  WHERE oi.order_id = p_order_id AND oi.status = 'ok') = 0
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
