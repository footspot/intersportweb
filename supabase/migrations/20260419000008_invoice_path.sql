-- * orders.invoice_path: storage path inside the private 'invoices' bucket.
-- * Populated by the generate-invoice edge function.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_path TEXT;
