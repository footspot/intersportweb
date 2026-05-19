-- * Enums (DEVELOPMENT_GUIDE.md §5)
CREATE TYPE user_role         AS ENUM ('admin', 'employee', 'customer');

-- * pending_bank_transfer added for the manual bank-transfer payment provider:
-- * order stays pending until admin confirms receipt, then transitions to 'paid'.
CREATE TYPE order_status      AS ENUM ('pending', 'pending_bank_transfer', 'paid',
                                       'partially_refunded', 'shipped', 'delivered',
                                       'cancelled', 'refunded');

CREATE TYPE order_line_status AS ENUM ('ok', 'refunded_oos');
CREATE TYPE payment_method    AS ENUM ('paypal', 'card', 'bank_transfer');
CREATE TYPE discount_source   AS ENUM ('club', 'intersport');
CREATE TYPE fund_tx_type      AS ENUM ('auto_sale', 'manual_credit',
                                       'manual_debit', 'refund_reversal');
CREATE TYPE flocking_second   AS ENUM ('initial', 'number');
