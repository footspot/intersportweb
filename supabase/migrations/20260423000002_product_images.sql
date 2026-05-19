-- * Multi-image support for products.
-- *
-- * Replaces the single `products.image_path` column with a dedicated
-- * `product_images` table. Position 0 is the primary image (used for
-- * thumbnails, cart snapshots, Footspot events). Up to 5 per product;
-- * the cap is enforced in the backoffice-products edge function.

CREATE TABLE product_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_path  TEXT NOT NULL,
  position    SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE UNIQUE INDEX idx_product_images_product_position
  ON product_images(product_id, position);

-- * Backfill: keep the existing single image as position 0.
INSERT INTO product_images (product_id, image_path, position)
SELECT id, image_path, 0
  FROM products
 WHERE image_path IS NOT NULL;

ALTER TABLE products DROP COLUMN image_path;

-- * RLS: same shape as product_variants (public read; writes go through
-- * the service-role edge function).
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public product images" ON product_images
  FOR SELECT USING (true);
