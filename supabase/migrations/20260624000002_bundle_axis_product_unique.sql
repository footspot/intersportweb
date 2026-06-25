-- * Extend the bundle_axis enum so a pack component can be sized independently
-- * ('product' — its own size selector on the shop) or fixed ('unique' — a single
-- * "Taille unique" badge, no size choice). 'primary'/'secondary' are unchanged
-- * shared sizing groups. Additive only; existing packs keep working.
alter type bundle_axis add value if not exists 'product';
alter type bundle_axis add value if not exists 'unique';
