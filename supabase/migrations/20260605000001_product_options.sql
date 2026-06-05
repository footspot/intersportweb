-- * product_options — free-form paid add-ons per product (e.g. flocking-like
-- * extras the seller invents: "Gift wrap", "Express embroidery", …).
-- *
-- * Each option is just a name + price. The seller adds as many as needed from
-- * the product form; the whole set is replaced on every product save (same
-- * pattern as product_images). Public read so the storefront can list them.
create table if not exists public.product_options (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name       text not null,
  price      numeric(10, 2) not null default 0 check (price >= 0),
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_options_product on public.product_options(product_id);

-- * RLS: same shape as product_variants / product_images — public read; writes
-- * only through the service-role backoffice-products edge function.
alter table public.product_options enable row level security;

create policy "public product options" on public.product_options
  for select using (true);

-- * Data API grants (default-deny on new/updated projects). Read-only for the
-- * browser; full access for the service role used by the edge function.
grant select on public.product_options to anon;
grant select on public.product_options to authenticated;
grant select, insert, update, delete on public.product_options to service_role;
