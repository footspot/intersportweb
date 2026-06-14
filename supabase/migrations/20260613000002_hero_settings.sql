-- * Hero customization on the singleton site_settings row:
-- *   • hero_video_path  — admin-uploaded launch/intro clip (stored in the
-- *                        public `home-carousel` bucket). NULL → the storefront
-- *                        falls back to the bundled /intro-intersport.mp4.
-- *   • hero_show_cards  — whether the throwable card deck is shown in the hero.
ALTER TABLE site_settings
  ADD COLUMN hero_video_path TEXT,
  ADD COLUMN hero_show_cards BOOLEAN NOT NULL DEFAULT true;
