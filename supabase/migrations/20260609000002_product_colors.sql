-- * product_colors — color variants for a product. Each color has a display
-- * name + hex (from the admin color picker). Size/stock variants and gallery
-- * images link to a color, so the storefront can show swatches and swap the
-- * displayed image when a color is picked.
-- *
-- * Fully optional and backward-compatible: products with no colors behave
-- * exactly as before — product_variants.color_id and product_images.color_id
-- * stay NULL, and the storefront shows the flat size list + whole gallery.
create table if not exists public.product_colors (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name       text not null,
  hex        text not null,
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_colors_product on public.product_colors(product_id);

-- * Link each size/stock variant to a color (NULL = product has no colors).
-- * ON DELETE CASCADE: removing a color drops its size rows.
alter table public.product_variants
  add column if not exists color_id uuid references public.product_colors(id) on delete cascade;

create index if not exists idx_product_variants_color on public.product_variants(color_id);

-- * A size is now unique per (product, color) rather than per (product). Swap
-- * the old (product_id, size) uniqueness for one that also keys on color,
-- * coalescing "no color" to a fixed sentinel so existing single-color
-- * products still keep exactly one row per size.
alter table public.product_variants
  drop constraint if exists product_variants_product_id_size_key;

create unique index if not exists idx_product_variants_product_size_color
  on public.product_variants (
    product_id,
    size,
    coalesce(color_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- * Tag each gallery image with a color (NULL = shown for every color / no
-- * color). ON DELETE SET NULL: removing a color leaves its images in the
-- * gallery but untagged.
alter table public.product_images
  add column if not exists color_id uuid references public.product_colors(id) on delete set null;

create index if not exists idx_product_images_color on public.product_images(color_id);

-- * Order-line color snapshot — display only. Stock, fund and Footspot all key
-- * off variant_id (each (color, size) is its own variant row), so the snapshot
-- * is purely cosmetic for the order detail + confirmation email.
alter table public.order_items
  add column if not exists color text;

-- * RLS: same shape as product_variants / product_images / product_options —
-- * public read; writes only through the service-role backoffice edge function.
alter table public.product_colors enable row level security;

create policy "public product colors" on public.product_colors
  for select using (true);

-- * Data API grants (default-deny on new/updated projects).
grant select on public.product_colors to anon;
grant select on public.product_colors to authenticated;
grant select, insert, update, delete on public.product_colors to service_role;

-- * Surface the color snapshot on the magic-link order page. Redefines
-- * get_order_by_token to add `color` to each item (rest of the body unchanged).
create or replace function public.get_order_by_token(p_token uuid, p_order_id uuid default null::uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
DECLARE
  v_order JSONB;
  v_order_id UUID;
BEGIN
  SELECT o.id INTO v_order_id
    FROM public.orders o
   WHERE o.access_token = p_token
     AND (p_order_id IS NULL OR o.id = p_order_id)
   LIMIT 1;
  IF v_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(o) INTO v_order FROM public.orders o WHERE o.id = v_order_id;

  v_order := v_order || jsonb_build_object(
    'items', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'product_id', i.product_id,
        'variant_id', i.variant_id,
        'quantity', i.quantity,
        'size', i.size,
        'secondary_size', i.secondary_size,
        'color', i.color,
        'unit_price_paid', i.unit_price_paid,
        'status', i.status,
        'flocking_name', i.flocking_name,
        'flocking_initial', i.flocking_initial,
        'flocking_number', i.flocking_number,
        'product', jsonb_build_object(
          'name', p.name,
          'reference', p.reference,
          'image_path', (
            SELECT pi.image_path
              FROM public.product_images pi
             WHERE pi.product_id = p.id
             ORDER BY pi.position
             LIMIT 1
          )
        )
      ) ORDER BY i.id)
       FROM public.order_items i
       JOIN public.products p ON p.id = i.product_id
      WHERE i.order_id = v_order_id),
      '[]'::jsonb
    ),
    'refunds', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', r.id, 'amount', r.amount, 'reason', r.reason, 'processed_at', r.processed_at))
         FROM public.refunds r WHERE r.order_id = v_order_id),
      '[]'::jsonb
    ),
    'club', (SELECT to_jsonb(c) FROM public.clubs c WHERE c.id = (v_order->>'club_id')::uuid),
    'pickup_shop', (SELECT to_jsonb(s) FROM public.intersport_shops s WHERE s.id = (v_order->>'pickup_shop_id')::uuid)
  );

  RETURN v_order;
END;
$function$;
