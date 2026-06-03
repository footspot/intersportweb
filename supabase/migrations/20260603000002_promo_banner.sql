-- * Customizable top promo banner (the blue/ink strip above the header).
-- * Stored on the singleton site_settings row so the storefront reads it via
-- * the existing public SELECT policy; admin edits go through admin-settings.
-- *  - promo_banner_text   : the message shown in the strip (null → i18n default)
-- *  - promo_banner_url     : where the "En savoir plus" button links (null → default)
-- *  - promo_banner_active  : hide/show the whole strip without losing the text

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS promo_banner_text   TEXT,
  ADD COLUMN IF NOT EXISTS promo_banner_url    TEXT,
  ADD COLUMN IF NOT EXISTS promo_banner_active BOOLEAN NOT NULL DEFAULT true;
