-- * Full-bleed hero background carousel — admin-managed media that fills the
-- * whole hero banner (behind the card deck). Each item is an image OR a video;
-- * the storefront loops them (images timed, videos play to the end). Distinct
-- * from home_slides (the throwable card deck) and from the one-time intro video.
-- * Files live in the existing public `home-carousel` bucket.

CREATE TABLE hero_banner_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_kind  TEXT NOT NULL DEFAULT 'image' CHECK (media_kind IN ('image', 'video')),
  media_path  TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hero_banner_media_sort ON hero_banner_media(sort_order);

ALTER TABLE hero_banner_media ENABLE ROW LEVEL SECURITY;

-- * Public read (storefront fetches directly); writes go through the edge
-- * function with the service-role client.
CREATE POLICY "public hero_banner_media" ON hero_banner_media
  FOR SELECT USING (true);

grant select on public.hero_banner_media to anon;
grant select, insert, update, delete on public.hero_banner_media to authenticated;
grant select, insert, update, delete on public.hero_banner_media to service_role;
