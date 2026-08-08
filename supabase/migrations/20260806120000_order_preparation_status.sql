-- * Preparation state — set to 'in_progress' when purchase orders are
-- * bulk-exported from the back-office. Deliberately independent from the
-- * payment-driven `status` column; the UI hides it once the order is sent.
alter table public.orders
  add column if not exists preparation_status text
  check (preparation_status is null or preparation_status = 'in_progress');
