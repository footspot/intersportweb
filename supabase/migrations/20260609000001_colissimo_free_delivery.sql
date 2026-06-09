-- * Per-club "offer free Colissimo delivery" toggle.
-- * When enabled, the flat Colissimo shipping fee is waived for this club's
-- * buyers. Multi-club carts only get free shipping when EVERY club in the
-- * cart offers it (the order ships as one parcel with a single fee).
-- * Default false → existing clubs keep charging the flat fee.

ALTER TABLE public.clubs
  ADD COLUMN delivery_colissimo_free BOOLEAN NOT NULL DEFAULT false;
