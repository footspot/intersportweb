-- * Toggle for the dark gradient overlay drawn over cover-card images.
-- * Enabled by default so text stays legible; admins can turn it off per card.

ALTER TABLE home_sections
  ADD COLUMN cover_gradient BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE site_settings
  ADD COLUMN catalog_cover_gradient   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN shop_cover_gradient      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN clearance_cover_gradient BOOLEAN NOT NULL DEFAULT true;
