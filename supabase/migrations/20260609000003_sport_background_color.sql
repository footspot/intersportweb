-- * Per-sport background color for the storefront sport tiles (HomeShopCarousel).
-- * Optional: NULL keeps the current default tile styling. Hex-validated, same
-- * shape as clubs.accent_color / home_sections.accent_color.
alter table public.sports
  add column if not exists background_color text
    check (background_color ~ '^#[0-9A-Fa-f]{6}$');
