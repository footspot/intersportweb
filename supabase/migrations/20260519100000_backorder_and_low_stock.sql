-- * Backorder + low-stock notifications
-- *
-- *   - products.available_from: when set, the product is purchasable even at
-- *     stock=0 (or below); storefront shows a "available from <date>" banner.
-- *   - product_variants.stock CHECK relaxed to allow negative ("units owed").
-- *   - process_paid_order updated to: (a) skip stock-check for backorderable
-- *     products, (b) emit a backoffice notification when the product's total
-- *     stock crosses below 50 units. Dedup: no new notification while an
-- *     unread `low_stock` row exists for the product on any admin.

-- 1. Backorder date column
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS available_from date;

COMMENT ON COLUMN public.products.available_from IS
  'When set, the product is orderable at stock <= 0. Storefront displays "Disponible à partir du <date>". NULL = stock-strict (default).';

-- 2. Allow negative stock for backorder. The original stock >= 0 check is
--    replaced by a softer floor that still rejects nonsense values from
--    bugs (e.g. typos in admin form).
ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_stock_check;

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_stock_min CHECK (stock >= -100000);

-- 3. Rewrite process_paid_order to:
--    a. Allow backorder on non-bundle products (stock can go negative).
--    b. Emit `low_stock` notification when product total stock < 50 and no
--       unread `low_stock` notification exists for that product.
--    Bundle path is unchanged — bundle components still require sufficient
--    stock at sale time; backorder is a per-product property.
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
  v_product_ref     TEXT;
BEGIN
  SELECT club_id, order_number INTO v_club_id, v_order_number
    FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity,
           oi.unit_price_paid, oi.fund_credit_snapshot,
           p.is_pack, p.name->>'fr' AS product_name,
           p.reference AS product_reference,
           p.available_from
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
        VALUES (v_club_id, 'auto_sale', v_item.fund_credit_snapshot * v_item.quantity,
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
      -- * Backorder path: stock may go negative. Never marks OOS.
      UPDATE product_variants
         SET stock = stock - v_item.quantity
       WHERE id = v_item.variant_id;

      v_any_ok := true;
      INSERT INTO fund_transactions(club_id, type, amount, reason, reference, order_item_id)
      VALUES (v_club_id, 'auto_sale', v_item.fund_credit_snapshot * v_item.quantity,
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
      -- * Strict stock path (legacy behavior).
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
        VALUES (v_club_id, 'auto_sale', v_item.fund_credit_snapshot * v_item.quantity,
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

    -- * Low-stock notification: only for non-bundle lines that decremented
    --   successfully (or via backorder). Recompute product total; emit a
    --   bell notification when crossing below 50 and no unread alert exists.
    IF NOT v_item.is_pack THEN
      SELECT COALESCE(SUM(stock), 0) INTO v_product_total
        FROM product_variants
       WHERE product_id = v_item.product_id;

      IF v_product_total < 50 AND NOT EXISTS (
        SELECT 1 FROM notifications
         WHERE kind = 'low_stock'
           AND payload->>'product_id' = v_item.product_id::text
           AND read_at IS NULL
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
