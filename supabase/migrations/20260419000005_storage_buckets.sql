-- * Storage buckets (DEVELOPMENT_GUIDE.md §7)
INSERT INTO storage.buckets (id, name, public) VALUES
  ('sports-icons',   'sports-icons',   true),
  ('club-logos',     'club-logos',     true),
  ('product-images', 'product-images', true),
  ('catalog-logos',  'catalog-logos',  true),
  ('invoices',       'invoices',       false)
ON CONFLICT (id) DO NOTHING;
