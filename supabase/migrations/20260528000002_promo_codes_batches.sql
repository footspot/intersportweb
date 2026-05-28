-- * Promo code batches — light tracking.
-- *
-- * batch_id groups codes generated together (admin bulk PDF export).
-- * NULL when the code was created via the single-code form.
-- *
-- * club_id is metadata only: it does NOT restrict redemption — the code can
-- * still be used by anyone on any cart — but the admin UI can filter by it
-- * and the PDF cover page picks up that club's logo. Decoupled from
-- * absorbs_by on purpose: admins may want a 'club'-branded voucher whose
-- * cost is still absorbed by Intersport (gift, marketing campaign…).

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS club_id  uuid REFERENCES public.clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS promo_codes_batch_id_idx
  ON public.promo_codes (batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS promo_codes_club_id_idx
  ON public.promo_codes (club_id)
  WHERE club_id IS NOT NULL;

COMMENT ON COLUMN public.promo_codes.batch_id IS
  'Groups codes auto-generated together. Shared validity / amount / note. NULL for single-code creates.';
COMMENT ON COLUMN public.promo_codes.club_id IS
  'Optional metadata link for filtering + PDF branding. Does NOT restrict who can redeem the code.';
