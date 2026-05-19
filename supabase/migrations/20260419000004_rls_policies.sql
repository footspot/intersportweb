-- * RLS policies (DEVELOPMENT_GUIDE.md §7)
-- * SELECT-only; writes go exclusively through edge functions using the service-role key.

-- PROFILES
CREATE POLICY "own profile"          ON profiles  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "admin reads profiles" ON profiles  FOR SELECT USING (is_admin());

-- SPORTS / CLUBS / CATALOG / CONTACT — public read
CREATE POLICY "public sports"        ON sports        FOR SELECT USING (true);
CREATE POLICY "public clubs"         ON clubs         FOR SELECT USING (true);
CREATE POLICY "public catalog"       ON catalog_links FOR SELECT USING (true);
CREATE POLICY "public contact"       ON contact_info  FOR SELECT USING (true);

-- PRODUCTS — public sees only visible; back-office sees all
CREATE POLICY "visible products"     ON products  FOR SELECT USING (is_visible = true);
CREATE POLICY "backoffice products"  ON products  FOR SELECT USING (is_backoffice());

-- VARIANTS — public read (sizes / stock display)
CREATE POLICY "public variants"      ON product_variants FOR SELECT USING (true);

-- ORDERS — owner or backoffice
CREATE POLICY "own orders"           ON orders      FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "backoffice orders"    ON orders      FOR SELECT USING (is_backoffice());
CREATE POLICY "own order items"      ON order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "backoffice items"     ON order_items FOR SELECT USING (is_backoffice());

-- FUND — admin only (employee excluded by design)
CREATE POLICY "admin reads fund"     ON fund_transactions FOR SELECT USING (is_admin());

-- REFUNDS — backoffice read
CREATE POLICY "backoffice refunds"   ON refunds     FOR SELECT USING (is_backoffice());
