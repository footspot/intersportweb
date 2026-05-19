-- * Admin promo codes
-- *
-- *   - Single-use globally: race resolved at payment success via atomic
-- *     UPDATE ... WHERE used_at IS NULL. Loser gets cancelled + refunded.
-- *   - Fixed €amount per code. Optional min_subtotal gate.
-- *   - absorbs_by ('intersport' | 'club') decides whose margin pays for the
-- *     discount — same mental model as products.discount_source.

CREATE TYPE promo_absorbs_by AS ENUM ('intersport', 'club');

ALTER TYPE fund_tx_type ADD VALUE IF NOT EXISTS 'promo_absorbed';

CREATE TABLE public.promo_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL,
  amount           numeric(10,2) NOT NULL CHECK (amount > 0),
  min_subtotal     numeric(10,2),
  absorbs_by       promo_absorbs_by NOT NULL DEFAULT 'intersport',
  valid_from       timestamptz,
  valid_until      timestamptz,
  used_at          timestamptz,
  used_by_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  used_by_email    text,
  note             text,
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until),
  CHECK (min_subtotal IS NULL OR min_subtotal >= amount)
);

CREATE UNIQUE INDEX promo_codes_code_unique ON public.promo_codes (lower(code));
CREATE INDEX promo_codes_active_lookup ON public.promo_codes (lower(code)) WHERE used_at IS NULL;
CREATE INDEX promo_codes_used_by_order ON public.promo_codes (used_by_order_id) WHERE used_by_order_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO service_role;
GRANT SELECT ON public.promo_codes TO authenticated;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin reads promo_codes"
  ON public.promo_codes FOR SELECT
  USING (is_admin());

-- * Orders: attach the claimed promo + snapshot the discount applied.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code_id   uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promo_discount  numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.promo_code_id IS
  'Set at create-order if a promo was applied. Not yet claimed — atomic claim happens at payment success.';
COMMENT ON COLUMN public.orders.promo_discount IS
  'Amount subtracted from the cart total by the applied promo code. 0 when none.';
