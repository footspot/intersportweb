-- * Home page entry-row sections — admin-managed.
-- * Render on slide 0 of the home carousel, after the static Catalog/Shop
-- * cards. Each section is a URL link with a logo, optional description, and
-- * an accent color used for the card glow/title/arrow.
-- * `is_visible` lets the admin hide a section without deleting it.

CREATE TABLE home_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  url          TEXT NOT NULL,
  logo_path    TEXT,
  accent_color TEXT NOT NULL DEFAULT '#0331f9',
  is_visible   BOOLEAN NOT NULL DEFAULT true,
  sort_order   INT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_home_sections_sort ON home_sections(sort_order);

ALTER TABLE home_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public home_sections" ON home_sections
  FOR SELECT USING (true);

CREATE POLICY "admin writes home_sections" ON home_sections
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- * Storage bucket for the section logos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('home-section-logos', 'home-section-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin writes home-section-logos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'home-section-logos' AND public.is_admin())
  WITH CHECK (bucket_id = 'home-section-logos' AND public.is_admin());
