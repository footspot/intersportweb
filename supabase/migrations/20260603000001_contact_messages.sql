-- * contact_messages — audit log + rate-limit source for the public contact form.
-- * Written only by the contact-message edge function (service role). Holds PII
-- * (email, IP) so it stays private: RLS on, no anon/authenticated access.

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  subject    text,
  message    text,
  ip         text,
  created_at timestamptz not null default now()
);

-- * Rate-limit lookups: recent rows per email / per IP.
create index if not exists idx_contact_messages_email_created
  on public.contact_messages (email, created_at desc);
create index if not exists idx_contact_messages_ip_created
  on public.contact_messages (ip, created_at desc);

alter table public.contact_messages enable row level security;

-- * No anon/authenticated policies on purpose — the browser never reads or writes
-- * this table. The edge function uses the service role, which bypasses RLS.
grant select, insert on public.contact_messages to service_role;
