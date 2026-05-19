-- * Rethink of the product entity:
-- *   - Flocking becomes a 3-way kind (none / members / supporters) with
-- *     per-option prices instead of a single boolean.
-- *   - Products can now be packs (bundle of several articles) with a second
-- *     size axis (e.g. sock size) and a free-text contents list.
-- *
-- * Order items gain matching columns so historical snapshots stay truthful
-- * once the rest of the checkout flow is updated to fill them.

-- 1. New enum for the 3 flocking modes
CREATE TYPE flocking_kind AS ENUM ('none', 'members', 'supporters');

-- 2. New product columns (additive first so we can backfill)
ALTER TABLE products
  ADD COLUMN flocking_kind                     flocking_kind NOT NULL DEFAULT 'none',
  ADD COLUMN flocking_members_name_price       NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (flocking_members_name_price >= 0),
  ADD COLUMN flocking_members_initials_price   NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (flocking_members_initials_price >= 0),
  ADD COLUMN flocking_supporter_price          NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (flocking_supporter_price >= 0),
  ADD COLUMN is_pack                           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN pack_contents                     JSONB,
  ADD COLUMN secondary_size_label              TEXT;

-- 3. Backfill legacy flag → new kind
UPDATE products SET flocking_kind = 'members' WHERE flocking_enabled = true;

-- 4. Drop legacy flocking columns + obsolete enum
ALTER TABLE products
  DROP COLUMN flocking_enabled,
  DROP COLUMN flocking_name_on_back,
  DROP COLUMN flocking_second_option;
DROP TYPE IF EXISTS flocking_second;

-- 5. Variants: secondary size axis for packs
ALTER TABLE product_variants
  ADD COLUMN secondary_size TEXT;

-- * The (product_id, size) uniqueness no longer holds for packs — replace it
-- * with a functional unique that treats NULL secondary_size as ''.
ALTER TABLE product_variants
  DROP CONSTRAINT product_variants_product_id_size_key;
CREATE UNIQUE INDEX product_variants_product_sizes_idx
  ON product_variants (product_id, size, COALESCE(secondary_size, ''));

-- 6. Order items: snapshot the new fields
ALTER TABLE order_items
  ADD COLUMN secondary_size         TEXT,
  ADD COLUMN flocking_kind_snapshot flocking_kind;
