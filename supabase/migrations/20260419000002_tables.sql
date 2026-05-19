-- * Core tables (DEVELOPMENT_GUIDE.md §5)

-- PROFILES (extends auth.users)
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  full_name  TEXT,
  role       user_role NOT NULL DEFAULT 'customer',
  active     BOOLEAN   NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SPORTS (must be created before any club)
CREATE TABLE sports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       JSONB NOT NULL,
  icon_path  TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CLUBS
CREATE TABLE clubs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id              UUID NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
  name                  TEXT NOT NULL,
  logo_path             TEXT,
  is_password_protected BOOLEAN DEFAULT false,
  access_password_hash  TEXT,
  fund_balance          NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order            INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- PRODUCTS
CREATE TABLE products (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name                   JSONB NOT NULL,
  reference              TEXT NOT NULL UNIQUE,
  details                JSONB,
  image_path             TEXT,
  category               TEXT,
  buying_price           NUMERIC(10,2) NOT NULL,
  selling_price          NUMERIC(10,2) NOT NULL,
  discount_percent       NUMERIC(5,2)  DEFAULT 0,
  discount_source        discount_source,
  flocking_enabled       BOOLEAN DEFAULT false,
  flocking_name_on_back  BOOLEAN DEFAULT false,
  flocking_second_option flocking_second DEFAULT 'initial',
  is_visible             BOOLEAN DEFAULT true,
  sort_order             INT DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT now(),
  CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CHECK (selling_price >= buying_price)
);

-- PRODUCT VARIANTS
CREATE TABLE product_variants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       TEXT NOT NULL,
  stock      INT  NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sku        TEXT UNIQUE,
  UNIQUE (product_id, size)
);

-- CATALOG LINKS
CREATE TABLE catalog_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       JSONB NOT NULL,
  url        TEXT NOT NULL,
  logo_path  TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CONTACT INFO (singleton)
CREATE TABLE contact_info (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address               TEXT,
  phone                 TEXT,
  email                 TEXT,
  google_maps_embed_url TEXT,
  social_media          JSONB DEFAULT '[]',
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ORDERS
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      TEXT UNIQUE NOT NULL,
  user_id           UUID NOT NULL REFERENCES profiles(id),
  club_id           UUID REFERENCES clubs(id),
  status            order_status NOT NULL DEFAULT 'pending',
  payment_method    payment_method,
  payment_id        TEXT,
  shipping_tracking TEXT,
  subtotal          NUMERIC(10,2) NOT NULL,
  shipping_cost     NUMERIC(10,2) DEFAULT 0,
  refund_total      NUMERIC(10,2) DEFAULT 0,
  total             NUMERIC(10,2) NOT NULL,
  shipping_address  JSONB NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  paid_at           TIMESTAMPTZ,
  shipped_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ
);

-- ORDER ITEMS (pricing snapshot for integrity)
CREATE TABLE order_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id               UUID NOT NULL REFERENCES products(id),
  variant_id               UUID NOT NULL REFERENCES product_variants(id),
  quantity                 INT  NOT NULL CHECK (quantity > 0),
  size                     TEXT NOT NULL,
  buying_price_snapshot    NUMERIC(10,2) NOT NULL,
  selling_price_snapshot   NUMERIC(10,2) NOT NULL,
  unit_price_paid          NUMERIC(10,2) NOT NULL,
  discount_source_snapshot discount_source,
  fund_credit_snapshot     NUMERIC(10,2) NOT NULL,
  status                   order_line_status NOT NULL DEFAULT 'ok',
  flocking_name            TEXT,
  flocking_initial         TEXT,
  flocking_number          TEXT
);

-- CLUB FUND TRANSACTIONS
CREATE TABLE fund_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  type           fund_tx_type NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  reason         TEXT NOT NULL,
  reference      TEXT,
  order_item_id  UUID REFERENCES order_items(id),
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- REFUNDS
CREATE TABLE refunds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL,
  reason        TEXT NOT NULL,
  processor_ref TEXT,
  processed_at  TIMESTAMPTZ DEFAULT now(),
  created_by    UUID REFERENCES profiles(id)
);

-- INDEXES
CREATE INDEX idx_clubs_sport         ON clubs(sport_id);
CREATE INDEX idx_products_club       ON products(club_id);
CREATE INDEX idx_products_ref        ON products(reference);
CREATE INDEX idx_variants_product    ON product_variants(product_id);
CREATE INDEX idx_orders_user         ON orders(user_id);
CREATE INDEX idx_orders_status       ON orders(status);
CREATE INDEX idx_orders_created      ON orders(created_at DESC);
CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_fund_tx_club        ON fund_transactions(club_id, created_at DESC);

-- * Enable RLS on every table (policies in a later migration)
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_info       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds            ENABLE ROW LEVEL SECURITY;
