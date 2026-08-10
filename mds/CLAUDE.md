# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Intersport Club IDF — a **B2B2C wholesaler e-shop**. Intersport sells sports equipment to affiliated clubs; each club's members buy gear through a shared storefront. Sales margin is auto-credited to a per-club **fund (cagnotte)**. Entity hierarchy is **sport → club → product (with per-size stock variants)**; sports must exist before clubs.

## Commands

Package manager is **yarn** (`yarn@1.22.22`, pinned in `package.json`).

```bash
yarn dev        # dev server on http://localhost:3000
yarn build      # production build
yarn generate   # static generate
yarn preview    # preview a production build
```

Deploy (front-end → Netlify): `npx netlify-cli build && npx netlify-cli deploy --prod` (publishes `dist/`).

There is **no test suite** and no lint script.

## Supabase

Project ref `hznvltijxkeadqpwctop`. The CLI is linked once (`supabase link --project-ref hznvltijxkeadqpwctop`); apply DB changes with `supabase db push` and deploy edge functions individually. Migrations and edge functions for **this** project are applied/deployed directly — only Footspot-side work is left to others.

## Architecture

Two halves: a **Nuxt 4 SPA** (`app/`) and a backend of **42 Supabase Edge Functions** (`supabase/functions/`) over Postgres.

### Write path — edge functions are the only mutation layer
The browser never writes to Postgres directly. Every admin/employee/checkout mutation goes through an edge function via the `invokeEdge()` composable (`app/composables/useEdgeFunction.ts`), which normalizes errors into `{ data, error }`. Each function follows the same shape (see `supabase/functions/admin-sports/index.ts` as the canonical example):

1. `handlePreflight(req)` — CORS preflight (`_shared/cors.ts`; origin allowlist).
2. `verifyAdmin(req)` / `verifyBackoffice(req)` (`_shared/auth.ts`) — re-reads `profiles.role` server-side with the service-role client. RLS is the *second* wall, not the first.
3. `serviceClient()` (`_shared/supabase.ts`) for the actual DB work.
4. Sub-actions are routed off the **URL path segment** (`/admin-sports/reorder`), not a body field.

Image-handling functions accept `multipart/form-data` (`data` JSON part + file part); storage upload and DB write are paired so a failure of either rolls back the other (no orphaned files).

Shared edge code lives in `supabase/functions/_shared/`: `auth.ts`, `cors.ts`, `supabase.ts`, `multipart.ts`, `pricing.ts`, `emails/` (Brevo), `footspot/` (HMAC/cipher/inbound).

### Webhook / callback functions skip JWT verification
`supabase/config.toml` sets `verify_jwt = false` for server-to-server endpoints (`systempay-ipn`, `generate-colissimo-label`, `colissimo-tracking-worker`, Footspot pairing/push/retry, shop-personalization `update-shop-config` / `update-product-discounts` / `footspot-disconnect`, `club-products`, `club-stats`). These authenticate themselves via HMAC signature, an `X-Internal-Call` header, or a per-club Bearer token instead.

### Front-end
- `app/stores/*` — Pinia stores, roughly one per domain table; the data layer the pages bind to.
- `app/composables/*` — `invokeEdge`, realtime orders, notifications, pricing preview, order sound.
- `app/middleware/` — route guards: `admin.ts` (admin-only pages), `backoffice.ts` (admin **or** employee), `auth.ts` (any back-office user). All client-side; they redirect to `/admin/login`.
- `app/plugins/auth-init.client.ts` — loads `profiles` on boot and on Supabase auth events.
- `app/stores/auth.ts` — single source of truth for role checks (`isAdmin`, `isBackoffice`).

### Roles
Only **`admin`** and **`employee`** exist (the `customer` role was dropped — `20260512163500_drop_customer_role.sql`). The storefront has **no customer login**: checkout is guest-only and orders are retrieved via magic link. Back-office users cannot reach checkout; there are no customer accounts.

### Pricing
`supabase/functions/_shared/pricing.ts` (`computeUnitPricing`) is the **single source of truth** for price and fund math — `club_fund_per_unit = unit_price_paid − buying_price_effective`. Discounts carry a `source`: `club` (absorbed by club margin) or `intersport` (absorbed by Intersport, club keeps full margin). Never recompute pricing inline anywhere — previews, cart totals, checkout snapshots, and fund credits all reuse this module.

## Conventions

- **Comments:** use `// *` (and `// ?` for asides) — not bare `//`.
- **i18n:** all user-facing text goes through `@nuxtjs/i18n`; translation files are `i18n/locales/{fr,en}.json`. Default locale is `fr`. Keep button/label/input strings short.
- **Styling:** Tailwind v4 ships via `@nuxt/ui` (`@tailwindcss/vite`) — there is no separate Tailwind module; theme lives in `app/assets/css/main.css`. Theme colors: primary `#0331f9`, secondary `#e30b0c`, gold `#f59e0b` (fund).
- **Secrets:** `NUXT_PUBLIC_*` env vars are exposed to the browser bundle — never put a secret behind that prefix. Server-only secrets go in `runtimeConfig` (non-`public`). See `.env.example`.

## External integrations

- **Payments:** SystemPay / Lyra — embedded Smartform (`@lyracom/embedded-form-glue`) on the client, `systempay-ipn` webhook for capture. Handles card + PayPal + wallets through one form. No Stripe.
- **Shipping:** Colissimo — label generation + a polling worker (`colissimo-tracking-worker`) that auto-advances order status; three delivery methods (Colissimo home delivery, club pickup, Intersport shop pickup).
- **Email:** Brevo — HTML templates in `_shared/emails/templates/` with `<!--SUBJECT: …-->` and `{{var}}` placeholders, dispatched via `_shared/emails/send.ts`.
- **Footspot:** club-management platform integration — prepaid purchase codes, shop personalization, stock sync. See `FOOTSPOT_INTEGRATION.md`.

`order_status` enum: `pending`, `pending_bank_transfer`, `paid`, `partially_refunded`, `shipped`, `delivered`, `cancelled`, `refunded`. If stock hits 0 between cart-add and capture, the missing lines are auto-refunded (`order_line_status` = `refunded_oos`) and the rest of the order stays valid.

## Reference docs

Long-form design/spec docs live at the repo root. Note they can lag the code — verify against migrations and edge functions when they disagree (e.g. older docs mention Stripe and customer logins).

- `DEVELOPMENT_GUIDE.md` — overall spec, schema, phase log.
- `FOOTSPOT_INTEGRATION.md`, `SHOP_PERSONALIZATION_GUIDE.md` — Footspot.
- `PAYMENT_COLISSIMO_GUIDE.md`, `PAYMENT_COLISSIMO_DEBUG.md` — payment + shipping.
- `GUEST_CHECKOUT_GUIDE.md`, `NOTIFICATIONS_BELL.md` — checkout flow, admin notifications.
