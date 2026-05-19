-- * Phase 9 — Delivery methods schema.
-- * Three independent delivery paths, each toggleable per club:
-- *   - colissimo     : La Poste carrier, paid shipping, label auto-generated
-- *   - club_pickup   : Intersport truck delivers to the club, customer collects
-- *   - shop_pickup   : Intersport truck delivers to a chosen Intersport shop
-- *
-- * Club pickups don't have a destination row (the buyer's club acts as it),
-- * but shop pickups need a dedicated table (`intersport_shops`) listing every
-- * physical store that can act as a pickup point.

-- =========================================================================
-- * 1. order_status enum extension — pickup terminal states
-- =========================================================================
-- * `awaiting_pickup` = parcel sat at club/shop, customer notified.
-- * `picked_up`       = terminal state once the customer collects it.

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_pickup' AFTER 'shipped';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'picked_up'       AFTER 'awaiting_pickup';

-- =========================================================================
-- * 2. delivery_method enum + orders columns
-- =========================================================================

CREATE TYPE public.delivery_method AS ENUM ('colissimo', 'club_pickup', 'shop_pickup');

-- * Existing rows predate the enum and all shipped via Colissimo — default
-- * is safe. NOT NULL once defaulted.
ALTER TABLE public.orders
  ADD COLUMN delivery_method       delivery_method NOT NULL DEFAULT 'colissimo',
  ADD COLUMN pickup_shop_id        UUID,
  ADD COLUMN ready_for_pickup_at   TIMESTAMPTZ,
  ADD COLUMN picked_up_at          TIMESTAMPTZ;

-- =========================================================================
-- * 3. intersport_shops — physical pickup points
-- =========================================================================
-- * Admin-managed list. Each shop is offerable as a `shop_pickup` destination
-- * on every club page that has `delivery_shop_pickup_enabled = true`.

CREATE TABLE public.intersport_shops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  city        TEXT NOT NULL,
  phone       TEXT,
  -- * Free-form opening-hours blob (e.g. `{ "mon": "10:00-19:00", … }`).
  hours       JSONB,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_intersport_shops_active ON public.intersport_shops(is_active, sort_order);

ALTER TABLE public.intersport_shops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public reads shops" ON public.intersport_shops
  FOR SELECT USING (is_active = true);

CREATE POLICY "backoffice reads shops" ON public.intersport_shops
  FOR SELECT USING (public.is_backoffice());

CREATE POLICY "admin writes shops" ON public.intersport_shops
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- * Now the FK can resolve.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_shop_fk
  FOREIGN KEY (pickup_shop_id) REFERENCES public.intersport_shops(id);

-- * Integrity: pickup_shop_id is set iff delivery_method='shop_pickup'.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_shop_check
  CHECK (
    (delivery_method = 'shop_pickup' AND pickup_shop_id IS NOT NULL)
    OR
    (delivery_method <> 'shop_pickup' AND pickup_shop_id IS NULL)
  );

-- =========================================================================
-- * 4. clubs — per-club delivery toggles
-- =========================================================================
-- * Each club page decides which of the three methods to offer. Existing
-- * clubs default to colissimo only (preserves pre-pickup behavior).

ALTER TABLE public.clubs
  ADD COLUMN delivery_colissimo_enabled   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN delivery_club_pickup_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN delivery_shop_pickup_enabled BOOLEAN NOT NULL DEFAULT false;

-- * At least one method must be enabled or the club page can't sell anything.
ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_at_least_one_delivery
  CHECK (
    delivery_colissimo_enabled
    OR delivery_club_pickup_enabled
    OR delivery_shop_pickup_enabled
  );

CREATE INDEX idx_orders_delivery_method ON public.orders(delivery_method, status);
CREATE INDEX idx_orders_pickup_shop     ON public.orders(pickup_shop_id) WHERE pickup_shop_id IS NOT NULL;
