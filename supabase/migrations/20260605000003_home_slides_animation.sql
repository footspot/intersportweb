-- * Per-slide entrance animation for the home hero carousel.
-- * 'zoom' (default — the original dive-in reveal), 'soccer' (curved shot),
-- * 'basketball' (reverse-U arc shot). Admin picks one per slide.
ALTER TABLE home_slides
  ADD COLUMN animation TEXT NOT NULL DEFAULT 'zoom'
  CHECK (animation IN ('zoom', 'soccer', 'basketball'));
