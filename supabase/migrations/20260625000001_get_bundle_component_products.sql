-- * Returns a pack's component products (with variants + images) regardless of
-- * visibility. Component products locked in a bundle are usually is_visible=false
-- * and thus hidden from the public RLS-filtered catalogue fetch — but the pack
-- * page still needs their sizes/stock to render size selectors and pack contents
-- * for ANONYMOUS shoppers (the storefront is guest-only). SECURITY DEFINER
-- * bypasses RLS; only ever returns rows that are components of the given bundle
-- * (pack contents are already shown publicly), never a general listing, and the
-- * storefront grid filters is_visible so these never leak in as standalone items.
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
        select jsonb_agg(to_jsonb(v) order by v.size)
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
