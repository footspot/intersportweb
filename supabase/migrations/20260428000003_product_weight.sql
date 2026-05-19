-- * Per-product weight in grams, required by Colissimo to compute shipment weight.
-- * Defaulted to 0 so existing rows keep validating; admin can fill them in over time.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight_grams INTEGER NOT NULL DEFAULT 0
  CHECK (weight_grams >= 0);
