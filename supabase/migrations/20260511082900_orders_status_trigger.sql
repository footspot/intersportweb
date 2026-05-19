-- * Phase 5 — Centralized orders status-change trigger.
-- *
-- * Single dispatcher fired on every `orders.status` transition. It uses
-- * pg_net to async-call edge functions so the writing transaction never
-- * blocks on outbound HTTP.
-- *
-- * Current responsibilities (Footspot dispatch is out of scope here):
-- *   - paid           → kick off generate-colissimo-label when delivery_method='colissimo'
-- *   - awaiting_pickup → send ready-for-pickup email (handled by edge fn, not here)
-- *
-- * Required vault secrets (set once via Supabase dashboard → Settings → Vault):
-- *   - supabase_url            (e.g. https://xxxxxxx.supabase.co)
-- *   - service_role_key        (eyJ… — never commit)
-- *
-- * If either secret is missing the trigger silently no-ops; the admin UI can
-- * still trigger label generation manually via a button that calls
-- * `generate-colissimo-label` directly.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- =========================================================================
-- * Helper: fetch service-role config from vault, returning NULL when unset.
-- =========================================================================

CREATE OR REPLACE FUNCTION public._edge_function_endpoint(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
   WHERE name = 'supabase_url'
   LIMIT 1;
  IF v_url IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN rtrim(v_url, '/') || '/functions/v1/' || p_name;
END;
$$;

CREATE OR REPLACE FUNCTION public._service_role_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;
  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public._edge_function_endpoint(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._service_role_key()           FROM PUBLIC;

-- =========================================================================
-- * Trigger function — dispatch on transition to specific statuses.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_orders_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url   TEXT;
  v_key   TEXT;
BEGIN
  -- * Fire only on actual status transitions. INSERT also welcome (e.g.
  -- * if some flow inserts a paid order directly).
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_key := public._service_role_key();
  IF v_key IS NULL THEN
    RAISE WARNING 'orders status trigger: service_role_key vault secret missing — skipping dispatch';
    RETURN NEW;
  END IF;

  -- * 1) paid + colissimo → label generation. Skip if a label was already
  -- *    produced (idempotency under double-trigger or manual resets).
  IF NEW.status = 'paid'
     AND NEW.delivery_method = 'colissimo'
     AND NEW.label_pdf_path IS NULL THEN
    v_url := public._edge_function_endpoint('generate-colissimo-label');
    IF v_url IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',     'application/json',
          'X-Internal-Call',  v_key
        ),
        body    := jsonb_build_object('order_id', NEW.id)
      );
    END IF;
  END IF;

  -- * Future hooks (pickup-ready reminders, refund propagation, …) plug in
  -- * here. Footspot dispatch lives in the parallel integration plan and is
  -- * intentionally absent from this trigger.

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_status_changed
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_status_changed();
