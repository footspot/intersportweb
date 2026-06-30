-- * size_guides — named brand size-chart files (image/PDF) uploaded by admins,
-- * assignable to many products (including packs) via product_size_guides. Shown
-- * on the storefront product page so customers can consult the sizing.
create table if not exists public.size_guides (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  file_path  text not null,
  file_type  text,
  created_at timestamptz not null default now()
);

-- * Many-to-many: a product can list several guides; a guide can be reused
-- * across products. Cascade on both sides so deletes clean up the links.
create table if not exists public.product_size_guides (
  product_id    uuid not null references public.products(id) on delete cascade,
  size_guide_id uuid not null references public.size_guides(id) on delete cascade,
  position      smallint not null default 0,
  primary key (product_id, size_guide_id)
);

create index if not exists idx_product_size_guides_product on public.product_size_guides(product_id);
create index if not exists idx_product_size_guides_guide on public.product_size_guides(size_guide_id);

-- * RLS: public read (storefront), writes only through service-role edge functions.
alter table public.size_guides enable row level security;
alter table public.product_size_guides enable row level security;

create policy "public size guides" on public.size_guides
  for select using (true);
create policy "public product size guides" on public.product_size_guides
  for select using (true);

-- * Data API grants (default-deny on new/updated projects).
grant select on public.size_guides to anon;
grant select on public.size_guides to authenticated;
grant select, insert, update, delete on public.size_guides to service_role;

grant select on public.product_size_guides to anon;
grant select on public.product_size_guides to authenticated;
grant select, insert, update, delete on public.product_size_guides to service_role;

-- * Storage bucket for the guide files (public read; uploads via service role).
insert into storage.buckets (id, name, public) values ('size-guides', 'size-guides', true)
on conflict (id) do nothing;
