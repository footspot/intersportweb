-- * Cagnotte Adjust — Footspot club directors credit/debit their own cagnotte
-- * through the adjust-cagnotte edge function (CAGNOTTE_ADJUST_GUIDE.md).
-- *
-- * Two additive columns on fund_transactions, both nullable so every existing
-- * row and every admin-fund / auto_sale insert is unaffected:
-- *   - idempotency_key : de-dupes a replayed X-Idempotency-Key so a director
-- *     double-submit never double-books a movement. A partial UNIQUE index
-- *     (only WHERE NOT NULL) is the authoritative guard; the function reads it
-- *     back on conflict.
-- *   - source : audit attribution — 'admin' vs 'footspot' — so the admin panel
-- *     fund history can tell director-initiated rows apart from admin ones.

ALTER TABLE public.fund_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS source          TEXT;

-- * Globally unique per submit (Footspot mints a fresh key each time), so a
-- * plain partial unique index is enough. NULLs (every pre-existing row) are
-- * exempt and never collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fund_transactions_idempotency_key
  ON public.fund_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
