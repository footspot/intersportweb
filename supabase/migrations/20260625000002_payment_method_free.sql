-- * A 'free' payment method for orders whose total is fully covered by a promo
-- * code (or any discount) — they settle directly without the SystemPay paywall,
-- * the same way fully-prepaid orders already do. Additive, non-breaking.
alter type payment_method add value if not exists 'free';
