-- * Club branding: accent colour + slogan set from admin panel.
-- * accent_color must be a valid 6-digit hex (#RRGGBB). slogan max 80 chars.
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS accent_color text
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN IF NOT EXISTS slogan text
    CHECK (char_length(slogan) <= 80);
