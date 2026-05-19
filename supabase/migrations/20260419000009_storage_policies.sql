-- * Storage RLS: public buckets allow anonymous reads out of the box,
-- * but writes still need explicit policies on storage.objects. Scoped by role:
-- *   - sports-icons / club-logos / catalog-logos → admin only
-- *   - product-images → admin + employee (back-office)
-- *   - invoices stays private (service-role only, via signed URLs)

CREATE POLICY "admin writes sports icons" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'sports-icons' AND public.is_admin())
  WITH CHECK (bucket_id = 'sports-icons' AND public.is_admin());

CREATE POLICY "admin writes club logos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'club-logos' AND public.is_admin())
  WITH CHECK (bucket_id = 'club-logos' AND public.is_admin());

CREATE POLICY "admin writes catalog logos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'catalog-logos' AND public.is_admin())
  WITH CHECK (bucket_id = 'catalog-logos' AND public.is_admin());

CREATE POLICY "backoffice writes product images" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-images' AND public.is_backoffice())
  WITH CHECK (bucket_id = 'product-images' AND public.is_backoffice());
