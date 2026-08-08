-- * Flocking state — set to 'in_flocking' when a flocking order (ordre de
-- * flocage) is downloaded from the back-office. Independent from both the
-- * payment-driven `status` and the export-driven `preparation_status`; the
-- * two states can coexist on one order.
alter table public.orders
  add column if not exists flocking_status text
  check (flocking_status is null or flocking_status = 'in_flocking');
