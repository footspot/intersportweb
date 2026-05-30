-- * Instagram "latest post" home-page feed.
-- *
-- * Two tables + one cron schedule:
-- *  - instagram_config : single row holding the long-lived access token, its
-- *    expiry, and the IG account identity. Locked down (no anon/authenticated
-- *    grants) — only the service-role client inside the instagram-sync worker
-- *    ever touches it. The token must never reach the browser.
-- *  - instagram_posts  : the cached latest posts the storefront renders. Public
-- *    SELECT (like site_settings) so the home page reads it directly.
-- *
-- * The instagram-sync worker (Supabase cron) refreshes the token before it
-- * expires and upserts the latest posts. Seed instagram_config once with the
-- * token + ig_user_id the client provides (see INSTAGRAM_INTEGRATION.md).

-- * ── 1. Token / account config (single row, service-role only) ──
CREATE TABLE instagram_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token      TEXT,
  token_expires_at  TIMESTAMPTZ,
  ig_user_id        TEXT,
  username          TEXT,
  last_synced_at    TIMESTAMPTZ,
  last_error        TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- * Seed the empty singleton row. The client's token is written in later via a
-- * one-off UPDATE (kept out of git) once they generate it.
INSERT INTO instagram_config DEFAULT VALUES;

-- * RLS on, NO policy → unreachable through the Data API. The service-role
-- * client (worker) bypasses RLS. Grant only to service_role so PostgREST can
-- * reach it under that role; anon/authenticated get nothing.
ALTER TABLE instagram_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_config TO service_role;

-- * ── 2. Cached posts (public read) ──
CREATE TABLE instagram_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_id         TEXT NOT NULL UNIQUE,
  media_type    TEXT,
  media_url     TEXT,
  thumbnail_url TEXT,
  permalink     TEXT,
  caption       TEXT,
  posted_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_posts_posted_at ON instagram_posts (posted_at DESC);

ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

-- * Public storefront read.
CREATE POLICY "public instagram_posts" ON instagram_posts
  FOR SELECT USING (true);

GRANT SELECT ON public.instagram_posts TO anon;
GRANT SELECT ON public.instagram_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_posts TO service_role;

-- * ── 3. Cron — refresh token + pull latest posts every 30 min ──
-- *    Same Vault (supabase_url / service_role_key) + X-Internal-Call pattern
-- *    as colissimo_tracking_worker / footspot_retry_worker. cron.schedule with
-- *    an existing jobname is an UPSERT, so this is safe to re-apply.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

SELECT cron.schedule(
  'instagram_sync',
  '*/30 * * * *',
  $cmd$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
             || '/functions/v1/instagram-sync',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'X-Internal-Call', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
  $cmd$
);
