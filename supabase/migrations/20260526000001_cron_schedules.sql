-- * pg_cron schedules for the two server-to-server workers.
-- *
-- * Both were created by hand in the Supabase dashboard pre-2026-05-26 and
-- * are codified here so a clean rebuild reproduces them. cron.schedule with
-- * an existing jobname is an UPSERT — safe to re-apply.
-- *
-- * Workers authenticate via the X-Internal-Call header; the value comes from
-- * Vault at execution time so the service-role token is not embedded in
-- * cron.job.command. Vault entries `service_role_key` and `supabase_url`
-- * must exist (they were seeded 2026-05-12).

-- * ── 1. Required extensions (no-ops if already installed) ──
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

-- * ── 2. colissimo-tracking-worker — every 2h on the hour ──
-- *    Polls La Poste Suivi v2 for shipped orders, flips to delivered /
-- *    cancelled on terminal codes, sends delivered / return-to-sender email.
SELECT cron.schedule(
  'colissimo_tracking_worker',
  '0 */2 * * *',
  $cmd$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
             || '/functions/v1/colissimo-tracking-worker',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'X-Internal-Call', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
  $cmd$
);

-- * ── 3. footspot-retry-worker — every 5 min ──
-- *    Replays failed Footspot push events from the outbox.
SELECT cron.schedule(
  'footspot_retry_worker',
  '*/5 * * * *',
  $cmd$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
             || '/functions/v1/footspot-retry-worker',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'X-Internal-Call', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
  $cmd$
);
