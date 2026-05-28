-- * Sync the orders status-change trigger with the live DB.
-- *
-- * The earlier migration (20260511082900_orders_status_trigger.sql) left
-- * Footspot dispatch out on purpose, noting it would live in the "parallel
-- * integration plan". That dispatch has since been added directly to the
-- * live function but never committed back to the repo. This migration
-- * brings the source of truth in line.
-- *
-- * Behavior:
-- *   - 'paid' + delivery_method='colissimo'  → generate-colissimo-label
-- *     (unchanged, idempotent on NEW.label_pdf_path)
-- *   - status transitions to paid/shipped/delivered/refunded/
-- *     partially_refunded/cancelled → footspot-push-event with the matching
-- *     event_type, gated by an active footspot_links row on the order's club.
-- *
-- * No retry/backoff lives here — footspot-push-event owns that; the trigger
-- * fires once per transition with a fresh idempotency key.

CREATE OR REPLACE FUNCTION public.tg_orders_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url        TEXT;
  v_key        TEXT;
  v_event_type TEXT;
  v_has_link   BOOLEAN;
BEGIN
  -- * Fire only on actual status transitions. INSERT also welcome.
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_key := public._service_role_key();
  IF v_key IS NULL THEN
    RAISE WARNING 'orders status trigger: service_role_key vault secret missing — skipping dispatch';
    RETURN NEW;
  END IF;

  -- * 1) paid + colissimo → label generation. Skip if a label already exists.
  IF NEW.status = 'paid'
     AND NEW.delivery_method = 'colissimo'
     AND NEW.label_pdf_path IS NULL THEN
    v_url := public._edge_function_endpoint('generate-colissimo-label');
    IF v_url IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',    'application/json',
          'X-Internal-Call', v_key
        ),
        body    := jsonb_build_object('order_id', NEW.id)
      );
    END IF;
  END IF;

  -- * 2) Footspot dispatch. Map the new status to an event type, then fire
  -- *    footspot-push-event only when the order's club is actively linked.
  v_event_type := CASE NEW.status
    WHEN 'paid'               THEN 'order.created'
    WHEN 'shipped'            THEN 'order.status_changed'
    WHEN 'delivered'          THEN 'shipment.delivered'
    WHEN 'refunded'           THEN 'order.refunded'
    WHEN 'partially_refunded' THEN 'order.refunded'
    WHEN 'cancelled'          THEN 'order.status_changed'
    ELSE NULL
  END;

  IF v_event_type IS NOT NULL AND NEW.club_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.footspot_links
       WHERE club_id = NEW.club_id AND status = 'active'
    ) INTO v_has_link;

    IF v_has_link THEN
      v_url := public._edge_function_endpoint('footspot-push-event');
      IF v_url IS NOT NULL THEN
        PERFORM net.http_post(
          url     := v_url,
          headers := jsonb_build_object(
            'Content-Type',    'application/json',
            'X-Internal-Call', v_key
          ),
          body    := jsonb_build_object(
            'order_id',        NEW.id,
            'event_type',      v_event_type,
            'idempotency_key', gen_random_uuid()
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
