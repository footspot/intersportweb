-- * Weekly schedule for rgpd-purge-worker (dormant customer accounts).
-- *
-- * Deleting an account requires auth.admin.deleteUser(), which SQL cannot
-- * call — hence the edge-function hop, exactly like colissimo_tracking_worker
-- * and footspot_retry_worker. Auth uses the X-Internal-Call header, read from
-- * Vault at execution time so the service-role token never sits in plaintext
-- * inside cron.job.command.
-- *
-- * Requires the Vault entries `supabase_url` and `service_role_key` (seeded
-- * 2026-05-12) and the rgpd-purge-worker function to be DEPLOYED first —
-- * otherwise the weekly call just 404s until it is.
-- *
-- * Sunday 04:00, after rgpd_anonymise_old_orders (Sunday 03:30), so orders are
-- * already anonymised when accounts are considered.

SELECT cron.schedule(
  'rgpd_purge_worker',
  '0 4 * * 0',
  $cmd$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
             || '/functions/v1/rgpd-purge-worker',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'X-Internal-Call', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
  $cmd$
);

-- * Before trusting the first real run, call it in dry-run mode and read the
-- * counts — it deletes nothing and reports exactly what it WOULD delete:
-- *
-- *   curl -s -X POST "$SUPABASE_URL/functions/v1/rgpd-purge-worker?dry_run=1" \
-- *        -H "X-Internal-Call: $SERVICE_ROLE_KEY"
