-- * Remove bank transfer entirely. The project ships with SystemPay only
-- * (card + PayPal via the Smartform). No more `pending_bank_transfer`
-- * status, no more `bank_transfer` payment method.

-- =========================================================================
-- * 1. Reclassify the seed rows that still use the soon-to-be-dropped values.
-- *    Orders that were "awaiting transfer" become `cancelled`. The historic
-- *    `bank_transfer` payment method is wiped to NULL — auditing the legacy
-- *    seed orders that way is harmless because they're not real payments.
-- =========================================================================

UPDATE public.orders
   SET status = 'cancelled'
 WHERE status = 'pending_bank_transfer';

UPDATE public.orders
   SET payment_method = NULL
 WHERE payment_method = 'bank_transfer';

-- =========================================================================
-- * 2. Narrow order_status enum.
-- *    Postgres can't drop an enum value in place — recreate the type. Drop
-- *    the column default first AND the status-dependent trigger; neither
-- *    can survive a type change.
-- =========================================================================

DROP TRIGGER IF EXISTS orders_status_changed ON public.orders;

ALTER TABLE public.orders ALTER COLUMN status DROP DEFAULT;

CREATE TYPE public.order_status_new AS ENUM (
  'pending',
  'paid',
  'partially_refunded',
  'shipped',
  'awaiting_pickup',
  'picked_up',
  'delivered',
  'cancelled',
  'refunded'
);

ALTER TABLE public.orders
  ALTER COLUMN status TYPE public.order_status_new
  USING status::text::public.order_status_new;

DROP TYPE public.order_status;
ALTER TYPE public.order_status_new RENAME TO order_status;

ALTER TABLE public.orders
  ALTER COLUMN status SET DEFAULT 'pending'::public.order_status;

-- =========================================================================
-- * 3. Narrow payment_method enum.
-- =========================================================================

CREATE TYPE public.payment_method_new AS ENUM ('paypal', 'card');

ALTER TABLE public.orders
  ALTER COLUMN payment_method TYPE public.payment_method_new
  USING (
    CASE
      WHEN payment_method::text IN ('paypal', 'card') THEN payment_method::text::public.payment_method_new
      ELSE NULL
    END
  );

DROP TYPE public.payment_method;
ALTER TYPE public.payment_method_new RENAME TO payment_method;

-- =========================================================================
-- * 4. Restore the centralized status-change trigger.
-- =========================================================================

CREATE TRIGGER orders_status_changed
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_status_changed();
