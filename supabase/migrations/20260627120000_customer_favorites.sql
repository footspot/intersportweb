-- * Customer favorites — a logged-in user's saved products.
-- *
-- * RLS-only (no edge function): the Data API is safe to expose directly here
-- * because every policy is scoped to auth.uid(), so a user can only ever
-- * read / insert / delete their OWN rows. This mirrors the self-service
-- * precedent of get_my_orders() — customers talk to Postgres directly for
-- * their own data, while every shared/admin mutation still goes through an
-- * edge function. Guest checkout and magic-link order pages are unaffected.

CREATE TABLE IF NOT EXISTS public.favorites (
  -- * Defaults to the caller's verified account id so the browser only has to
  -- * send product_id; the RLS check still pins it to auth.uid() regardless.
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS favorites_user_idx ON public.favorites (user_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- * Own-rows-only. auth.uid() is the verified account id from the JWT.
CREATE POLICY "favorites_select_own" ON public.favorites
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "favorites_insert_own" ON public.favorites
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "favorites_delete_own" ON public.favorites
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- * Data API (PostgREST) grants. anon gets nothing — favorites require a session.
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO service_role;
