-- * Per-product customer instruction.
-- *  - products.instructions is an optional bilingual note the admin writes on a
-- *    single product ("Délai de livraison d'environ 7 jours pour ce produit").
-- *  - Shown to the customer on the product page as a highlighted callout,
-- *    ONLY when set. It is informational: it never blocks add-to-cart.
-- *  - Same {fr, en} JSONB shape as products.details, with the same FR fallback
-- *    when the EN text is left empty.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS instructions JSONB;

COMMENT ON COLUMN products.instructions IS
  'Optional bilingual {fr, en} customer notice shown on the product page (e.g. delivery lead time). NULL = no notice.';
