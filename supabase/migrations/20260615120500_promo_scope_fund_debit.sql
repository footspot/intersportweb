-- * process_paid_order — make the club-absorbed promo debit scope-aware.
-- *
-- * Before: a 'club'-absorbed promo debited the FULL promo amount to the
-- * ORDER's club, and only on single-club orders (v_club_id NOT NULL) — so a
-- * scoped voucher on a mixed cart silently charged nobody.
-- *
-- * Now that a promo can be linked to a specific club / product pack
-- * (promo_codes.scope), the debit targets the PROMO's own club and uses the
-- * actual discount applied to the order (orders.promo_discount, already capped
-- * at the eligible subtotal by create-order). This also fixes the multi-club
-- * gap: a scoped promo always knows its club, even when orders.club_id is NULL.
-- *
-- * Only the trailing promo block changes; the per-item stock/fund loop is
-- * copied verbatim from the live definition.

CREATE OR REPLACE FUNCTION public.process_paid_order(p_order_id uuid)
RETURNS TABLE(
  item_id uuid,
  product_id uuid,
  variant_id uuid,
  quantity integer,
  out_of_stock boolean,
  refund_amount numeric,
  fund_credit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item            RECORD;
  v_comp            RECORD;
  v_affected        INT;
  v_any_ok          BOOLEAN := false;
  v_any_oos         BOOLEAN := false;
  v_refund_total    NUMERIC(10,2) := 0;
  v_club_id         UUID;
  v_order_number    TEXT;
  v_oos_comp_ids    UUID[];
  v_product_total   INT;
  v_promo           RECORD;
  v_promo_club      UUID;
  v_promo_discount  NUMERIC(10,2);
BEGIN
  SELECT club_id, order_number, promo_discount
    INTO v_club_id, v_order_number, v_promo_discount
    FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity,
           oi.unit_price_paid, oi.fund_credit_snapshot,
           p.is_pack, p.name->>'fr' AS product_name,
           p.reference AS product_reference,
           p.available_from,
           p.club_id AS item_club_id
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = p_order_id
     ORDER BY oi.id
  LOOP
    IF v_item.is_pack THEN
      v_oos_comp_ids := ARRAY[]::UUID[];

      FOR v_comp IN
        SELECT oic.component_variant_id, oic.quantity_per_unit
          FROM order_item_components oic
         WHERE oic.order_item_id = v_item.id
      LOOP
        UPDATE product_variants pv
           SET stock = stock - (v_comp.quantity_per_unit * v_item.quantity)
         WHERE pv.id = v_comp.component_variant_id
           AND pv.stock >= (v_comp.quantity_per_unit * v_item.quantity);
        GET DIAGNOSTICS v_affected = ROW_COUNT;
        IF v_affected = 0 THEN
          v_oos_comp_ids := array_append(v_oos_comp_ids, v_comp.component_variant_id);
        END IF;
      END LOOP;

      IF array_length(v_oos_comp_ids, 1) > 0 THEN
        FOR v_comp IN
          SELECT oic.component_variant_id, oic.quantity_per_unit
            FROM order_item_components oic
           WHERE oic.order_item_id = v_item.id
             AND oic.component_variant_id <> ALL(v_oos_comp_ids)
        LOOP
          UPDATE product_variants pv
             SET stock = stock + (v_comp.quantity_per_unit * v_item.quantity)
           WHERE pv.id = v_comp.component_variant_id;
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

    ELSIF v_item.available_from IS NOT NULL THEN
      UPDATE product_variants pv
         SET stock = stock - v_item.quantity
       WHERE pv.id = v_item.variant_id;

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

    ELSE
      UPDATE product_variants pv
         SET stock = stock - v_item.quantity
       WHERE pv.id = v_item.variant_id
         AND pv.stock >= v_item.quantity;
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

    IF NOT v_item.is_pack THEN
      SELECT COALESCE(SUM(pv.stock), 0) INTO v_product_total
        FROM product_variants pv
       WHERE pv.product_id = v_item.product_id;

      IF v_product_total < 50 AND NOT EXISTS (
        SELECT 1 FROM notifications n
         WHERE n.kind = 'low_stock'
           AND n.payload->>'product_id' = v_item.product_id::text
           AND n.read_at IS NULL
      ) THEN
        PERFORM notify_backoffice(
          'low_stock',
          jsonb_build_object(
            'product_id', v_item.product_id,
            'product_name', v_item.product_name,
            'product_reference', v_item.product_reference,
            'current_stock', v_product_total,
            'detected_at', now()
          )
        );
      END IF;
    END IF;
  END LOOP;

  -- * Club-absorbed promo → debit the discount back to the club's fund.
  -- *   Intersport-absorbed promos never touch the fund. The target club and the
  -- *   amount are now scope-aware:
  -- *     - scoped (club/products): pc.club_id (always set) + the order's
  -- *       promo_discount (already capped at the eligible subtotal). Works even
  -- *       on multi-club orders.
  -- *     - global: fall back to the order-level club; skipped when NULL
  -- *       (multi-club global promo has no single club to charge — legacy).
  SELECT pc.id, pc.code, pc.absorbs_by, pc.scope, pc.club_id AS promo_club_id
    INTO v_promo
    FROM promo_codes pc
    JOIN orders o ON o.promo_code_id = pc.id
   WHERE o.id = p_order_id
     AND pc.used_by_order_id = p_order_id;

  IF v_promo.id IS NOT NULL AND v_promo.absorbs_by = 'club' AND v_any_ok THEN
    v_promo_club := CASE WHEN v_promo.scope = 'global' THEN v_club_id ELSE v_promo.promo_club_id END;
    IF v_promo_club IS NOT NULL AND COALESCE(v_promo_discount, 0) > 0 THEN
      INSERT INTO fund_transactions(club_id, type, amount, reason, reference)
      VALUES (
        v_promo_club,
        'promo_absorbed',
        -v_promo_discount,
        'promo: ' || v_promo.code,
        v_order_number
      );
    END IF;
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.process_paid_order(UUID) FROM PUBLIC;
