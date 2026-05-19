-- * Bundle rework: bundles are composed of real products, not free-text lists.
-- *
-- * Key changes:
-- *   - Drop `pack_contents` (was free-text) and `secondary_size_label` from products.
-- *   - Drop `product_variants.secondary_size` (variants are single-axis again).
-- *   - New `bundle_components` table: links bundle product → component product + axis.
-- *   - New `order_item_components` table: snapshots which variants were consumed.
-- *   - New `notifications` table (UI deferred; backend starts writing rows now).
-- *   - `notify_backoffice` helper RPC emits to every active admin/employee.
-- *   - `process_paid_order` + `refund_order_lines` rewritten to cascade for bundles.
-- *
-- * Destructive: any existing `is_pack = true` rows are removed (app is in dev).

-- 1. Wipe legacy bundle data
DELETE FROM products WHERE is_pack = true;

-- 2. Drop legacy pack columns
ALTER TABLE products
  DROP COLUMN IF EXISTS pack_contents,
  DROP COLUMN IF EXISTS secondary_size_label;

-- 3. Simplify variants (drop secondary_size; restore single-axis unique constraint)
DROP INDEX IF EXISTS product_variants_product_sizes_idx;
ALTER TABLE product_variants DROP COLUMN IF EXISTS secondary_size;
ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_product_id_size_key UNIQUE (product_id, size);

-- 4. order_items: variant_id nullable (bundles have no single resolved variant)
ALTER TABLE order_items ALTER COLUMN variant_id DROP NOT NULL;
-- * Keep order_items.secondary_size as the customer's bundle pick (display snapshot).

-- 5. Bundle axis enum
DO $$ BEGIN
  CREATE TYPE bundle_axis AS ENUM ('primary', 'secondary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. bundle_components — which component feeds which axis of which bundle
CREATE TABLE IF NOT EXISTS bundle_components (
  bundle_product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  axis                 bundle_axis NOT NULL,
  quantity             INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bundle_product_id, component_product_id),
  CONSTRAINT no_self_bundle CHECK (bundle_product_id <> component_product_id)
);
CREATE INDEX IF NOT EXISTS idx_bundle_components_component ON bundle_components(component_product_id);

ALTER TABLE bundle_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone reads bundle components" ON bundle_components;
CREATE POLICY "anyone reads bundle components" ON bundle_components
  FOR SELECT TO anon, authenticated USING (true);

-- 7. order_item_components — which variants were consumed for each bundle sale
CREATE TABLE IF NOT EXISTS order_item_components (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id               UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  component_product_id        UUID NOT NULL REFERENCES products(id),
  component_variant_id        UUID NOT NULL REFERENCES product_variants(id),
  axis                        bundle_axis NOT NULL,
  quantity_per_unit           INT NOT NULL CHECK (quantity_per_unit > 0),
  unit_buying_price_snapshot  NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oic_item    ON order_item_components(order_item_id);
CREATE INDEX IF NOT EXISTS idx_oic_variant ON order_item_components(component_variant_id);

ALTER TABLE order_item_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backoffice reads order components" ON order_item_components;
CREATE POLICY "backoffice reads order components" ON order_item_components
  FOR SELECT TO authenticated
  USING (public.is_backoffice() OR EXISTS (
    SELECT 1 FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = order_item_components.order_item_id
       AND o.user_id = auth.uid()
  ));

-- 8. Notifications (UI built later; events start writing now)
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read_at, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own notifications"  ON notifications;
DROP POLICY IF EXISTS "users mark own notifications"  ON notifications;
CREATE POLICY "users read own notifications" ON notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users mark own notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 9. notify_backoffice — emits one row per active admin/employee
CREATE OR REPLACE FUNCTION public.notify_backoffice(p_kind TEXT, p_payload JSONB)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO notifications (user_id, kind, payload)
  SELECT id, p_kind, p_payload
    FROM profiles
   WHERE role IN ('admin', 'employee') AND active = true;
$$;
REVOKE ALL ON FUNCTION public.notify_backoffice(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_backoffice(TEXT, JSONB) TO service_role;

-- 10. process_paid_order — extended for bundle cascade
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
  v_club_id      UUID;
  v_order_number TEXT;
  v_oos_comp_ids UUID[];
BEGIN
  SELECT club_id, order_number INTO v_club_id, v_order_number
    FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity,
           oi.unit_price_paid, oi.fund_credit_snapshot,
           p.is_pack, p.name->>'fr' AS product_name
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

-- 11. refund_order_lines — restock bundle components when p_restock is true
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
           oi.unit_price_paid, oi.fund_credit_snapshot, oi.status,
           p.is_pack
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
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
