-- * Pickup delay (in working days) shown to the buyer at checkout.
-- * The admin sets BOTH delays per club, independently, in the club form:
-- *   - club_pickup_delay_days  → shown when the buyer picks "club pickup"
-- *   - shop_pickup_delay_days  → shown when the buyer picks "shop pickup"
-- * The shop itself carries no delay; the customer never sets one.
-- * Nullable: when null the checkout falls back to a generic message.

ALTER TABLE public.clubs
  ADD COLUMN club_pickup_delay_days INT CHECK (club_pickup_delay_days >= 0),
  ADD COLUMN shop_pickup_delay_days INT CHECK (shop_pickup_delay_days >= 0);
