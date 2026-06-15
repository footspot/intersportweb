-- * Promo code scope — turn club_id from branding-only into an actual
-- * redemption restriction, and add product-pack scoping.
-- *
-- * Until now club_id was metadata: a code could be spent by anyone on any
-- * cart. Client request (2026-06-15): admins want to LINK a code to a club
-- * (the code only discounts that club's products) or to a hand-picked product
-- * pack (which, by construction, belongs to a single club).
-- *
-- * Because the storefront is guest-only (no member login), "belongs to club X"
-- * can only be enforced through the products in the cart — so both scopes are
-- * product-based:
-- *   - scope = 'club'     → discount applies to lines whose product is in club_id
-- *   - scope = 'products' → discount applies to lines in scope_product_ids
-- *
-- * A product pack is always SINGLE-CLUB (enforced in admin-promo-codes); the
-- * resolved club is stored in club_id so the fund debit + PDF branding work the
-- * same way for both scoped kinds.

DO $$ BEGIN
  CREATE TYPE promo_scope AS ENUM ('global', 'club', 'products');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS scope             promo_scope NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS scope_product_ids uuid[]      NOT NULL DEFAULT '{}';

-- * Invariants: a scoped code must carry the club it targets; a product pack
-- * must additionally list at least one product. 'global' keeps the legacy
-- * behaviour (club_id, if any, stays pure branding).
ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_scope_chk;
ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_scope_chk CHECK (
    scope = 'global'
    OR (scope = 'club'     AND club_id IS NOT NULL)
    OR (scope = 'products' AND club_id IS NOT NULL AND array_length(scope_product_ids, 1) >= 1)
  );

COMMENT ON COLUMN public.promo_codes.scope IS
  'global = any cart (legacy); club = only the club_id club''s products; products = only scope_product_ids. Eligible subtotal = sum of matching cart lines; discount = min(amount, eligible).';
COMMENT ON COLUMN public.promo_codes.scope_product_ids IS
  'Product pack for scope=products. All products belong to club_id (single-club, enforced in admin-promo-codes). Empty for other scopes.';
