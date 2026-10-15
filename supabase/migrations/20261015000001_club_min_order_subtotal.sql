-- * Per-club exception to the shop-wide minimum order amount.
-- *
-- * site_settings.min_order_subtotal (20260827000001) stays the default floor for
-- * the whole shop. This column is an OPTIONAL override for one club, used to
-- * give a club a commercial advantage (a lower floor) without touching the
-- * shop-wide rule.
-- *
-- *   NULL  → this club follows the shop-wide minimum. This is the default and
-- *           what every existing club keeps.
-- *   0     → no minimum at all for this club.
-- *   > 0   → this club's own floor, which may be lower OR higher than the
-- *           shop-wide one. It is a plain override, not a discount.
-- *
-- * ! Mixed-club carts deliberately fall back to the shop-wide minimum: the
-- * ! exception only applies when EVERY line in the cart belongs to that one
-- * ! club. Otherwise a 2 € item from an exempted club would lower the floor for
-- * ! a basket that is otherwise someone else's products (client decision
-- * ! 2026-10-15). The rule lives in create-order and is mirrored by
-- * ! app/composables/useMinOrder.ts — change both together.
-- *
-- * Measured against the GOODS SUBTOTAL, exactly like the shop-wide floor:
-- * articles only, before shipping, promo code and prepaid credit.

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS min_order_subtotal NUMERIC(10,2)
    CHECK (min_order_subtotal IS NULL OR min_order_subtotal >= 0);

COMMENT ON COLUMN public.clubs.min_order_subtotal IS
  'Optional per-club override of site_settings.min_order_subtotal. NULL = follow the shop-wide minimum; 0 = no minimum for this club. Only applied to single-club carts.';
