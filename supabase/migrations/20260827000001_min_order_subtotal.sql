-- * Minimum order amount.
-- *  - site_settings.min_order_subtotal is the shop-wide floor a cart must reach
-- *    before checkout is allowed. It is measured against the GOODS SUBTOTAL —
-- *    articles only, before shipping, before promo code and before prepaid
-- *    credit — so a discount code can never push an order under the floor.
-- *  - 0 disables the minimum entirely; the shop ships with 30 € (client
-- *    decision 2026-08-27).
-- *  - Enforced server-side in the create-order edge function; the cart drawer
-- *    and /checkout mirror it so the customer sees it before paying.

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS min_order_subtotal NUMERIC(10,2) NOT NULL DEFAULT 30
    CHECK (min_order_subtotal >= 0);
