-- * Home hero "deck" — each slide is now a stacked, throwable card. The admin
-- * chooses per slide between two kinds:
-- *   • 'image'   — a plain full-bleed image card (classic carousel slide).
-- *   • 'product' — a rich product card linked to a product + its sport: the
-- *                 card shows the sport badge, product name, price & discount,
-- *                 and clicking it opens the product.
-- * product_id / sport_id are only used by the 'product' kind. image_path stays
-- * optional now (product cards can fall back to the product's primary image).

ALTER TABLE home_slides
  ADD COLUMN card_kind  TEXT NOT NULL DEFAULT 'image'
    CHECK (card_kind IN ('image', 'product')),
  ADD COLUMN product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN sport_id   UUID REFERENCES sports(id)   ON DELETE SET NULL,
  ADD COLUMN subtitle   TEXT;

-- * Image is required for 'image' cards but optional for 'product' cards (they
-- * fall back to the linked product's primary image when none is uploaded).
ALTER TABLE home_slides ALTER COLUMN image_path DROP NOT NULL;
