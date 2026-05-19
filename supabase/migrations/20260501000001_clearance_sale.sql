-- * Clearance sale section.
-- *  - products.is_on_clearance flags products eligible for the storefront
-- *    clearance section.
-- *  - site_settings is a singleton row holding shop-wide toggles. The first
-- *    one is `clearance_active` which controls whether the section is visible
-- *    to customers on the home page.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_on_clearance BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_clearance ON products(is_on_clearance) WHERE is_on_clearance = true;

CREATE TABLE site_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clearance_active  BOOLEAN NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- * Seed the singleton row.
INSERT INTO site_settings (clearance_active) VALUES (false);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public site_settings" ON site_settings
  FOR SELECT USING (true);

CREATE POLICY "admin writes site_settings" ON site_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
