-- * Phase 5 — Colissimo label generation + tracking schema.
-- *
-- * `generate-colissimo-label` uploads each label PDF to the private `labels`
-- * bucket and records the path on the order. Suivi v2 polling writes one row
-- * per poll into `colissimo_tracking_log` so we can debug terminal status
-- * decisions. Failed label attempts queue in `label_errors` for retry.

-- =========================================================================
-- * 1. orders: label storage + tracking columns
-- =========================================================================

ALTER TABLE public.orders
  -- * Path inside the `labels` private bucket; the admin downloads via
  -- * a service-role-signed URL.
  ADD COLUMN label_pdf_path      TEXT,
  ADD COLUMN label_generated_at  TIMESTAMPTZ,
  -- * The latest Suivi v2 status string. Used by the tracking timeline UI
  -- * and by the worker to decide whether to email `delivered` / return-to-
  -- * sender. Raw events stay in colissimo_tracking_log.
  ADD COLUMN tracking_status     TEXT,
  ADD COLUMN tracking_checked_at TIMESTAMPTZ;

-- =========================================================================
-- * 2. colissimo_tracking_log — one row per Suivi v2 poll
-- =========================================================================

CREATE TABLE public.colissimo_tracking_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  parcel_code  TEXT NOT NULL,
  -- * Lifecycle code from Suivi v2 (e.g. PCH, DEP, LIV, MLV). We don't enum
  -- * it because La Poste adds new codes occasionally and we don't want a
  -- * worker to crash on an unknown one.
  status_code  TEXT,
  status_label TEXT,
  event_date   TIMESTAMPTZ,
  raw_payload  JSONB,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_colissimo_tracking_order ON public.colissimo_tracking_log(order_id, fetched_at DESC);

ALTER TABLE public.colissimo_tracking_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backoffice tracking" ON public.colissimo_tracking_log
  FOR SELECT USING (public.is_backoffice());

-- =========================================================================
-- * 3. label_errors — failed generate-colissimo-label attempts
-- =========================================================================
-- *
-- * One row per failure. `attempts` increments on retries; the admin UI can
-- * surface entries with `resolved_at IS NULL` for manual re-fire.

CREATE TABLE public.label_errors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  error_code     TEXT,
  error_message  TEXT NOT NULL,
  raw_response   JSONB,
  attempts       INT NOT NULL DEFAULT 1,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  resolved_by    UUID REFERENCES public.profiles(id)
);

CREATE INDEX idx_label_errors_unresolved ON public.label_errors(last_seen_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.label_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backoffice label errors" ON public.label_errors
  FOR SELECT USING (public.is_backoffice());

-- =========================================================================
-- * 4. `labels` storage bucket — private, backoffice-only
-- =========================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('labels', 'labels', false)
ON CONFLICT (id) DO NOTHING;

-- * Reads gated to backoffice. Writes happen only via service-role (the
-- * `generate-colissimo-label` edge function), so no INSERT policy is needed
-- * — service-role bypasses RLS.
CREATE POLICY "backoffice reads labels" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'labels' AND public.is_backoffice());
