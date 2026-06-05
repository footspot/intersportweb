-- * Allow hard-deleting an admin/employee account.
-- * profiles.id cascades from auth.users, so deleting the auth user removes the
-- * profile row. These tables reference profiles(id) with NO ACTION, which would
-- * block that cascade once the user has created any records. Switch them to
-- * ON DELETE SET NULL so the financial/audit rows survive (attribution is lost,
-- * the record is not). sent_by must become nullable to allow SET NULL.

alter table public.fund_transactions
  drop constraint fund_transactions_created_by_fkey,
  add constraint fund_transactions_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.promo_codes
  drop constraint promo_codes_created_by_fkey,
  add constraint promo_codes_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.refunds
  drop constraint refunds_created_by_fkey,
  add constraint refunds_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.label_errors
  drop constraint label_errors_resolved_by_fkey,
  add constraint label_errors_resolved_by_fkey
    foreign key (resolved_by) references public.profiles(id) on delete set null;

alter table public.footspot_integration_requests
  alter column sent_by drop not null;

alter table public.footspot_integration_requests
  drop constraint footspot_integration_requests_sent_by_fkey,
  add constraint footspot_integration_requests_sent_by_fkey
    foreign key (sent_by) references public.profiles(id) on delete set null;
