-- * Admin-configurable autoplay dwell time (seconds per slide) for the home
-- * hero carousel. Lives on the singleton site_settings row. Default 3s.
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS carousel_autoplay_seconds INT NOT NULL DEFAULT 3
  CHECK (carousel_autoplay_seconds BETWEEN 1 AND 60);
