-- * Each home_section is now a category that contains multiple URL links
-- * (mirrors the catalog page's grid). Drop the single `url` column and
-- * introduce a child table for the links.

ALTER TABLE home_sections DROP COLUMN IF EXISTS url;

CREATE TABLE home_section_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  UUID NOT NULL REFERENCES home_sections(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  logo_path   TEXT,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_home_section_links_section ON home_section_links(section_id, sort_order);

ALTER TABLE home_section_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public home_section_links" ON home_section_links
  FOR SELECT USING (true);

CREATE POLICY "admin writes home_section_links" ON home_section_links
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('home-section-link-logos', 'home-section-link-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin writes home-section-link-logos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'home-section-link-logos' AND public.is_admin())
  WITH CHECK (bucket_id = 'home-section-link-logos' AND public.is_admin());
