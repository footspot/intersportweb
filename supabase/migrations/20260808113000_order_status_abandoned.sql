-- * New terminal status for checkouts that never reached payment.
-- * 'cancelled' is reserved for deliberate cancellations of real (paid)
-- * orders; auto-expired pending checkouts get their own label so the
-- * back-office list stays unambiguous.
-- *
-- * Kept in its own migration: a value added to an enum cannot be used in
-- * the same transaction that added it.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'abandoned';
