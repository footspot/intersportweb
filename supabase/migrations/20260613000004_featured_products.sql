-- * "Les bons plans du moment" — admin hand-picked featured products carousel.

-- * Ordered roster of products to feature on the home page.
create table if not exists public.featured_products (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- * A product can only be featured once.
create unique index if not exists featured_products_product_id_key
  on public.featured_products(product_id);

create index if not exists featured_products_sort_order_idx
  on public.featured_products(sort_order);

grant select on public.featured_products to anon;
grant select, insert, update, delete on public.featured_products to authenticated;
grant select, insert, update, delete on public.featured_products to service_role;

alter table public.featured_products enable row level security;

-- * Public read so the storefront can resolve the section directly. Writes go
-- * through the admin-featured-products edge function (service role).
drop policy if exists "featured_products_public_read" on public.featured_products;
create policy "featured_products_public_read"
  on public.featured_products
  for select
  to anon, authenticated
  using (true);

-- * Section visibility toggle + admin-editable title, on the singleton settings row.
alter table public.site_settings
  add column if not exists bons_plans_active boolean not null default false;
alter table public.site_settings
  add column if not exists bons_plans_title text;
