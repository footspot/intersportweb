-- * Snapshot of the custom paid options a buyer selected for an order line.
-- * Display-only: each entry is { name, price } captured at checkout. The price
-- * is already baked into order_items.unit_price_paid (add-ons are charged on
-- * top of the catalogue price and do not affect the club fund).
alter table public.order_items
  add column if not exists selected_options jsonb not null default '[]'::jsonb;

-- * Surface the selected options on the magic-link order page. Redefines
-- * get_order_by_token to add `selected_options` to each item (rest unchanged).
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
        'selected_options', i.selected_options,
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
