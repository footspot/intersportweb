-- * RGPD / consumer law — proof that the buyer accepted the CGV + privacy
-- * policy before paying.
-- *
-- * Code de la consommation L221-14 ("double clic") requires the terms to be
-- * readable and actively accepted before an online order is placed; RGPD
-- * art. 7.1 requires the trader to be ABLE TO DEMONSTRATE that acceptance.
-- * The checkout checkbox is the act; this column is the evidence.
-- *
-- * NULL on every order created before this shipped — absence of proof, not
-- * proof of absence. Do not backfill it: a fabricated timestamp would be
-- * worse than an honest NULL if the acceptance is ever disputed.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

COMMENT ON COLUMN public.orders.terms_accepted_at IS
  'When the buyer ticked the CGV + privacy checkbox at checkout (set by create-order). NULL for orders predating the checkbox — never backfill.';
