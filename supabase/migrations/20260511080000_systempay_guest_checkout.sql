-- * Phase 1 — SystemPay / Guest checkout schema.
-- * Two concerns bundled because they unlock together: guest orders need
-- * identity-on-row + a magic-link token, and the SystemPay IPN needs an
-- * idempotency table to safely absorb Lyra's retries.
-- *
-- * Source of truth: PAYMENT_COLISSIMO_GUIDE.md §1.2 and the "Implementation
-- * Order" table (Week 1 row).

-- =========================================================================
-- * 1. orders: drop the auth-wall, add guest identity + magic-link token
-- =========================================================================

-- * Drop the policy that references user_id so we can ALTER the column.
-- * It is recreated below, unchanged in behavior: registered customers still
-- * only see their own rows. Guest rows (user_id IS NULL) never match it.
DROP POLICY IF EXISTS "own orders"      ON public.orders;
DROP POLICY IF EXISTS "own order items" ON public.order_items;

ALTER TABLE public.orders
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN guest_email      TEXT,
  ADD COLUMN guest_first_name TEXT,
  ADD COLUMN guest_last_name  TEXT,
  -- * Magic-link secret. UUIDv4 is unguessable enough for the order-detail
  -- * URL the buyer receives by email; edge functions also accept it as proof
  -- * of ownership for follow-up payment calls.
  ADD COLUMN access_token     UUID NOT NULL DEFAULT gen_random_uuid(),
  -- * Client-supplied per-checkout-attempt key. Lets `create-order` short-
  -- * circuit and return the existing order_id on retries instead of inserting
  -- * a duplicate. Nullable for legacy rows; UNIQUE only where set.
  ADD COLUMN idempotency_key  UUID;

-- * Exactly one identity must be present. Existing rows (user_id NOT NULL,
-- * guest_email NULL) satisfy the first branch — no backfill needed.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_owner_check
  CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

-- * Magic-link lookup must be O(1) and collision-free.
CREATE UNIQUE INDEX orders_access_token_idx
  ON public.orders(access_token);

-- * Used by the post-purchase "Create an account" flow to find every order a
-- * guest placed under the same email. Case-insensitive on purpose — the
-- * shipping form does not normalize input.
CREATE INDEX orders_guest_email_idx
  ON public.orders (LOWER(guest_email))
  WHERE guest_email IS NOT NULL;

-- * One row per checkout attempt; retries land on the same row.
CREATE UNIQUE INDEX orders_idempotency_key_idx
  ON public.orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- * Recreate the owner-read policy. Same predicate as before — auth.uid()
-- * never matches NULL, so guest rows stay invisible to anon JWTs and to
-- * other customers. Guest access goes through edge functions that present
-- * the access_token and use the service role.
CREATE POLICY "own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o
             WHERE o.id = order_id
               AND o.user_id = auth.uid())
  );

-- =========================================================================
-- * 2. payment_events: idempotency ledger for the SystemPay IPN
-- =========================================================================
-- *
-- * Lyra retries on any non-2xx response, so the IPN handler must be
-- * idempotent. We record every accepted event keyed by (provider, event_id)
-- * — typically `transactions[0].uuid` from the kr-answer payload — and skip
-- * processing if a row already exists.
-- *
-- * The `provider` column is plain text rather than an enum because the
-- * 'prepaid' provider (Phase 13) writes synthetic rows here too, and other
-- * processors may follow. Keeping it as TEXT avoids enum churn.

CREATE TABLE public.payment_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL,                          -- * 'systempay' | 'prepaid' | …
  event_id     TEXT NOT NULL,                          -- * unique-per-provider transaction id
  order_id     UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL,                          -- * 'PAID' | 'UNPAID' | 'REFUNDED' | …
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX idx_payment_events_order ON public.payment_events(order_id);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- * No anon/authenticated reads. The table is service-role-only — the IPN
-- * function writes here, and admin tooling that needs to audit goes through
-- * a dedicated SECURITY DEFINER RPC if it ever becomes a UI feature.
CREATE POLICY "backoffice reads payment_events" ON public.payment_events
  FOR SELECT USING (public.is_backoffice());
