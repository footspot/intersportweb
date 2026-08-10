# 🏆 Intersport Club IDF — E-Shop Development Guide

> **Project:** Sports Club E-Shop — Custom storefront for sports clubs equipment (wholesaler model)
> **Stack:** Nuxt 4 (LTS) + Supabase (Team + Large compute) + NuxtUI 4.6 + TailwindCSS + Pinia + PayPal/Stripe + Colissimo + Brevo
> **Theme:** Primary `#0331f9` | Secondary `#e30b0c` | Gold `#f59e0b` (fund/cagnotte)
> **Design reference:** `intersport-admin (2).html` (designer demo) + `wireframes/*.png`

> 📍 **LAST STOP — 2026-05-15** — Resuming point after context clear. Most recent work: added sortable column headers (Amount / Status / Date, asc/desc toggle) to the admin orders table — see §12.1.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Roles & Access Matrix](#2-roles--access-matrix)
3. [Architecture](#3-architecture)
4. [Environment Setup (Nuxt 4)](#4-environment-setup-nuxt-4)
5. [Database Schema](#5-database-schema)
6. [Pricing & Fund Engine](#6-pricing--fund-engine)
7. [Supabase Configuration (RLS, Edge, Realtime)](#7-supabase-configuration-rls-edge-realtime)
8. [Project Structure](#8-project-structure)
9. [Phase 1 — Foundation, Roles & Auth](#9-phase-1--foundation-roles--auth)
10. [Phase 2 — Admin: Sports & Clubs](#10-phase-2--admin-sports--clubs)
11. [Phase 3 — Admin: Products, Variants & Stock](#11-phase-3--admin-products-variants--stock)
12. [Phase 4 — Admin: Orders, Realtime & Sound, Refunds](#12-phase-4--admin-orders-realtime--sound-refunds)
13. [Phase 5 — Admin: Fund (Cagnotte) & Discount Engine](#13-phase-5--admin-fund-cagnotte--discount-engine)
14. [Phase 6 — Admin: Users, Catalog, Contact, Analytics](#14-phase-6--admin-users-catalog-contact-analytics)
15. [Phase 7 — Customer: Storefront & Product Flow](#15-phase-7--customer-storefront--product-flow)
16. [Phase 8 — Customer: Cart, Checkout, Payment, Shipping](#16-phase-8--customer-cart-checkout-payment-shipping)
17. [Phase 9 — Public Pages, Emails, Invoices](#17-phase-9--public-pages-emails-invoices)
18. [Phase 10 — i18n, Dark Mode, Polish](#18-phase-10--i18n-dark-mode-polish)
19. [Phase 11 — Infrastructure, Load Testing, Deployment](#19-phase-11--infrastructure-load-testing-deployment)
20. [Timeline & Cost Estimate](#20-timeline--cost-estimate)
21. [Appendix A — UX/UI Guidelines](#appendix-a--uxui-guidelines)

---

## 1. Project Overview

Intersport Club IDF is a **B2B2C wholesaler e-shop**: Intersport sells equipment to affiliated sports clubs, and each club's members buy their gear through a shared storefront. Club earnings are tracked as a **club fund (cagnotte)** automatically credited from sales margin, with manual adjustments available to admin.

### Customer flow (public site)
`Home` → pick sport → pick club → (password gate if protected) → browse products → add to cart (size + flocking) → login/register → checkout (card or PayPal) → order tracking + invoice.

### Back-office (admin + employee)
Dashboard with tabs: Overview · Sports & Clubs · Products · Orders · Statistics · Users · Catalog · Contact. Admin sees everything; employee is scoped (see §2).

### Key business rules
- Entity hierarchy: **sport → club → product (with size variants & stock)**. Sports **must** be created before clubs.
- Each product defines its sizes manually, and **each size carries its own stock count** — a size hitting 0 is no longer orderable.
- Per-product pricing: `buying_price` (Intersport → club) and `selling_price` (club → member). `club_fund_per_unit = selling_price − buying_price`.
- Per-product optional discount with a `source` flag: `club` (absorbed by club's margin) or `intersport` (absorbed by Intersport — club keeps full margin).
- Some clubs are **password-protected**; the customer must enter the password to reveal their product list.
- Customer must be **logged in** to pay. Admin/employee accounts can never reach the storefront checkout flow, and customers can never reach the back-office.
- Payment via **Stripe** (card) or **PayPal**. Shipping via **Colissimo**. Transactional emails via **Brevo**.
- If stock goes to 0 between cart add and payment capture (race condition on multi-item orders), the app **must auto-refund** the missing lines and keep the rest of the order valid.
- Back-office **orders view is realtime** with a configurable audio cue on every new paid order.

---

## 2. Roles & Access Matrix

Three roles, enforced in `profiles.role` + Postgres RLS + edge-function guards:

| Capability                                        | Admin | Employee | Customer |
| ------------------------------------------------- | :---: | :------: | :------: |
| Login to back-office                              |  ✅   |    ✅     |    ❌     |
| Sports CRUD                                       |  ✅   |    ❌     |    ❌     |
| Clubs CRUD (incl. password protection)            |  ✅   |    ❌     |    ❌     |
| Products CRUD (create / edit / delete)            |  ✅   |    ✅     |    ❌     |
| Update product prices, stock, discounts           |  ✅   |    ✅     |    ❌     |
| Orders: view, update status, add tracking, refund |  ✅   |    ✅     |  own only |
| Club fund (cagnotte) — view                       |  ✅   |    ❌     |    ❌     |
| Club fund — manual credit / debit                 |  ✅   |    ❌     |    ❌     |
| Users management (admin + employee accounts)      |  ✅   |    ❌     |    ❌     |
| Catalog links CRUD                                |  ✅   |    ❌     |    ❌     |
| Contact info edit                                 |  ✅   |    ❌     |    ❌     |
| Statistics & Analytics                            |  ✅   |    ❌     |    ❌     |
| Settings (app-wide)                               |  ✅   |    ❌     |    ❌     |
| Browse storefront, add to cart, pay               |  ❌   |    ❌     |    ✅     |

> **Enforcement:** every write goes through a Supabase Edge Function that re-checks `profiles.role` server-side. RLS is the second wall, not the first.
> **Route-level:** `middleware/admin.ts` gates admin-only pages; `middleware/backoffice.ts` allows `admin` OR `employee`; `middleware/customer-only.ts` blocks admins/employees from `/checkout` (pure safety — there is no business reason for them to be there).

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Nuxt 4 (SSR on edge)                     │
│ ┌────────────┐ ┌───────────┐ ┌─────────────┐ ┌────────────┐  │
│ │  Customer  │ │   Admin   │ │   Employee  │ │ Shared:    │  │
│ │  Storefront│ │ Dashboard │ │  Dashboard  │ │ i18n, dark │  │
│ │            │ │ (full)    │ │ (scoped)    │ │ mode, etc. │  │
│ └──────┬─────┘ └─────┬─────┘ └──────┬──────┘ └──────┬─────┘  │
│        │             │              │                │        │
│ ┌──────▼─────────────▼──────────────▼────────────────▼─────┐  │
│ │                     Pinia Stores                          │  │
│ │  (auth, cart, sports, clubs, products, orders-realtime,  │  │
│ │   fund, stats, ui-sound)                                 │  │
│ └────────────────────────┬─────────────────────────────────┘  │
│                          │                                    │
│ ┌────────────────────────▼─────────────────────────────────┐  │
│ │  Supabase Client (Realtime + Edge Functions + Storage)   │  │
│ └────────────────────────┬─────────────────────────────────┘  │
└──────────────────────────┼────────────────────────────────────┘
                           │
          ┌────────────────▼──────────────────┐
          │        Supabase Backend           │
          │  Postgres (RLS) · Auth · Storage  │
          │  Realtime · Edge Functions        │
          │  Plan: Team + Large compute       │
          └────────────────┬──────────────────┘
                           │
         ┌────────────┬────┴─────┬────────────┬──────────┐
         │            │          │            │          │
     ┌───▼───┐   ┌────▼───┐  ┌───▼────┐   ┌───▼────┐  ┌──▼──┐
     │ Stripe│   │ PayPal │  │Colissimo│   │ Brevo │  │ CDN │
     │ cards │   │        │  │ ship    │   │ email │  │ img │
     └───────┘   └────────┘  └─────────┘   └───────┘  └─────┘
```

### Why this shape?
- **Edge Functions are the write gate.** Every admin/employee mutation and every payment flow passes through Deno edge functions that re-verify role and validate price/stock server-side. RLS catches anything that slips through.
- **Realtime on `orders`** drives the back-office live feed (beep on new paid order).
- **SSR on edge** (Netlify/Vercel) absorbs traffic spikes far better than a single VPS — the public pages and product catalog are cacheable and served from nearest PoP; writes go to Supabase directly.

---

## 4. Environment Setup (Nuxt 4)

### Prerequisites
- Node.js **≥ 20.x LTS**
- Yarn (`npm install -g yarn`)
- Supabase CLI (`npm install -g supabase`)
- A Supabase project on **Team plan** + **Large compute add-on** (see §19)

### Dependencies already installed
```json
"nuxt": "^4.4.2",
"@nuxt/ui": "^4.6",
"@nuxtjs/supabase": "^2.0.5",
"@nuxtjs/i18n": "^10.2.4",
"@pinia/nuxt": "^0.11.3",
"pinia": "^3.0.4",
"@vueuse/nuxt": "^14.2.1",
"@nuxtjs/color-mode": "^4.0.0",
"@nuxtjs/tailwindcss": "^6.14.0"
```

### Packages to add
```bash
# Payment & shipping
yarn add @stripe/stripe-js @paypal/paypal-js

# Charts (analytics)
yarn add vue-chartjs chart.js

# PDF invoice (client-side preview + server-side generation)
yarn add pdf-lib

# Sound (native Audio API is enough; no lib needed)
# Icons (already bundled with NuxtUI)
```

### `nuxt.config.ts`
```ts
// * Nuxt 4 LTS config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/supabase',
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/i18n',
    '@vueuse/nuxt',
    '@nuxtjs/color-mode',
    '@nuxtjs/tailwindcss',
  ],

  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/', '/catalog', '/contact', '/sport/*', '/club/*', '/product/*'],
    },
  },

  i18n: {
    locales: [
      { code: 'fr', file: 'fr.json', name: 'Français' },
      { code: 'en', file: 'en.json', name: 'English' },
    ],
    defaultLocale: 'fr',
    lazy: true,
    langDir: 'locales/',
  },

  colorMode: { classSuffix: '', preference: 'system', fallback: 'light' },

  app: { head: { title: 'Intersport Club IDF' } },

  runtimeConfig: {
    stripeSecretKey: '',
    colissimoApiKey: '',
    brevoApiKey: '',
    public: {
      stripePublicKey: '',
      paypalClientId: '',
      supabaseUrl: '',
      supabaseKey: '',
    },
  },

  // * Trust proxy headers from Netlify/Vercel edge
  nitro: { preset: 'netlify' /* or 'vercel-edge' */ },
})
```

### Tailwind theme — match the HTML demo tokens
Primary `#0331f9`, Secondary `#e30b0c`, Gold `#f59e0b` (fund), Green `#10b981` (paid/margin up), Amber (pending/low-fund), Sidebar background `#0a0e27`. Typography: **Outfit** (headings) + **Sora** (body) — same as the HTML demo.

---

## 5. Database Schema

### Enums
```sql
CREATE TYPE user_role            AS ENUM ('admin', 'employee', 'customer');
CREATE TYPE order_status         AS ENUM ('pending', 'paid', 'partially_refunded',
                                          'shipped', 'delivered', 'cancelled', 'refunded');
CREATE TYPE order_line_status    AS ENUM ('ok', 'refunded_oos');   -- * oos = out of stock
CREATE TYPE payment_method       AS ENUM ('paypal', 'card');
CREATE TYPE discount_source      AS ENUM ('club', 'intersport');
CREATE TYPE fund_tx_type         AS ENUM ('auto_sale', 'manual_credit',
                                          'manual_debit', 'refund_reversal');
CREATE TYPE flocking_second      AS ENUM ('initial', 'number');
```

### Core tables
```sql
-- PROFILES (extends auth.users)
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  full_name  TEXT,
  role       user_role NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SPORTS (must be created before any club)
CREATE TABLE sports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       JSONB NOT NULL,            -- * {"fr":"Football","en":"Soccer"}
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
  access_password_hash  TEXT,            -- * bcrypt hash, set via edge function
  fund_balance          NUMERIC(12,2) NOT NULL DEFAULT 0,  -- * denormalized cagnotte solde
  sort_order            INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- PRODUCTS
CREATE TABLE products (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name                   JSONB NOT NULL,            -- * {"fr":"...","en":"..."}
  reference              TEXT NOT NULL UNIQUE,      -- * SKU-like ref for filtering/stats
  details                JSONB,
  image_path             TEXT,
  category               TEXT,                      -- * maillot | training | accessoire | lifestyle | …
  -- Pricing
  buying_price           NUMERIC(10,2) NOT NULL,    -- * Intersport -> club
  selling_price          NUMERIC(10,2) NOT NULL,    -- * club -> member
  discount_percent       NUMERIC(5,2)  DEFAULT 0,   -- * 0–100
  discount_source        discount_source,           -- * null when discount_percent=0
  -- Flocking
  flocking_enabled       BOOLEAN DEFAULT false,
  flocking_name_on_back  BOOLEAN DEFAULT false,
  flocking_second_option flocking_second DEFAULT 'initial',
  -- Visibility
  is_visible             BOOLEAN DEFAULT true,
  sort_order             INT DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT now(),
  CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CHECK (selling_price >= buying_price)             -- * fund must not be negative
);

-- PRODUCT VARIANTS (one row per product × size, owns the stock)
CREATE TABLE product_variants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       TEXT NOT NULL,                         -- * manually entered by admin/employee
  stock      INT  NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sku        TEXT UNIQUE,
  UNIQUE (product_id, size)
);

-- CATALOG LINKS (public "catalog" page)
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
  order_number      TEXT UNIQUE NOT NULL,           -- * CMD-2026-xxx (generated)
  user_id           UUID NOT NULL REFERENCES profiles(id),
  club_id           UUID REFERENCES clubs(id),      -- * order is scoped to one club
  status            order_status NOT NULL DEFAULT 'pending',
  payment_method    payment_method,
  payment_id        TEXT,                           -- * Stripe/PayPal tx id
  shipping_tracking TEXT,                           -- * Colissimo tracking
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
  -- Snapshot at purchase time
  buying_price_snapshot    NUMERIC(10,2) NOT NULL,  -- * after Intersport discount if any
  selling_price_snapshot   NUMERIC(10,2) NOT NULL,  -- * list price (before any discount)
  unit_price_paid          NUMERIC(10,2) NOT NULL,  -- * actual paid per unit (discounted)
  discount_source_snapshot discount_source,
  fund_credit_snapshot     NUMERIC(10,2) NOT NULL,  -- * credited to club per unit
  status                   order_line_status NOT NULL DEFAULT 'ok',
  -- Flocking
  flocking_name            TEXT,
  flocking_initial         TEXT,
  flocking_number          TEXT
);

-- CLUB FUND TRANSACTIONS (auto + manual)
CREATE TABLE fund_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  type           fund_tx_type NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,           -- * signed: +credit, -debit
  reason         TEXT NOT NULL,
  reference      TEXT,                              -- * linked order num / DOT ref
  order_item_id  UUID REFERENCES order_items(id),   -- * set for auto_sale / refund_reversal
  created_by     UUID REFERENCES profiles(id),      -- * null when system-generated
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- REFUNDS (one row per refund event)
CREATE TABLE refunds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,
  reason          TEXT NOT NULL,                   -- * 'out_of_stock', 'manual', ...
  processor_ref   TEXT,                             -- * Stripe/PayPal refund id
  processed_at    TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES profiles(id)
);

-- INDEXES
CREATE INDEX idx_clubs_sport          ON clubs(sport_id);
CREATE INDEX idx_products_club        ON products(club_id);
CREATE INDEX idx_products_ref         ON products(reference);
CREATE INDEX idx_variants_product     ON product_variants(product_id);
CREATE INDEX idx_orders_user          ON orders(user_id);
CREATE INDEX idx_orders_status        ON orders(status);
CREATE INDEX idx_orders_created       ON orders(created_at DESC);
CREATE INDEX idx_order_items_order    ON order_items(order_id);
CREATE INDEX idx_order_items_product  ON order_items(product_id);
CREATE INDEX idx_fund_tx_club         ON fund_transactions(club_id, created_at DESC);
```

### Triggers

**Create profile on signup** (every new auth user starts as `customer`; admin/employee accounts are provisioned through the Users admin page, which calls an edge function that sets the role).
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'customer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

**Keep `clubs.fund_balance` in sync with `fund_transactions`:**
```sql
CREATE OR REPLACE FUNCTION sync_fund_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clubs
     SET fund_balance = fund_balance + NEW.amount
   WHERE id = NEW.club_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER fund_tx_after_insert
  AFTER INSERT ON fund_transactions
  FOR EACH ROW EXECUTE FUNCTION sync_fund_balance();
```

---

## 6. Pricing & Fund Engine

This section is the business core — implement it once in an edge function and reuse everywhere (storefront preview, cart, checkout validation, post-payment fund credit, refund reversal).

### Definitions
| Term                 | Definition                                                  |
| -------------------- | ----------------------------------------------------------- |
| `buying_price`       | Price Intersport charges the club per unit (wholesale).     |
| `selling_price`      | Price the club charges its members per unit (retail).       |
| `discount_percent`   | Promotion on the product, `0` → `100`.                      |
| `discount_source`    | `club` (club absorbs it) or `intersport` (Intersport absorbs it). |
| `club_fund_per_unit` | Amount credited to the club's cagnotte per unit sold.       |

### The single formula (applied per unit)
```ts
// * Price the member pays per unit
const memberDiscountAmount = selling_price * (discount_percent / 100);
const unit_price_paid      = selling_price - memberDiscountAmount;

// * Effective buying price (Intersport discounts reduce their side; club discounts don't)
const buying_price_effective =
  discount_source === 'intersport'
    ? buying_price - memberDiscountAmount
    : buying_price;

// * Margin credited to club fund
const club_fund_per_unit = unit_price_paid - buying_price_effective;
```

**Properties of this formula:**
- No discount: `fund = selling − buying` (baseline margin). ✓
- Club discount: `fund = (selling − d) − buying = baseline − d` → **club absorbs**. ✓
- Intersport discount: `fund = (selling − d) − (buying − d) = baseline` → **club keeps full margin**. ✓
- `CHECK (selling_price >= buying_price)` guarantees fund never goes negative from a sale.

### Snapshot at checkout
Every row in `order_items` stores `buying_price_snapshot`, `selling_price_snapshot`, `unit_price_paid`, `discount_source_snapshot`, `fund_credit_snapshot` — **never** recompute from the live product, because admin/employee may change the price later.

### Fund auto-credit on payment success
The `webhook-stripe` / `paypal-capture` functions, after marking the order `paid`, insert **one `fund_transactions` row per order item** with `type='auto_sale'`, `amount = fund_credit_snapshot × quantity`, `reference = order_number`. The trigger in §5 updates `clubs.fund_balance` atomically.

### Refund reversal (out-of-stock case, §12)
When a line is refunded, insert a matching `fund_transactions` row with `type='refund_reversal'` and `amount = -fund_credit_snapshot × quantity`. The club fund self-corrects.

### Manual credit/debit (admin only)
The Users/Statistics admin page exposes "➕ Créditer" and "💳 Débiter" modals (already mocked in the HTML demo). Both call an edge function `admin-fund` that:
1. Verifies `admin` role.
2. Inserts a `fund_transactions` row with `type='manual_credit'` or `'manual_debit'`.
3. Returns the updated balance. Employee role gets 403.

---

## 7. Supabase Configuration (RLS, Edge, Realtime)

### Role helpers
```sql
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_backoffice() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','employee'));
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### RLS policies (select-only shown — writes go through edge functions)
```sql
-- Profiles: own row + admin sees all
CREATE POLICY "own profile"          ON profiles  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "admin reads profiles" ON profiles  FOR SELECT USING (is_admin());

-- Public catalog data
CREATE POLICY "public sports"        ON sports    FOR SELECT USING (true);
CREATE POLICY "public clubs"         ON clubs     FOR SELECT USING (true);
CREATE POLICY "public catalog"       ON catalog_links FOR SELECT USING (true);
CREATE POLICY "public contact"       ON contact_info  FOR SELECT USING (true);

-- Products visible to customers only when is_visible; back-office sees everything
CREATE POLICY "visible products"     ON products  FOR SELECT USING (is_visible = true);
CREATE POLICY "backoffice products"  ON products  FOR SELECT USING (is_backoffice());

-- Variants: public read (for sizes / stock display)
CREATE POLICY "public variants"      ON product_variants FOR SELECT USING (true);

-- Orders: user sees own, backoffice sees all
CREATE POLICY "own orders"           ON orders       FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "backoffice orders"    ON orders       FOR SELECT USING (is_backoffice());
CREATE POLICY "own order items"      ON order_items  FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "backoffice items"     ON order_items  FOR SELECT USING (is_backoffice());

-- Fund: ADMIN-ONLY read (employee explicitly excluded)
CREATE POLICY "admin reads fund"     ON fund_transactions FOR SELECT USING (is_admin());

-- Refunds: backoffice can read
CREATE POLICY "backoffice refunds"   ON refunds     FOR SELECT USING (is_backoffice());
```

All INSERT/UPDATE/DELETE on these tables is blocked at RLS — performed by service-role key inside Edge Functions only.

### Storage buckets
```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('sports-icons',    'sports-icons',    true),
  ('club-logos',      'club-logos',      true),
  ('product-images',  'product-images',  true),
  ('catalog-logos',   'catalog-logos',   true),
  ('invoices',        'invoices',        false);    -- * signed URLs only
```

### Edge Functions map
```
supabase/functions/
├── _shared/
│   ├── cors.ts
│   ├── auth.ts                 # * verifyAdmin / verifyBackoffice
│   ├── supabase.ts             # * service-role client
│   ├── pricing.ts              # * the formula in §6, single source of truth
│   └── email-templates/        # * fr/en HTML
├── admin-sports/               # * admin only
├── admin-clubs/                # * admin only (incl. password hashing)
├── admin-catalog/              # * admin only
├── admin-contact/              # * admin only
├── admin-users/                # * admin only — create admin/employee accounts
├── admin-fund/                 # * admin only — manual credit/debit
├── admin-stats/                # * admin only
├── backoffice-products/        # * admin + employee — CRUD products + variants + pricing
├── backoffice-orders/          # * admin + employee — status, tracking, refunds
├── club-access/                # * public — verify club password
├── cart-validate/              # * public — re-check stock + prices right before payment
├── create-checkout/            # * Stripe session (server-side price integrity)
├── paypal-create/
├── paypal-capture/
├── webhook-stripe/             # * on payment_intent.succeeded: mark paid, credit fund, decrement stock
├── refund-order/               # * auto on OOS + manual from admin/employee
├── colissimo-label/
├── generate-invoice/
└── send-order-email/           # * Brevo transactional
```

### Realtime
Enable replication for `orders` and `order_items`:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE orders, order_items;
```
The back-office subscribes to `orders` status changes; when `status` transitions to `paid`, the client plays the beep (§12) and refreshes the orders view.

---

## 8. Project Structure

```
intersport-club-shop/
├── nuxt.config.ts · tailwind.config.ts · package.json · app.vue
├── assets/css/main.css · assets/sounds/beep.mp3
├── locales/{fr,en}.json
├── components/
│   ├── layout/{AppHeader,AppFooter,LangSwitcher,ThemeToggle}.vue
│   ├── home/{SportCarousel,ClubCarousel,ProductGrid,ProductCard,
│   │         ClubPasswordModal,FlockingOptions,SizeSelector}.vue
│   ├── cart/{CartDrawer,CartItem,CartSummary}.vue
│   ├── checkout/{CheckoutForm,StripePayment,PaypalPayment,ShippingForm}.vue
│   ├── catalog/CatalogLinkCard.vue
│   ├── contact/{GoogleMap,SocialMediaIcons}.vue
│   └── admin/
│       ├── AdminSidebar.vue · AdminTopbar.vue · AdminTabs.vue
│       ├── DataTable.vue · ImageUploader.vue · ConfirmDialog.vue
│       ├── sports/SportFormModal.vue
│       ├── clubs/{ClubCard,ClubFormModal,ClubPasswordField}.vue
│       ├── products/{ProductTable,ProductFormModal,VariantStockEditor,
│       │              DiscountField,PricePreview}.vue
│       ├── orders/{OrdersTable,OrderDetailDrawer,TrackingModal,
│       │            RefundModal,RealtimeBadge,SoundToggle}.vue
│       ├── fund/{CagnotteCard,DebitModal,CreditModal,FundHistory}.vue
│       ├── users/{UserCard,UserFormModal}.vue
│       └── stats/{KpiRow,RevenueChart,SportDonut,TopProductsTable,
│                   SizeBreakdown,BestSellers,FiltersBar}.vue
├── composables/
│   ├── useEdgeFunction.ts · useCart.ts · useAuth.ts
│   ├── useRealtimeOrders.ts · useOrderSound.ts
│   └── usePricingPreview.ts
├── stores/
│   └── {auth,cart,sports,clubs,products,orders,fund,stats,uiSound}.ts
├── pages/
│   ├── index.vue · catalog.vue · contact.vue · login.vue · register.vue
│   ├── sport/[sportId].vue · club/[clubId].vue · product/[productId].vue
│   ├── checkout.vue · orders/index.vue · orders/[id].vue
│   └── admin/
│       ├── index.vue                  # * Overview (tabs host)
│       ├── sports.vue · clubs.vue     # * admin-only
│       ├── products.vue · orders.vue  # * admin + employee
│       ├── stats.vue · users.vue      # * admin-only
│       ├── catalog.vue · contact.vue  # * admin-only
│       └── settings.vue               # * admin-only
├── middleware/
│   ├── admin.ts · backoffice.ts · customer-only.ts · auth.ts
├── layouts/{default,admin}.vue
└── supabase/
    ├── config.toml · migrations/*.sql
    └── functions/ (as mapped in §7)
```

---

## 9. Phase 1 — Foundation, Roles & Auth

**Goal:** scaffold, schema live, three-role auth wired, layouts in place.

Steps:
1. Run the migration in §5 on Supabase. Apply RLS in §7. Create the five storage buckets.
2. Seed **one admin** directly in Supabase dashboard (create auth user → update `profiles.role = 'admin'`).
3. Configure `@nuxtjs/supabase` with redirect rules. Build `login.vue` and `register.vue` (registration is **customer only** — no role selector).
4. Build middlewares:
   - `middleware/admin.ts` — role === `'admin'`.
   - `middleware/backoffice.ts` — role in `('admin','employee')`.
   - `middleware/customer-only.ts` — role === `'customer'` (protects `/checkout`).
   - `middleware/auth.ts` — any authenticated user.
5. Pinia `auth` store: `user`, `profile`, `isAdmin`, `isEmployee`, `isCustomer`.
6. Build `layouts/default.vue` (customer) and `layouts/admin.vue` — the latter matches the HTML demo: dark sidebar, topbar with search/notif/dark/lang, tab row under topbar. Sidebar sections: **Principal** (Dashboard, Sports & Clubs [admin], Products), **Commerce** (Orders, Statistics [admin]), **Administration** (Users [admin], Catalog [admin], Contact [admin], Settings [admin], View site). Hide admin-only items when `isEmployee`.

---

## 10. Phase 2 — Admin: Sports & Clubs ✅

**Goal:** sports-then-clubs creation workflow with the card grid from `wireframes/clubs_wireframe.png` and the HTML demo. Admin-only.

### 10.1 Sports
- Page `/admin/sports`: data table with name (fr/en), icon, sort order. Drag-to-reorder updates `sort_order` batch. ✅
- Modal: bilingual name inputs, icon upload (`sports-icons` bucket, 256×256 recommended). ✅
- Edge function `admin-sports`: POST / PUT / DELETE. DELETE refuses if any club references the sport (FK is `ON DELETE RESTRICT`). ✅

### 10.2 Clubs
- Page `/admin/clubs`: grid of `ClubCard` (matches demo — logo, name, sport tag, product count, order count, CA, fund balance badge). ✅
- Creation modal **requires** selecting an existing sport (shows a helpful empty-state "Créez d'abord un sport" if no sports exist yet). ✅
- Fields: name, logo upload (`club-logos`), sport selector, password-protected toggle + password field. The edge function hashes the password with bcrypt before storing in `access_password_hash`. ✅
- Edit modal pre-fills everything except the password (shows "•••••" placeholder; submitting empty keeps existing hash). ✅
- Edge function `admin-clubs`: POST / PUT / DELETE + dedicated `POST /admin-clubs/reset-password`. ✅

---

## 11. Phase 3 — Admin: Products, Variants & Stock ✅

**Goal:** full product management matching `wireframes/products_wireframe.png` and the HTML demo's products table. Admin + employee both have full CRUD here.

### 11.1 Products table
Columns (per demo): **Produit** (image + name + ref), **Club**, **Prix vente**, **Réduction**, **Marge**, **Tailles**, **Flocage**, **Visible**, **Actions**. ✅
Filters: chips (Tous / [club names] / Visibles / Masqués) + "+ Nouveau" button. ✅

### 11.2 Product modal
- Bilingual name, reference, category, image upload. ✅
- **Pricing block** (live preview using `usePricingPreview`): ✅
  - `buying_price` input (€)
  - `selling_price` input (€)
  - `discount_percent` input (0–100)
  - `discount_source` radio: `Club` / `Intersport`
  - Preview card showing: member price, club fund per unit, margin %, absorbing party (with color coding).
- **Variants & stock block** — dynamic rows: ✅

  | Size (text input) | Stock (int input) | SKU (optional) | 🗑 |

  Admin can add/remove rows at will. Stock = 0 means unavailable but still listed (strike-through on storefront).
- **Flocking block**: toggle enabled → reveals `name_on_back` toggle + second option radio (`Initial` / `Number`). ✅
- **Visibility** toggle at the top. ✅

### 11.3 Edge function `backoffice-products` ✅
- `verifyBackoffice(req)` (admin OR employee). ✅
- POST creates product + variants in a single transaction. PUT updates atomically. DELETE cascades variants. ✅
- Re-validates `selling_price >= buying_price` server-side. ✅

### 11.4 Stock enforcement everywhere
- Storefront: sizes with `stock === 0` are greyed out and unclickable. *(Phase 7)*
- Cart: clamps quantity to `min(wanted, stock)`. *(Phase 7)*
- `cart-validate` edge function re-reads stock right before checkout session creation. *(Phase 8)*
- `webhook-stripe` decrements stock atomically on `paid` (see §12 for OOS fallback). *(Phase 4)*

---

## 12. Phase 4 — Admin: Orders, Realtime & Sound, Refunds ✅

**Goal:** the live back-office orders feed from `wireframes/orders_wireframe.png` and the demo.

### 12.1 Orders view
- Table with status filter chips (Tout / Payé / En attente / Expédié). Columns: numéro, client, club, articles, montant, statut, date, actions (Suivi Colissimo, Détail, Rembourser). ✅
- `OrderDetailDrawer` shows items with flocking, buying/selling prices, fund credited, refund history, invoice link. ✅ *(invoice link in Phase 9)*
- `TrackingModal`: input Colissimo tracking (13 chars), auto-build `https://www.laposte.fr/outils/suivre-vos-envois?code=<tracking>`, save via `backoffice-orders`. ✅
- 📍 **2026-05-15 — Sortable column headers** added to `app/components/admin/orders/Table.vue`: Amount / Status / Date columns toggle ascending ↔ descending on click; default sort = Date desc. ✅ ← **last stop before context clear**

### 12.2 Realtime ✅
```ts
// composables/useRealtimeOrders.ts
const client = useSupabaseClient()
const channel = client
  .channel('orders-stream')
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'status=eq.paid' },
      (payload) => {
        ordersStore.prepend(payload.new)
        if (uiSound.enabled.value) uiSound.play()
        toast({ title: 'Nouvelle commande', description: `${payload.new.order_number} — €${payload.new.total}` })
      })
  .subscribe()
```

### 12.3 Beep sound ✅
- ~~Asset: `assets/sounds/beep.mp3`~~ → Synthesised via Web Audio API (no asset file needed). 3 short beeps @ 880 Hz. ✅
- Pinia `uiSound` store: `enabled: boolean`, `volume: 0..1`. Persisted per user via `useStorage('ui-sound', {...})` (@vueuse). ✅
- `components/admin/orders/SoundToggle.vue` in the topbar: mute button + volume slider. ✅
- `composables/useOrderSound.ts`: ✅
  ```ts
  export function useOrderSound() {
    const { enabled, volume } = useUiSoundStore()
    const audio = new Audio('/sounds/beep.mp3')
    function play() {
      if (!enabled) return
      audio.volume = volume
      audio.currentTime = 0
      audio.play().catch(() => {/* * autoplay blocked until first user gesture */})
    }
    return { play }
  }
  ```
- Works for both `admin` and `employee` (all back-office users).

### 12.4 Refunds — automatic OOS handling (multi-product orders) ✅ *(RPC ready; webhook wiring in Phase 8)*
**When it fires:** inside `webhook-stripe` / `paypal-capture`, right after the payment is confirmed, the function:
1. Starts an RPC transaction `process_paid_order(order_id)` that locks relevant `product_variants` rows (`FOR UPDATE`).
2. For each `order_items` line, attempts `UPDATE product_variants SET stock = stock - quantity WHERE id = variant_id AND stock >= quantity`.
3. Collects lines where the update affected 0 rows → these are **out of stock**.
4. For OOS lines:
   - Mark `order_items.status = 'refunded_oos'`.
   - Compute refund amount = `unit_price_paid × quantity`.
   - Insert `refunds` row.
   - Call Stripe/PayPal refund API via `refund-order` function.
   - Insert `fund_transactions` row with `type='refund_reversal'`, negative amount.
   - Accumulate `orders.refund_total`.
5. For the remaining healthy lines, insert `fund_transactions` rows with `type='auto_sale'` (fund auto-credit).
6. Update `orders.status`:
   - All lines OOS → `refunded` + `cancelled`.
   - Some lines OOS → `partially_refunded`.
   - No OOS → `paid`.
7. Trigger `send-order-email` with the appropriate template.

> **Note:** with the §11 pre-checkout `cart-validate` plus stock-gated UI, this scenario is rare — but it's the exact safety net the client asked for after Wix misbehaved.

### 12.5 Manual refund (admin/employee) ✅
`RefundModal` in the drawer → picks lines to refund → calls `refund-order` which performs the same steps as §12.4 for the chosen lines (no stock decrement, since stock was already taken — optionally **re-increment** stock, toggled by a checkbox "Remettre en stock"). ✅

---

## 13. Phase 5 — Admin: Fund (Cagnotte) & Discount Engine ✅

**Goal:** the fund section from the HTML demo (`renderCagnottes`), **admin-only** (employee page returns 403).

### 13.1 Cagnotte grid (admin Stats page or dedicated `/admin/fund` tab)
- Grid of `CagnotteCard`: club logo, name, sport, current `fund_balance` (color-coded green/amber/red by threshold), recent history (last 3 tx), buttons **💳 Débiter / ➕ Créditer**. ✅
- History is paginated from `fund_transactions` ordered by `created_at DESC`. ✅
- ~~Export generates a PDF of all fund transactions for the club~~ → deferred to Phase 6 (`admin-stats` edge function).

### 13.2 Debit/Credit modals ✅
Match the HTML demo exactly (gold for debit, green for credit, live before/after preview). Motifs preselected:
- Debit: Achat maillots, Achat équipement training, Achat accessoires, Achat chaussures, Commande flocage, Autre matériel. ✅
- Credit: Dotation annuelle, Bonus performance, Correction, Remboursement, Autre. ✅

Edge function `admin-fund` (admin only): ✅
```ts
// POST /admin-fund
// body: { club_id, type: 'manual_credit'|'manual_debit', amount, reason, reference?, note? }
```
Inserts a `fund_transactions` row; the trigger updates `clubs.fund_balance`. Returns the new balance. ✅

### 13.3 Discount engine (already covered in §6 + §11) ✅
The rules live in `_shared/pricing.ts` and are reused in:
- Admin product modal (live preview). ✅
- Storefront product page (display). *(Phase 7)*
- Cart total computation. *(Phase 7)*
- `cart-validate` (server re-check). *(Phase 8)*
- `webhook-stripe` (fund credit snapshot). *(Phase 8)*

---

## 14. Phase 6 — Admin: Users, Catalog, Contact, Analytics ✅

All four are **admin-only**.

### 14.1 Users (provisioning admin + employee accounts) ✅
- Page `/admin/users`: grid of user cards (layout = HTML demo, but content fixed — it's about **admin/employee** accounts, not customers, as you noted). ✅
- Form fields: first name, last name, email, **role** (Admin / Employee), active toggle. ✅
- Edge function `admin-users`: ✅
  - POST creates the auth user via `supabase.auth.admin.createUser({ email, email_confirm: true })`, then updates `profiles.role`. Returns a temporary password + magic link for the admin to forward. *(Brevo invite deferred to Phase 9.)* ✅
  - PUT updates role / active. Cannot demote the last admin (server-side check). ✅
  - DELETE does a soft-delete (set `active=false` on profile + `ban` the auth user). ✅
- **Customers are NOT managed here.** They self-register on the storefront and cannot be edited from this page. ✅

### 14.2 Catalog (public page content) ✅
- `/admin/catalog`: table of catalog links (name fr/en, URL, logo, sort order). ✅
- Edge function `admin-catalog`. ✅

### 14.3 Contact ✅
- `/admin/contact`: single form editing the singleton `contact_info` row — address, phone, email, Google Maps embed URL, dynamic list of social media (platform, URL, icon). ✅
- Edge function `admin-contact`. ✅

### 14.4 Statistics & Analytics (admin only) ✅
From `wireframes/stats_wireframe_1.png` and `_2.png` + the demo's Stats tab.

**KPI row:** Total CA, Total Orders, Average basket, Number of active products, Total fund across clubs. ✅

**Filters bar:** period (7d / 30d / 90d / 12m), **club**, **product reference** (free text), **category**. All filters compose. ✅

**Charts:**
- Revenue & margin bar chart. ✅ *(dependency-free SVG)*
- CA by sport donut. ✅ *(dependency-free SVG)*
- Best sellers table (product, club, ref, qty sold, revenue, margin). ✅
- **Sales by size** breakdown (horizontal bar list, critical for re-stocking decisions). ✅

**Edge function `admin-stats`:** single POST endpoint accepting the filter payload, returning a JSON blob with all chart data pre-aggregated server-side. ✅

**Offline cache (optional):** IndexedDB via `idb` — deferred; not wired in MVP.

---

## 15. Phase 7 — Customer: Storefront & Product Flow ✅

**Goal:** signature UX from `home-wireframe.html` / `home-wireframe_carousel.html`.

### 15.1 Home — sport → club → products
- **Sport carousel** (horizontal) — cards with icon + name. ✅
- **Club carousel** (vertical "slot machine" animation) — appears after a sport is picked. ✅
- **Product grid** drops in like a **curtain** (`translateY(-100%) → 0` with `cubic-bezier(.22,1,.36,1)`, 0.6 s). ✅
- Password-protected clubs show `ClubPasswordModal` before the curtain drop; password verified via the public `club-access` edge function (compares bcrypt hashes, issues short-lived HMAC token). ✅

### 15.2 Product card & detail
- `ProductCard`: image, name, price (with strike-through when discounted), hover lift. ✅
- Product detail (page `product/[productId]`): gallery, details, **size selector** (greyed-out when variant stock = 0), flocking options (only if `flocking_enabled`). ✅
- `FlockingOptions.vue`: "Nom au dos" (text input), then either "Initiale" (single letter) or "Numéro" (int) depending on `flocking_second_option`. ✅

### 15.3 Cart
- `CartDrawer` slide-out with line list (product, size, flocking details, qty stepper clamped to stock). ✅
- Pinia `cart` store persists to `localStorage` via `useStorage`. ✅
- `CartSummary`: subtotal, shipping estimate, total. ✅

---

## 16. Phase 8 — Customer: Cart, Checkout, Payment, Shipping ✅

**Goal:** secure payment with server-side price/stock integrity.

### 16.1 Checkout page (`/checkout`) ✅
- `middleware/auth.ts` + `middleware/customer-only.ts` → only logged-in customers. ✅
- Shipping form, cart summary, payment selector (Bank transfer / Card / PayPal). ✅
- On "Pay" button click, the client calls `cart-validate` **first**: server re-reads every variant's stock and product's prices, rejecting any line whose stock dropped or price changed (returns the diff so the UI can explain). ✅

### 16.2 Stripe ✅
- `checkout-start` (provider=stripe) builds a Stripe Checkout Session from the server-validated items (never trust client prices). Success URL → `/orders/[id]`. ✅
- `webhook-stripe` listens for `checkout.session.completed` → runs `process_paid_order` (§12.4). HMAC signature verified when `STRIPE_WEBHOOK_SECRET` is set. ✅
- **Requires env vars on the edge functions:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

### 16.3 PayPal ✅
- `checkout-start` (provider=paypal) creates a PayPal order server-side and returns the approve URL. ✅
- `paypal-capture` captures on approval → runs `process_paid_order`. ✅
- **Requires env vars:** `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, optional `PAYPAL_API_BASE` (sandbox by default).

### 16.4 Bank transfer (default, works out of the box) ✅
- `provider=bank_transfer` → pending order + bank details returned to the customer (/orders/[id] shows the instructions).
- Admin flips the order to `paid` from /admin/orders once the wire arrives — that transition is already wired via backoffice-orders and will be connected to `process_paid_order` via the admin UI in a follow-up.
- **Requires env vars:** `BANK_TRANSFER_BENEFICIARY`, `BANK_TRANSFER_IBAN`, `BANK_TRANSFER_BIC`.

### 16.5 Colissimo
- After `shipped_at` is set by admin/employee and a tracking number is saved, `colissimo-label` (optional) can generate the actual label if we wire Colissimo API keys. Initially the flow is manual (admin ships physically, pastes tracking number). ✅ *(manual tracking wired in Phase 4)*
- Shipping cost: flat rate (6.90 €) at launch; configurable in a future settings page.

---

## 17. Phase 9 — Public Pages, Emails, Invoices ✅

### 17.1 Catalog page (`/catalog`) ✅
Grid of `CatalogLinkCard` → external URLs open in new tab. ✅

### 17.2 Contact page (`/contact`) ✅
Google Maps embed using the stored URL, address/phone/email block, social media icons row. ✅ *(contact form via Brevo deferred — not in MVP)*

### 17.3 Transactional emails (Brevo) ✅
Bilingual HTML templates inlined in the `send-order-email` edge function (fr + en). Triggered from the edge functions that mutate order state (cleaner than a pg trigger → avoids `pg_net` dependency):
1. **Order confirmation** — on `paid` / `partially_refunded`, fired from `webhook-stripe` after `process_paid_order` AND from `backoffice-orders` when admin flips a bank-transfer order to `paid`. Includes line list, flocking, OOS refund detail. ✅
2. **Shipping confirmation** — fired by `backoffice-orders` on `shipped` transition or tracking save. Includes Colissimo tracking link. ✅
3. **Delivery confirmation** — on `delivered`. ✅
4. **Refund notification** — fired by `refund-order` on any manual refund + by `backoffice-orders` on `refunded` status transition. ✅
- **Requires env vars:** `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, optional `SITE_URL` for the "View order" button in the email.

### 17.4 Invoices ✅
`generate-invoice` edge function renders a PDF via `pdf-lib@1.17.1` (bilingual, brand colors, line items with flocking, refunds separately), stores in the private `invoices` bucket under `YYYY/<order_number>.pdf`, saves the path on `orders.invoice_path`, and returns a signed URL (24 h TTL). Idempotent — subsequent calls reuse the existing file unless `{ regenerate: true }`. Customer downloads from `/orders/[id]`; back-office downloads from the admin order drawer. Also auto-generated when a payment succeeds (webhook / admin mark-paid). ✅

---

## 18. Phase 10 — i18n, Dark Mode, Polish ✅

- Complete `locales/fr.json` and `en.json`. All UI strings via `$t()`. Product/sport names via `name[locale]`. ✅
- Language switcher in customer header + admin topbar. ✅
- Dark mode through `@nuxtjs/color-mode`; every custom component has `dark:` variants (palette reused from the HTML demo). ✅
- Page transitions (`page` + `layout`, 250ms, cubic-bezier) configured in `nuxt.config.ts`. ✅
- NuxtUI toasts via `UApp` root wrapper (`app.vue`). ✅
- Loading skeletons via `UiSkeleton.vue` component. ✅
- Empty states on every list/grid (sports, clubs, products, orders, cagnottes, users, catalog, stats, cart). ✅
- Custom `error.vue` covering 404/403/generic with locale-aware copy. ✅
- Responsive pass: mobile menu in header, `grid-cols-2 sm: lg:` breakpoints across product grids, snap-x carousel on sports. ✅
- Lighthouse audit ≥ 90: run after deploy; storefront pages are mostly static/cacheable so score expected to pass without further tuning.

---

## 19. Phase 11 — Infrastructure, Load Testing, Deployment

### 19.1 Supabase sizing (for the 10k concurrent / 2k sales in 20 min spike)

| Concern                           | Recommendation                                                              |
| --------------------------------- | --------------------------------------------------------------------------- |
| Plan                              | **Team** ($599/mo) — SOC 2, 28 days point-in-time recovery, SLA.            |
| Compute add-on                    | **Large** ($110/mo) — 4 vCPU / 16 GB RAM. Headroom 4× the observed peak.    |
| Read replica (optional)           | One read replica to offload analytics + storefront reads during a spike.    |
| Realtime channel limit            | Team plan supports plenty for back-office fan-out; storefront doesn't subscribe to orders. |
| Connection pooler                 | Use Supavisor/PgBouncer transaction mode for edge functions.                |
| Edge functions concurrency        | Deploy with sufficient invocations — payment webhooks must never 429.       |
| Storage bandwidth                 | Images served via Supabase CDN; large catalog events benefit from Nuxt Image transformation + caching. |

> If bursts consistently exceed 10k concurrent, consider **XL compute** ($210/mo) and a second read replica. The numbers above give roughly **4× headroom** on the observed peak — exactly what the client asked for.

### 19.2 Frontend hosting — SSR on edge CDN (Netlify or Vercel)

**Go with Netlify or Vercel**, not a VPS. Reasons:
- A single VPS (even large) is one machine — it caps at its bandwidth and connection count. During a 10k concurrent spike, any blip takes the whole site down.
- Netlify/Vercel serve SSR on a global edge network. Cacheable routes (`/`, `/catalog`, `/contact`, `/sport/*`, `/club/*`, `/product/*`) are served from cache at PoPs close to the user; only the checkout flow and back-office hit origin compute.
- Automatic horizontal scaling, zero ops burden, great DX with Nuxt.
- Pricing for high-traffic is predictable (both have pay-as-you-go tiers; Netlify Pro $19/mo + overage, Vercel Pro $20/mo + overage).

**Recommendation: Netlify Pro** (or Vercel Pro if the team prefers Vercel's tooling) with Nuxt's Nitro `netlify` / `vercel-edge` preset. The storefront is almost entirely cacheable, so cost stays low.

### 19.3 Performance hardening
- Nuxt Image with Supabase transforms for product images.
- Aggressive `stale-while-revalidate` on public catalog routes.
- `useAsyncData` with short TTL for `sports` and `clubs` (they change rarely).
- Lazy-load the back-office bundle (separate chunk; never ships to customers).
- Rate limit `club-access` by IP to prevent password brute-force.

### 19.4 Load testing pre-launch
Use **k6** or **Artillery** to simulate the expected burst:
- Ramp to 10k VUs in 5 minutes, hold 20 minutes.
- Mix: 80 % browse, 15 % add-to-cart, 5 % checkout.
- Watch Supabase dashboard for CPU, connection saturation, slow queries; tune compute if needed.

### 19.5 Deployment pipeline
- Nuxt deployed to Netlify/Vercel, env vars set in the dashboard (never commit `.env`).
- `supabase db push` / `supabase functions deploy <name>` from CI.
- Stripe + PayPal production webhooks pointed to the production edge functions.
- Custom domain + SSL via the host.

---

## 20. Timeline & Cost Estimate

> Same Claude Code x5 methodology as before — scaffolding, CRUD, edge functions, i18n are generated fast; your time goes to reviewing, payment sandbox testing, load tests, and client feedback.

### Phase plan (dev order: admin first, then customer)

| Phase | Scope                                                     | Days |
| :---: | --------------------------------------------------------- | :--: |
| 1     | Foundation, 3-role auth, layouts, middlewares             | 1.0  |
| 2     | Admin: Sports + Clubs (wireframes)                        | 1.0  |
| 3     | Admin: Products + variants/stock + pricing engine         | 1.5  |
| 4     | Admin: Orders + realtime + sound + refund flow            | 1.5  |
| 5     | Admin: Fund/cagnotte + discount engine integration        | 0.75 |
| 6     | Admin: Users, Catalog, Contact, Analytics (w/ size stats) | 1.25 |
| 7     | Customer storefront + carousel + product detail           | 1.5  |
| 8     | Cart, checkout, Stripe, PayPal, Colissimo                 | 1.5  |
| 9     | Public catalog + contact + emails + invoices              | 0.75 |
| 10    | i18n, dark mode, polish                                   | 1.0  |
| 11    | Infra sizing, load test, deploy                           | 1.25 |
|       | **Client buffer (revisions, bugs)**                       | 1.0  |
|       | **TOTAL**                                                 | **~13 working days** |

### Cost estimate

| Item                                 | Amount                               |
| ------------------------------------ | ------------------------------------ |
| Development (13 days × $500/day)     | **$6,500** (recommended quote)       |
| Supabase Team plan                   | $599/month                           |
| Supabase Large compute add-on        | $110/month                           |
| Netlify/Vercel Pro                   | ~$20/month + overage                 |
| Brevo (transactional email)          | Free up to 300/day                   |
| Stripe fees                          | 1.4 % + €0.25 (EU cards)             |
| PayPal fees                          | ~2.9 % + €0.35                       |
| Colissimo                            | Per label                            |
| Domain                               | ~$15/year                            |

| Scenario                       | Days | Price       |
| ------------------------------ | :--: | :---------: |
| Tight (minimal buffer)         |  11  | **$5,500**  |
| **Recommended**                |  13  | **$6,500**  |
| Comfortable (extra polish + load-test iterations) | 15 | **$7,500** |

---

## Appendix A — UX/UI Guidelines

### Design tokens (from the HTML demo)
- Fonts: **Outfit** (headings), **Sora** (body).
- Primary `#0331f9`, Primary-dark `#0225c4`, Primary-light `#3a5fff`, Secondary `#e30b0c`, Green `#10b981`, Amber `#f59e0b` (gold for fund), Purple `#8b5cf6`, Sidebar `#0a0e27`.
- Radius `14px`, shadows sm/md/lg per demo.
- Micro-interactions: ripple on buttons, card lift on hover, counter animations on KPIs, bar chart grow-in, donut segment animation, modal pop-in.

### Storefront signature motions
- **Sport carousel** horizontal swipe/drag.
- **Club carousel** vertical slot-machine transition.
- **Product grid** curtain drop (0.6 s, `cubic-bezier(.22,1,.36,1)`).

### Admin signature pieces
- Dark collapsible sidebar (260 → 64 px) with sections Principal / Commerce / Administration.
- Topbar with search dropdown, notification panel, dark toggle, language switcher, **sound toggle + volume slider**.
- Tab row under topbar to switch dashboard views inside `/admin/index`.
- Cagnotte cards with gradient accent stripe, expandable history.
- Realtime toast + beep on new paid order.

### Principles
1. Spacious card layouts, never Wix-style crowding.
2. Primary blue for CTAs, secondary red for alerts/danger only.
3. Dark mode uses proper surface colors (`#07091a` background, `#0f1428` cards) — not just inverted.
4. Mobile-first; sport/club carousels must feel premium on mobile.
5. Always show the *absorbing party* for a discount — the client must never lose sight of who's paying for a promotion.

---

*Document updated: April 2026 — covers Nuxt 4 LTS, 3-role auth (admin/employee/customer), per-variant stock, pricing & discount engine, realtime back-office with sound, multi-product OOS refund flow, analytics with size breakdown, and Supabase Team + Large compute + Netlify/Vercel edge deployment.*
