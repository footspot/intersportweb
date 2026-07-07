-- * Size variants get an admin-controlled display order. The product form's
-- * top-to-bottom row order is persisted here and drives the size pills on the
-- * storefront product page (regular products AND pack component selectors).
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;

-- * Backfill existing rows with the canonical apparel order (4XS → 5XL), then
-- * numeric-leading sizes ascending (36, 30-34…), then alphabetical. Must stay
-- * in sync with app/utils/sizeOrder.ts.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY product_id
      ORDER BY
        CASE upper(btrim(size))
          WHEN '4XS' THEN 1 WHEN 'XXXXS' THEN 1
          WHEN '3XS' THEN 2 WHEN 'XXXS' THEN 2
          WHEN '2XS' THEN 3 WHEN 'XXS' THEN 3
          WHEN 'XS'  THEN 4
          WHEN 'S'   THEN 5
          WHEN 'M'   THEN 6
          WHEN 'L'   THEN 7
          WHEN 'XL'  THEN 8
          WHEN '2XL' THEN 9  WHEN 'XXL'  THEN 9
          WHEN '3XL' THEN 10 WHEN 'XXXL' THEN 10
          WHEN '4XL' THEN 11 WHEN 'XXXXL' THEN 11
          WHEN '5XL' THEN 12
          ELSE 100
        END,
        substring(btrim(size) FROM '^[0-9]+')::int ASC NULLS LAST,
        size ASC
    ) - 1 AS pos
  FROM product_variants
)
UPDATE product_variants v
SET position = r.pos
FROM ranked r
WHERE v.id = r.id;

-- * The pack page pulls component products through this RPC; it used to order
-- * variants alphabetically by size (L < M < S…). Order by position instead.
create or replace function public.get_bundle_component_products(p_bundle_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
stable
as $$
  select coalesce(jsonb_agg(
    to_jsonb(p)
    || jsonb_build_object(
      'variants', coalesce((
        select jsonb_agg(to_jsonb(v) order by v.position, v.size)
          from product_variants v where v.product_id = p.id), '[]'::jsonb),
      'images', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', pi.id, 'image_path', pi.image_path,
                 'position', pi.position, 'color_id', pi.color_id) order by pi.position)
          from product_images pi where pi.product_id = p.id), '[]'::jsonb),
      'bundle_components', '[]'::jsonb,
      'options', '[]'::jsonb,
      'colors', '[]'::jsonb
    )
  ), '[]'::jsonb)
  from products p
  where p.id in (
    select component_product_id from bundle_components where bundle_product_id = p_bundle_id
  );
$$;

grant execute on function public.get_bundle_component_products(uuid) to anon, authenticated, service_role;
