-- * Full-card cover image for home sections.
-- * When set, the entry card on slide 0 renders this image edge-to-edge with the
-- * section name + description overlaid in white (instead of the logo/accent layout).
-- * Lives in its own bucket so cover art and small logos stay separate.

ALTER TABLE home_sections ADD COLUMN cover_image_path TEXT;

-- * Storage bucket for the section cover images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('home-section-covers', 'home-section-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin writes home-section-covers" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'home-section-covers' AND public.is_admin())
  WITH CHECK (bucket_id = 'home-section-covers' AND public.is_admin());
