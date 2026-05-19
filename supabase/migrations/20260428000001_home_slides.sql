-- * Home page hero carousel slides — admin-managed.
-- * Image is required, title is optional. Sort order drives playback order.

CREATE TABLE home_slides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_path  TEXT NOT NULL,
  title       TEXT,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_home_slides_sort ON home_slides(sort_order);

ALTER TABLE home_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public home_slides" ON home_slides
  FOR SELECT USING (true);

-- * Storage bucket for the slide images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('home-carousel', 'home-carousel', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin writes home-carousel" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'home-carousel' AND public.is_admin())
  WITH CHECK (bucket_id = 'home-carousel' AND public.is_admin());
