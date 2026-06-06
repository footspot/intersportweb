-- * Customizable overlay text color for home-section cover cards, plus cover
-- * image + text color for the three static entry cards (catalog / shop /
-- * clearance). All optional — cards keep their accent colors + white background
-- * when no cover image is set.

-- * Per-section overlay text color (used only when a cover image is present).
ALTER TABLE home_sections
  ADD COLUMN text_color TEXT CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$');

-- * Static entry cards live in code, so their personalization lives on the
-- * singleton site_settings row.
ALTER TABLE site_settings
  ADD COLUMN catalog_cover_image_path   TEXT,
  ADD COLUMN catalog_text_color         TEXT CHECK (catalog_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN shop_cover_image_path      TEXT,
  ADD COLUMN shop_text_color            TEXT CHECK (shop_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN clearance_cover_image_path TEXT,
  ADD COLUMN clearance_text_color       TEXT CHECK (clearance_text_color ~ '^#[0-9A-Fa-f]{6}$');

-- * Shared bucket for the static entry-card cover images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('entry-card-covers', 'entry-card-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin writes entry-card-covers" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'entry-card-covers' AND public.is_admin())
  WITH CHECK (bucket_id = 'entry-card-covers' AND public.is_admin());
