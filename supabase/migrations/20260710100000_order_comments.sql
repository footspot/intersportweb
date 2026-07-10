-- * Internal order comments — back-office only, NEVER exposed to the shop.
-- * Reads and writes both go through the backoffice-orders edge function
-- * (service role), so the table gets NO client grants and no RLS policies:
-- * anon/authenticated simply cannot see it.

CREATE TABLE public.order_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- * Snapshot of the author's display name (survives account deletion).
  author_name TEXT NOT NULL,
  -- * Optional admin/employee name the comment is addressed to / mentions.
  staff_name  TEXT,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_comments_order ON public.order_comments(order_id, created_at DESC);

ALTER TABLE public.order_comments ENABLE ROW LEVEL SECURITY;

-- * service_role bypasses RLS but still needs table privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_comments TO service_role;
-- ? Deliberately NO grant to anon / authenticated — internal-only table.
