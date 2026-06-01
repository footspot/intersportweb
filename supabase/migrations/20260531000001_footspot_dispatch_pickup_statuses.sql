-- * Footspot dispatch — map the club-pickup statuses.
-- *
-- * The status→event CASE in tg_orders_status_changed was written from the
-- * Phase 3 table in FOOTSPOT_INTEGRATION.md, which predates the club-pickup
-- * flow. When 'awaiting_pickup' / 'picked_up' were later added to order_status
-- * (pickup terminal states), the trigger was never updated — so they fell
-- * through to ELSE NULL and NO event was dispatched.
-- *
-- * Effect of the gap: a `club_pickup` order advanced from the Intersport
-- * dashboard (never touching the colissimo flow, which owns shipped/delivered)
-- * stayed frozen at Footspot's order.created state ("awaiting") no matter how
-- * far it progressed on Intersport.
-- *
-- * Mapping (mirrors the shipping analogs already in the table):
-- *   awaiting_pickup → order.status_changed  (ready for collection, like shipped)
-- *   picked_up       → shipment.delivered    (terminal fulfilment, like delivered)
-- * The shipment.delivered analog also lets Footspot's delivery-driven stock
-- * handling fire for pickup orders, matching the colissimo `delivered` path.

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
    WHEN 'awaiting_pickup'    THEN 'order.status_changed'
    WHEN 'delivered'          THEN 'shipment.delivered'
    WHEN 'picked_up'          THEN 'shipment.delivered'
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
