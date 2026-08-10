# Payment & Delivery Integration Guide

> **Dependency order**: Payment must be fully operational before any delivery method is wired up.

There are **three delivery methods**, each independently enabled per club from the admin panel for that club's shop page:

| Method | Carrier | Cost to customer | State chain |
|---|---|---|---|
| **Colissimo** | La Poste | paid (computed shipping) | `paid` → label auto-generated → admin hands to La Poste → `shipped` → polling → `delivered` |
| **Club pickup** | Intersport's own trucks | free | `paid` → admin truck-delivers to club → admin marks ready → `awaiting_pickup` → customer collects → admin marks → `picked_up` |
| **Intersport shop pickup** | Intersport's own trucks | free | `paid` → admin truck-delivers to chosen shop → admin marks ready → `awaiting_pickup` → customer collects → admin marks → `picked_up` |

Footspot dispatch is centralized via the order trigger — every status transition fires `order.status_changed` whenever the order is linked to a Footspot member, regardless of delivery method. No delivery-specific Footspot code paths.

---

## Part 1 — Payment

### Overview

**Guest checkout only.** Customers are NOT required to log in or create an account to place an order — accounts add friction and most e-shops avoid them on the payment path. **The client has decided NOT to offer customer account creation at all** (2026-05-19 decision). There is no post-purchase "Create an account" CTA, no `/register` flow for customers, no order-history page. Order tracking, confirmation, and shipment-status emails all work for guests via signed magic links emailed to them — that is the only retrieval mechanism customers have.

The DB already supports three payment methods via the `payment_method` enum:

| Method | Processor | Flow |
|---|---|---|
| `card` | SystemPay (Lyra Smartform) | IPN webhook confirms payment |
| `paypal` | SystemPay (Lyra Smartform) | IPN webhook confirms payment |
| `bank_transfer` | Manual | Admin confirms in backoffice |

Card and PayPal share a single integration: the Lyra Smartform renders every method activated on the merchant's bank contract (card, PayPal, Apple Pay, Google Pay, …). The `payment_method` value stored on the order reflects what the customer actually used — extracted from the IPN payload after Lyra notifies us of the result.

All three methods share the same outcome: `orders.status = 'paid'` + `orders.paid_at = now()`.

---

### 1.0 Sandbox & dev environment

Before any production deployment, every credential below must exist in **test mode** (sandbox) so the full chain can be exercised end-to-end without real money.

#### SystemPay (test credentials — required, supplied by the bank)
SystemPay has **no public/shared sandbox**. The test credentials are issued by the merchant's bank (BPCE → Banque Populaire / Caisse d'Épargne in our case) when the contract is opened. To obtain them:
1. Log into the **Back Office Marchand** (the bank's white-labelled SystemPay portal).
2. Toggle to **"Test"** mode (top-right selector).
3. Under *Settings → Shop → REST API keys*, you'll find the test versions of:
   - `SYSTEMPAY_USERNAME` (numeric shop id — same as prod)
   - `SYSTEMPAY_PASSWORD` → starts with `testprivatekey_…`
   - `SYSTEMPAY_PUBLIC_KEY` → format `<shopId>:testpublickey_…`
   - `SYSTEMPAY_HMAC_KEY` → the **test** HMAC flag (separate from the prod flag)
4. Under *Settings → Notification rules → IPN*, enable the **End-of-payment IPN** for **test** mode and point it at `https://<dev-domain>/functions/v1/systempay-ipn`. Activate retries.
5. Lyra publishes test card numbers (e.g. `4970100000000003` for VISA-success); use those for local development.

> **What the dev needs from the bank**: the four `SYSTEMPAY_*` test variables and the test endpoint host. Without these, no integration testing is possible.

#### Brevo (already configured for the project)
The project already calls Brevo from `supabase/functions/send-order-email/index.ts`. The required env vars (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`) are already set as Supabase secrets. New email-sending Edge Functions reuse the same Brevo HTTP client — no additional setup.

#### Colissimo SLS sandbox
La Poste exposes a sandbox under `https://ws.colissimo.fr/sandbox/sls-ws/SlsServiceWS/2.0`. The same `apikey` works for both modes — no separate sandbox key. For local testing, use this real address (provided by the client):
```
Imp. des Broderies, 78310 Coignières, France
```
Coignières is in Yvelines (Île-de-France); Colissimo accepts it as a normal `DOM`/`DOS` destination. Use it as the recipient address in label-generation tests.

#### Suivi v2 (free, no sandbox needed)
The free tier on `developer.laposte.fr` issues a single `X-Okapi-Key` that works for both real and test parcel numbers. There is no separate test environment — for development, generate a real label in the SLS sandbox and poll its parcel number against Suivi v2.

---

### 1.1 Prerequisites

#### SystemPay (Lyra)
- Intersport's bank issues the SystemPay merchant contract — confirm with them which payment methods are activated (card is always on; PayPal, Apple Pay, Google Pay are opt-in)
- Log into the **Back Office Marchand** of the bank's white-labelled SystemPay portal (e.g. `secure.systempay.fr/vads-merchant/`)
- Under *Settings → Shop → REST API keys*, retrieve:
  - `SYSTEMPAY_USERNAME` — numeric shop id (e.g. `12345678`)
  - `SYSTEMPAY_PASSWORD` — REST private key (`testprivatekey_…` for sandbox, `prodpassword_…` for production); keep server-side only
  - `SYSTEMPAY_PUBLIC_KEY` — public key for the JS Smartform (format `12345678:testpublickey_…`)
  - `SYSTEMPAY_HMAC_KEY` — HMAC-SHA256 key used to verify IPN payloads and the browser-side `kr-hash`. Two flags exist (test / prod) — make sure the one configured matches the password mode in use
- Under *Settings → Notification rules → Instant Payment Notification*, enable the **End-of-payment IPN** and set the URL to `{APP_URL}/functions/v1/systempay-ipn`. Keep retries on failure enabled
- The endpoint host (e.g. `api.systempay.fr`, `api.lyra.com`, or a bank-specific subdomain) is shown on the same Back Office page — store as `SYSTEMPAY_ENDPOINT` (without `https://`)

#### Bank Transfer
- No external credentials needed — purely internal flow

---

### 1.2 DB Migration — Payment

#### Order number scheme
The existing project already mints order numbers via `orderNumber()` in `supabase/functions/checkout-start/index.ts`:
```
CMD-{YYYY}-{6-char base36 random uppercase}    e.g. CMD-2026-A7K3M9
```
This fits comfortably inside SystemPay's 32-char `orderId` ceiling (14 chars total) and is ASCII-alphanumeric, which Lyra accepts. Keep this scheme. If the test integration ever surfaces a Lyra rejection on the `orderId` field, switch to a strict sequence like `CMD-{YYYYMMDD}-{6-digit zero-padded sequence}` backed by a Postgres `SEQUENCE`.

#### Guest checkout columns on `orders`

`user_id` becomes nullable. For guest orders, identity is stored directly on the row, and a UUID `access_token` is generated for magic-link access.

```sql
ALTER TABLE public.orders
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN guest_email       text,
  ADD COLUMN guest_first_name  text,
  ADD COLUMN guest_last_name   text,
  ADD COLUMN access_token      uuid NOT NULL DEFAULT gen_random_uuid();

-- * Either user_id OR guest_email must be set
ALTER TABLE public.orders
  ADD CONSTRAINT orders_owner_check
  CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

-- * Lookup index for the magic-link order page (UUIDv4, unguessable)
CREATE UNIQUE INDEX orders_access_token_idx ON public.orders(access_token);

-- * Used by post-purchase account linking (email match)
CREATE INDEX orders_guest_email_idx
  ON public.orders(guest_email)
  WHERE guest_email IS NOT NULL;
```

#### Idempotency table for webhooks

```sql
CREATE TABLE public.payment_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL,  -- 'systempay' | 'prepaid'
  event_id         text NOT NULL UNIQUE,
  order_id         uuid REFERENCES public.orders(id),
  event_type       text NOT NULL,
  processed_at     timestamptz NOT NULL DEFAULT now()
);
```

---

### 1.3 Checkout Flow (Nuxt frontend)

#### Order creation (shared — guest or authenticated)

Before any payment method runs, the order must exist with `status = 'pending'`. The Nuxt frontend collects the cart, the chosen delivery method (with its target — address, club, or shop), and — if the user is not logged in — a guest email + first/last name.

```
POST /functions/v1/create-order
Auth: optional Supabase session

Input: {
  idempotency_key:   uuid,                           // * client-generated per-checkout-attempt; reusing an existing key returns the existing order_id instead of creating a duplicate
  items:             [{ product_id, quantity }],
  delivery_method:   'colissimo' | 'club_pickup' | 'shop_pickup',
  shipping_address?: ShippingAddress,                // * required when delivery_method = 'colissimo'
  pickup_shop_id?:   uuid,                           // * required when delivery_method = 'shop_pickup' (FK to intersport_shops)
  club_id?:          uuid,                           // * required when delivery_method = 'club_pickup' — identifies which club's shop page
  payment_method:    'card' | 'bank_transfer' | 'prepaid',  // * 'card' covers any Smartform-served method (card / PayPal / wallet); systempay-ipn refines it to 'paypal' if PayPal was used. 'prepaid' is auto-set when a prepaid code covers the full total — see Part 5
  guest?:            { email, first_name, last_name, phone? },  // * required if no session; phone recommended for pickup notifications
  footspot?:         { member_id: uuid } | null,     // * set when buyer validated a Footspot purchase code at checkout (see Footspot integration guide, Phase 5). Auto-populated from prepaid code if one is applied.
  promo_code_id?:    uuid,                           // * resolved client-side via validate-promo-code (see Part 4)
  prepaid_code_ref?: string                          // * Footspot prepaid_codes.id, resolved client-side via validate-prepaid-code (see Part 5)
}

Action:
  0. Idempotency: SELECT id FROM orders WHERE idempotency_key = $1
     If a row exists → return its order_id + access_token + total_cents (no insert)
  1. If session: set user_id = session.user.id, guest_* stays NULL
     Else: validate guest.email + names, store as guest_email/guest_first_name/guest_last_name
     If prepaid_code_ref present, override guest_* with the member identity returned by Footspot.
  2. Validate delivery_method against the target club's allowed methods
     (clubs.delivery_colissimo_enabled / delivery_club_pickup_enabled / delivery_shop_pickup_enabled — see Part 3.3)
  3. Compute server-side pricing (never trust client amounts):
       subtotal_cents       = sum(item.unit_price × item.quantity)
       promo_discount_cents = (promo_code_id ? lookup amount, verify used_at IS NULL) else 0
       prepaid_credit_cents = (prepaid_code_ref ? MIN(subtotal − promo, cap returned by Footspot)) else 0
       total_cents          = subtotal − promo_discount − prepaid_credit
  4. If footspot.member_id present OR prepaid code carries member_id: set orders.footspot_member_id
     (the codes themselves are never persisted on Intersport — Footspot owns both code lifecycles)
  5. Insert order with status='pending', delivery_method, pickup_shop_id, all pricing columns,
     promo_code_id, prepaid_code_ref, prepaid_club_id, generate access_token (UUIDv4)
  6. Insert order_items rows
  7. If total_cents = 0 (fully covered by prepaid + promo): set payment_method='prepaid', skip
     create-form-token / Smartform — caller will route directly to the success page (see Part 5.5)
  8. Return order_id + access_token

Output: { order_id, access_token, total_cents }
```

The frontend stores `access_token` in localStorage so the user can return to their confirmation page during the same session even before the email arrives. All subsequent payment endpoints accept either a Supabase session OR an `access_token` matching the order — never trust `order_id` alone for guest calls.

#### Card / PayPal / Wallets (SystemPay Smartform)

The Smartform renders every payment method activated on the bank contract. From the customer's perspective there is one form; from the order's perspective the actual method (`card` vs `paypal`) is set when the IPN reports the result.

**Step 1 — Create the form token (Edge Function)**

```
POST /functions/v1/create-form-token
Auth: Supabase session OR access_token matching the order

Input:  { order_id: uuid, access_token?: uuid }
Action:
  1. Fetch order; verify status = 'pending' and total_cents > 0
  2. POST https://{username}:{password}@{endpoint}/api-payment/V4/Charge/CreatePayment
       Headers: Content-Type: application/json
       Auth:    HTTP Basic (SYSTEMPAY_USERNAME, SYSTEMPAY_PASSWORD)
       Body:    {
         amount:     order.total_cents,
         currency:   'EUR',
         orderId:    order.order_number,             // * shown in Back Office and IPN
         formAction: 'PAYMENT',
         customer: {
           email: <users.email or guest_email>,
           reference: order.id,                       // * helps the bank's anti-fraud match repeat customers
           billingDetails: {                          // * improves SCA approval rates and fraud scoring
             firstName:  <users.first_name or guest_first_name>,
             lastName:   <users.last_name  or guest_last_name>,
             phoneNumber: <orders.shipping_address.phone or guest.phone or null>,
             address:    <shipping_address.line2 if colissimo, else null>,
             zipCode:    <shipping_address.zipCode or null>,
             city:       <shipping_address.city or null>,
             country:    <shipping_address.countryCode or 'FR'>,
             language:   'fr'
           }
         }
       }
  3. Return answer.formToken to the frontend

Output: { form_token: "..." }
```

**Step 2 — Frontend renders the Smartform**

Install once: `npm i @lyracom/embedded-form-glue`. Load the theme files in the page head:

```html
<link rel="stylesheet" href="https://{endpoint}/static/js/krypton-client/V4.0/ext/neon-reset.min.css">
<script src="https://{endpoint}/static/js/krypton-client/V4.0/ext/neon.js"></script>
```

The form mounts inside a `<div class="kr-smart-form" kr-card-form-expanded></div>` placed inside `#myPaymentForm`. Card, PayPal, Apple Pay, Google Pay (whichever the bank contract has activated) all appear inside the same Smartform.

```typescript
import KRGlue from '@lyracom/embedded-form-glue'

const { form_token } = await $fetch('/functions/v1/create-form-token', {
  method: 'POST',
  body: { order_id, access_token }
})

const { KR } = await KRGlue.loadLibrary(SYSTEMPAY_ENDPOINT, SYSTEMPAY_PUBLIC_KEY)
await KR.setFormConfig({ formToken: form_token, 'kr-language': 'fr-FR' })
await KR.onSubmit(async (paymentData) => {
  // * UX-only verification — IPN remains the source of truth
  await $fetch('/functions/v1/validate-payment-hash', { method: 'POST', body: paymentData })
  navigateTo(`/order/${access_token}`)
  return false  // * we handle navigation ourselves
})
await KR.renderElements('#myPaymentForm')
```

**Step 3 — Browser hash check (UX only) — `validate-payment-hash`**

```
POST /functions/v1/validate-payment-hash
Auth: none (the hash itself is the proof)

Input:  { clientAnswer: object, hash: string, hashKey: 'sha256_hmac' }
Action:
  1. expected = HMAC_SHA256(JSON.stringify(clientAnswer), SYSTEMPAY_HMAC_KEY) → hex
  2. If hash !== expected → return 400 { ok: false }
  3. Else → return 200 { ok: true }
  -- DO NOT update the order here. The IPN is the only writer.
```

**Step 4 — IPN (server-to-server) — `systempay-ipn`**

This is the single source of truth. Lyra retries on non-2xx, so the handler must be idempotent. The browser callback in step 2 may never fire (customer closes the tab, network drops); the IPN always does.

```
POST /functions/v1/systempay-ipn
Auth: HMAC-SHA256 verification of the body

Body (form-urlencoded):
  kr-answer=<json>&kr-hash=<hex>&kr-hash-algorithm=sha256_hmac&kr-hash-key=<test|production>

Action:
  1. Read raw body, extract kr-answer (string) + kr-hash + kr-hash-key
  2. expected = HMAC_SHA256(kr-answer, SYSTEMPAY_HMAC_KEY) → hex
     If hash !== expected → return 401 (do NOT process)
  3. Parse kr-answer JSON. Pull (exact field paths to be confirmed against the
     first real sandbox IPN — Lyra's payload nesting has shifted between minor versions;
     log the raw kr-answer once during dev and adjust if needed):
       - orderStatus                                  ('PAID' | 'UNPAID' | 'RUNNING' | 'REFUNDED' | …)
       - orderDetails.orderId                         (== orders.order_number)
       - transactions[0].uuid                         (Lyra transaction id, used as event_id)
       - transactions[0].metadata.paymentMethodType   ('CARD' | 'PAYPAL' | …) — fallback paths to try if absent: transactions[0].transactionDetails.cardDetails.effectiveBrand, transactions[0].metadata.brand
       - transactions[0].amount + .currency           (sanity check vs order)
  4. SELECT 1 FROM payment_events WHERE provider='systempay' AND event_id = <transactions[0].uuid>
     If row exists → return 200 (replay) and stop
  5. If orderStatus = 'PAID':
       a. Atomically claim promo code if any (Part 4.5); on race loss → refund via
          POST /api-payment/V4/Transaction/CancelOrRefund and abort with status='cancelled'
       b. UPDATE orders SET
            status         = 'paid',
            paid_at        = now(),
            payment_method = (paymentMethodType = 'PAYPAL' ? 'paypal' : 'card'),
            payment_id     = transactions[0].uuid
       c. Run the low-stock trigger (Part 6.4)
       d. INSERT INTO payment_events (provider='systempay', event_id, order_id, event_type='PAID')
       e. Email the customer via the shared email helper:
            sendOrderEmail({ to, template: 'payment-confirmed', data: { order, magic_link } })
          See §1.6 below for the templates folder + helper.
       f. The status update is picked up by the centralized order trigger →
          dispatches order.created and order.status_changed to Footspot when applicable.
          For Colissimo orders, the same paid status fires generate-colissimo-label.
     Else if orderStatus IN ('UNPAID', 'ABANDONED') AND order.status = 'pending':
       UPDATE orders SET status='cancelled'
       INSERT payment_events row with event_type='UNPAID'
     Else if orderStatus = 'REFUNDED':
       UPDATE orders SET status='refunded'
       INSERT payment_events row with event_type='REFUNDED'
  6. Return 200 with body "OK!" so Lyra stops retrying
```

**Refunds**

The admin "Refund" button calls `POST /api-payment/V4/Transaction/CancelOrRefund` with the stored `payment_id` (Lyra transaction uuid). The IPN that follows carries `orderStatus='REFUNDED'` and the handler sets `orders.status='refunded'`.

#### Bank Transfer

**Step 1 — Customer submits order**

```
POST /functions/v1/submit-bank-transfer
Auth: Supabase session OR access_token matching the order

Input:  { order_id: uuid, access_token?: uuid }
Action:
  1. UPDATE orders SET status='pending_bank_transfer'
  2. Send email to customer (users.email or guest_email) with:
       - RIB
       - reference = order_number
       - magic link {APP_URL}/order/{access_token}
  3. Frontend ALSO renders the RIB + reference on the confirmation page
     (defensive — customer may close email without reading)
  4. Notify admin of pending transfer
```

**Step 2 — Admin confirms in backoffice**

```
POST /functions/v1/confirm-bank-transfer
Auth: Supabase session, role = 'admin' or 'employee'

Input:  { order_id: uuid }
Action:
  1. UPDATE orders SET status='paid', paid_at=now()
  2. Notify customer by email (recipient = users.email or guest_email; payment confirmed + magic link)
```

---

### 1.4 Environment Variables (Payment)

```
APP_URL=https://shop.intersport.fr           # * base URL used to build magic links
SYSTEMPAY_ENDPOINT=api.systempay.fr          # * bank-specific host (no https://)
SYSTEMPAY_USERNAME=12345678                  # * numeric shop id
SYSTEMPAY_PASSWORD=prodpassword_XXXXXXX      # * REST private key (testprivatekey_… in sandbox)
SYSTEMPAY_PUBLIC_KEY=12345678:publickey_XXX  # * public key for the JS Smartform
SYSTEMPAY_HMAC_KEY=...                       # * HMAC-SHA256 key (test or prod, must match password mode)
BREVO_API_KEY=xkeysib-...                    # * already configured for the project — used by send-order-email
BREVO_SENDER_EMAIL=no-reply@intersport-...   # * already configured — sender address for all transactional mail
```

> **Setting them**: never commit to git. Use `supabase secrets set KEY=value` for production deploys; for local dev put them in `supabase/functions/.env` (gitignored). The Brevo vars are already in production secrets.

---

### 1.5 Payment Admin UI

- **Pending bank transfers** list: order number, customer (user name or `guest_*` fields), amount, date + "Confirm payment" button
- **Order detail**: show payment method, payment ID (link to the SystemPay Back Office Marchand transaction page), paid_at, and a "Guest order" badge when `user_id IS NULL`
- **Refund button** (full or partial): available on every status except `pending` and already `refunded` — i.e. admins can refund a `paid`, `shipped`, `delivered`, `awaiting_pickup`, or `picked_up` order. Triggers `POST /api-payment/V4/Transaction/CancelOrRefund` → resulting IPN with `orderStatus='REFUNDED'` flips `orders.status = 'refunded'` (or stores into `refund_total` for partial refunds; the existing `refunds` table already supports per-line refunds — see `supabase/functions/refund-order/index.ts`)

---

### 1.5b Edge Function deployment notes

Every new Edge Function (and the existing ones) must be configured correctly for Supabase. Use this table when deploying:

| Function | `verify_jwt` | CORS source | Caller |
|---|---|---|---|
| `create-order` | `false` | helpers in `_shared/cors.ts` | Nuxt frontend (guest or session) |
| `create-form-token` | `false` | `_shared/cors.ts` | Nuxt frontend (guest or session — uses `access_token` for guests) |
| `validate-payment-hash` | `false` | `_shared/cors.ts` | Nuxt frontend |
| `systempay-ipn` | `false` | none (server-to-server only) | Lyra IPN; respond `200 OK` with body `OK!` |
| `submit-bank-transfer` | `false` | `_shared/cors.ts` | Nuxt frontend |
| `confirm-bank-transfer` | `true` | `_shared/cors.ts` | Admin / employee session |
| `confirm-shipped` | `true` | `_shared/cors.ts` | Admin / employee session |
| `mark-ready-for-pickup` | `true` | `_shared/cors.ts` | Admin / employee session |
| `confirm-picked-up` | `true` | `_shared/cors.ts` | Admin / employee session |
| `generate-colissimo-label` | `false` | none | DB trigger via `pg_net.http_post` (signed with `SUPABASE_SERVICE_ROLE_KEY` in `X-Internal-Call`) |
| `colissimo-tracking-worker` | `false` | none | Supabase cron |
| `validate-promo-code` / `validate-prepaid-code` | `false` | `_shared/cors.ts` | Nuxt frontend |

`verify_jwt: false` is set per-function in `supabase/config.toml`. Public-internet callers (Lyra IPN, Colissimo callbacks if any, La Poste tracking polls) MUST be `false` because they don't carry a Supabase JWT — auth is enforced inside the function (HMAC for IPN, etc.).

The CORS allowlist already covers `localhost:3000` and the Netlify deploy preview pattern in `_shared/cors.ts`. When the production domain ships, append it to `ALLOWED_ORIGINS`.

---

### 1.6 Email templates

All transactional email templates live in `supabase/functions/_shared/emails/`:

```
_shared/emails/
├── render.ts                          # * loads HTML file, extracts <!--SUBJECT: …-->, substitutes {{vars}}
├── send.ts                            # * sendOrderEmail({ to, template, data, locale? }) → posts to Brevo
└── templates/
    ├── payment-confirmed.html
    ├── bank-transfer-pending.html
    ├── bank-transfer-confirmed.html
    ├── shipped.html
    ├── delivered.html
    ├── ready-for-pickup.html
    ├── picked-up.html
    ├── return-to-sender.html          # * admin alert (RE1)
    ├── promo-code-already-redeemed.html
    ├── prepaid-race-loss.html
    └── low-stock-alert.html           # * admin notification
```

- Each `.html` file starts with `<!--SUBJECT: …-->`. Edit the subject line in-place; placeholders are `{{var}}` style.
- The renderer is plain string replacement — no Handlebars, no Vue. Keep templates self-contained.
- The existing `send-order-email/index.ts` (the inline-HTML one) still works for the 5 events it covers (`paid | partially_refunded | shipped | delivered | refunded`); migrate it to the new templates folder once those entries exist there.
- All email sends in this guide use `sendOrderEmail({ template: '<filename-without-.html>', … })`.

---

### 1.7 Customer order access (magic link)

> **No customer-side cancellation.** Once an order has been paid, the customer cannot cancel it from the magic-link page or anywhere else — the order moves into the fulfillment chain (label printing / pickup loading) which is owned by Intersport staff. Cancellations and refunds are admin-only via the backoffice.

After payment, every customer (guest or authenticated) receives an email containing a link of the form:

```
https://{APP_URL}/order/{access_token}
```

The Nuxt page `/order/[token].vue` looks up the order by `access_token` (read-only, no login). It renders the same status timeline shown in section 2.10 of this guide. Authenticated users still have `/account/orders` (filtered by `user_id`) — the magic link is a supplementary, account-free entry point that works for everyone.

**Token security**
- `access_token` is a UUIDv4 — effectively unguessable
- Shown only on the post-checkout confirmation page and in customer emails — never in admin views, logs, or analytics
- Does not expire — the page is read-only and contains no sensitive payment data, only items, address, status, and tracking number
- If a customer needs the link resent, admin backoffice exposes a "Resend confirmation email" action

---

### 1.8 Post-purchase account creation — REMOVED

Client decided on 2026-05-19 that customers will NEVER create accounts. The magic-link order page is the only retrieval surface. Do not build `create-account-from-order`, do not show a "Create an account" CTA, do not add a `/register` route for customers. Admin/employee accounts are still provisioned through `admin-users` — that is unrelated.

---

## Part 2 — Colissimo Integration

### Overview

Two separate official APIs from La Poste:

| API | Purpose | Auth | Type |
|---|---|---|---|
| **SLS Web Service v3.1** | Generate shipping labels | `apikey` header (Cbox account) | REST/SOAP |
| **Suivi v2** | Track shipment status | `X-Okapi-Key` (developer.laposte.fr) | REST, pull-based |

**Important**: Suivi v2 has no native webhooks — delivery status is detected by a scheduled polling worker.

---

### 2.1 Prerequisites — Getting Credentials

#### SLS API (label generation)
1. Intersport signs a **Colissimo entreprise contract** with La Poste (commercial team — already likely in place as a wholesaler)
2. Access **Cbox** (Colissimo's business portal: `https://www.colissimo.entreprise.laposte.fr`)
3. In Cbox: generate an **API key** under account settings
4. Note: `contractNumber` is on the contract document; `apikey` replaces password auth in v3.1

#### Suivi v2 API (tracking)
1. Subscribe for free at `https://developer.laposte.fr/products/suivi/latest`
2. Retrieve `X-Okapi-Key`

---

### 2.2 DB Migration — Colissimo

Add two columns to `orders` to track label state independently from shipment state:

```sql
ALTER TABLE public.orders
  ADD COLUMN label_pdf_path      text,
  ADD COLUMN label_generated_at  timestamptz;
```

- `label_pdf_path` — Supabase Storage path to the PDF, available for download as soon as payment is confirmed
- `label_generated_at` — timestamp of generation, used in admin queue
- `shipping_tracking` — already exists, stores the Colissimo parcel number
- `shipped_at` — set only when admin confirms the package was physically handed to La Poste

Add a tracking poll log to avoid hammering the API:

```sql
CREATE TABLE public.colissimo_tracking_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.orders(id),
  tracking_number  text NOT NULL,
  last_status      text,
  last_polled_at   timestamptz NOT NULL DEFAULT now(),
  delivered        boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX ON public.colissimo_tracking_log(order_id);
```

Add a label-generation error log so the admin "Label error" alert (§2.9) has a backing table:

```sql
CREATE TABLE public.label_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id),
  error_code    text,                                    -- * Colissimo SLS code (e.g. '30000', '40000')
  error_message text NOT NULL,
  failed_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz                              -- * set when admin retries successfully
);

CREATE INDEX label_errors_unresolved_idx
  ON public.label_errors(order_id)
  WHERE resolved_at IS NULL;
```

#### Storage bucket + RLS for shipping labels

Labels contain sender + recipient addresses, so the `labels/` bucket must be admin-only.

```sql
-- * Create a private bucket for label PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('labels', 'labels', false)
ON CONFLICT (id) DO NOTHING;

-- * Only admin and employee profiles can read/write labels.
CREATE POLICY "labels_admin_employee_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'labels' AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.active = true
      AND profiles.role IN ('admin', 'employee')
    )
  );

CREATE POLICY "labels_admin_employee_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'labels' AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.active = true
      AND profiles.role IN ('admin', 'employee')
    )
  );

-- * The generate-colissimo-label Edge Function uses the service role key,
-- * which bypasses RLS entirely — so no policy is needed for it.
```

---

### 2.3 SLS API — Label Generation

**Base URL (REST v3.1)**
```
https://ws.colissimo.fr/sls-ws/SlsServiceWSRest/3.1
Sandbox: https://ws.colissimo.fr/sandbox/sls-ws/SlsServiceWS/2.0
```

**Authentication**
```
Header: apikey: YOUR_CBOX_API_KEY
```

**Product codes for Intersport use case**

| Code | Service |
|---|---|
| `DOM` | Colissimo France (standard, most common) |
| `DOS` | Colissimo France with signature |
| `COL` | Colissimo relay point (Point Relais) |
| `CORE` | Colissimo Europe |

For club deliveries: use `DOS` (signature required — high-value sports equipment).

---

### 2.4 Edge Function: `generate-colissimo-label`

**Trigger**: Called automatically when `orders.status` transitions to `paid` AND `orders.delivery_method = 'colissimo'`. Implemented as the centralized `orders` Postgres trigger (same one that dispatches Footspot events) calling `pg_net.http_post(.../functions/v1/generate-colissimo-label, …)` with `X-Internal-Call: <SUPABASE_SERVICE_ROLE_KEY>` so the function recognises the call as internal.
**Auth**: `X-Internal-Call` header equals the service role key (no Supabase JWT required because `verify_jwt: false` on this function).

> Label is generated and stored immediately. Order status stays `paid` — it only moves to `shipped` when the admin confirms the package was physically handed to La Poste.

```
POST /functions/v1/generate-colissimo-label

Input: { order_id: uuid }

Action:
  1. Fetch order with shipping_address, total, club → get club name
  2. Build SLS request body (see below)
     Note: depositDate = today. If the package is deposited a few days later
     Colissimo still accepts the label — tracking activates on first scan.
  3. POST https://ws.colissimo.fr/sls-ws/SlsServiceWSRest/3.1/generateLabel
     Headers: { apikey, Content-Type: application/json }
  4. Extract parcelNumber from response (format: "6A11111111111")
  5. Download label PDF from pdfUrl in response
  6. Upload label PDF to Supabase Storage (path: labels/{order_id}/label.pdf)
  7. UPDATE orders SET
       shipping_tracking = parcelNumber,
       label_pdf_path = 'labels/{order_id}/label.pdf',
       label_generated_at = now()
     -- status stays 'paid', no shipped_at yet
  8. Insert colissimo_tracking_log (order_id, tracking_number=parcelNumber, delivered=false)
     -- polling worker only activates this row once status = 'shipped'
  9. Notify admin: label ready for order {order_number} (in-app notification)
  -- No customer email yet, no Footspot event yet
```

**On error**
- Do NOT update any order column
- Insert to a `label_errors` log (order_id, error_code, error_message, failed_at)
- Notify admin by email with error details for manual retry

**SLS generateLabel request body**
```json
{
  "contractNumber": "XXXXXXXX",
  "password": "",
  "outputFormat": {
    "x": 0,
    "y": 0,
    "outputPrintingType": "PDF_A4_300dpi"
  },
  "letter": {
    "service": {
      "productCode": "DOS",
      "depositDate": "DD/MM/YYYY",
      "orderNumber": "ORD-XXXXX"
    },
    "parcel": {
      "weight": 2.5
    },
    "sender": {
      "senderParcelRef": "ORD-XXXXX",
      "address": {
        "companyName": "Intersport",
        "line2": "12 Rue du Commerce",
        "countryCode": "FR",
        "city": "Paris",
        "zipCode": "75015"
      }
    },
    "addressee": {
      "address": {
        "companyName": "AS Saint-Denis",
        "lastName": "Dupont",
        "firstName": "Jean",
        "line2": "5 Avenue du Stade",
        "countryCode": "FR",
        "city": "Saint-Denis",
        "zipCode": "93200"
      }
    }
  }
}
```

**SLS response — key fields**
```json
{
  "messages": [
    {
      "id": "0",
      "type": "INFOS",
      "messageContent": "OK"
    }
  ],
  "labelResponse": {
    "parcelNumber": "6A11111111111",
    "pdfUrl": "https://ws.colissimo.fr/sls-ws/...label.pdf"
  }
}
```

**SLS error codes**
- `30000` → authentication failure (check API key)
- `40000` → invalid address (trigger address validation UI for admin)
- On any error: do NOT update any order column, log to `label_errors`, notify admin

---

### 2.5 Edge Function: `confirm-shipped`

**Caller**: Admin clicks "Confirm handed to La Poste" in backoffice.  
**Auth**: Supabase session, `role = 'admin'` or `'employee'`.

> This is the only action that moves the order to `shipped` and triggers all downstream events.

```
POST /functions/v1/confirm-shipped

Input: { order_id: uuid }

Precondition: order must have label_generated_at IS NOT NULL and status = 'paid'

Action:
  1. UPDATE orders SET
       status = 'shipped',
       shipped_at = now()
  2. Send email to customer:
       - Recipient: users.email if user_id IS NOT NULL else guest_email
       - Order shipped confirmation
       - Tracking number (shipping_tracking)
       - Track link: https://www.laposte.fr/outils/suivre-vos-envois?code={parcelNumber}
       - Magic link to order page: {APP_URL}/order/{access_token}
  3. The status update is picked up by the centralized order trigger,
     which dispatches `order.status_changed (status: 'shipped')` to Footspot
     when the club is linked. Do not push directly from this function.
     (see Footspot integration guide, Phase 3 — Order Trigger)
  4. colissimo_tracking_log row for this order is now active
     — tracking worker will start polling it on next cycle

Output: { ok: true }
```

---

### 2.6 Edge Function: `colissimo-tracking-worker` *(scheduled)*

**Trigger**: Supabase cron, every **2 hours**. Suivi v2 rate limit is 1 req/sec — the worker batches 50 shipments per run with a 1.1 s delay between calls (~55 s per run), well below the limit.

**Suivi v2 endpoint**
```
GET https://api.laposte.fr/suivi/v2/idships/{trackingNumber}
Headers:
  X-Okapi-Key: YOUR_SUIVI_KEY
  Accept: application/json
```

**Suivi v2 response — key fields**
```json
{
  "shipment": {
    "idShip": "6A11111111111",
    "product": "Colissimo",
    "isFinal": false,
    "event": [
      {
        "date": "2026-04-22T14:30:00",
        "label": "Votre colis est livré",
        "type": "MD2",
        "code": "DR1"
      }
    ]
  }
}
```

**Status code mapping**

| Suivi v2 `code` | Meaning | `orders.status` |
|---|---|---|
| `AG1` | Parcel recorded | `shipped` (already set) |
| `EP1` | In transit at sorting hub | — (no change) |
| `TA1` | Out for delivery | — (no change) |
| `DR1` | Delivered | `delivered` |
| `MD2` | Delivered to guardian/neighbor | `delivered` |
| `AG2` | Delivery failed, notice left | — (no change, log only) |
| `RE1` | Return to sender | `cancelled` + notify admin |
| `isFinal: true` | Terminal state | update if not already |

**Worker logic**
```
1. SELECT ctl.* FROM colissimo_tracking_log ctl
   JOIN orders o ON o.id = ctl.order_id
   WHERE ctl.delivered = false
   AND o.status = 'shipped'           -- only poll after admin confirmed handoff
   AND ctl.last_polled_at < now() - interval '2 hours'
   LIMIT 50

2. For each row:
   a. GET Suivi v2 endpoint for tracking_number
   b. Extract latest event code
   c. If code = DR1 or MD2 or isFinal=true with delivered event:
      - UPDATE orders SET status='delivered', delivered_at=event.date
      - UPDATE colissimo_tracking_log SET delivered=true
      - The status update fires the centralized order trigger, which
        dispatches Footspot `shipment.delivered`. Do not push directly.
   d. If code = RE1:
      - UPDATE orders SET status='cancelled'
      - Notify admin by email
      - The centralized order trigger dispatches Footspot
        `order.status_changed (status: 'cancelled')`.
   e. UPDATE colissimo_tracking_log SET last_status=code, last_polled_at=now()

3. Respect rate limit: add 1.1 second delay between each Suivi v2 call
```

---

### 2.7 Shipping Address Validation

`orders.shipping_address` is already a `jsonb` column. Enforce this structure at order creation:

```typescript
interface ShippingAddress {
  companyName?: string   // club name
  lastName: string
  firstName: string
  line2: string          // street address (line1 is reserved by Colissimo)
  city: string
  zipCode: string        // 5 digits, validated
  countryCode: string    // ISO 3166-1 alpha-2, default 'FR'
  phone?: string         // recommended for Colissimo delivery notifications
}
```

Add frontend validation before order submission:
- `zipCode`: must be exactly 5 digits (French)
- `city`: non-empty, no special characters
- `countryCode`: default `FR`, list of supported Colissimo countries for international

---

### 2.8 Package Weight

Colissimo requires weight in kg. Add a `weight_kg` field to `orders` or calculate from order items.

**Option A (recommended)**: Add `weight_kg` on `products` table — admin fills it when adding a product. Sum across `order_items` × quantity when generating label.

```sql
ALTER TABLE public.products
  ADD COLUMN weight_kg numeric CHECK (weight_kg > 0);
```

If weight is null/missing: default to `1.0` kg and notify admin to fill missing weights.

> **Per-parcel weight ceiling**: Colissimo accepts up to ~30 kg per parcel. The Intersport e-shop sells small/medium items (jerseys, balls, cones, gloves) — no order is expected to exceed this. No multi-parcel splitting logic is implemented. If an exceptional bulk order exceeds 30 kg, the admin instructs the customer to switch to **club pickup** or **shop pickup** (both delivered by Intersport's own trucks, no Colissimo).

---

### 2.9 Admin UI — Shipping Management

**"Labels ready" tab**
- Lists orders where `label_generated_at IS NOT NULL AND status = 'paid'`
- These are orders with a label already generated, waiting for the package to be physically ready (flocking preparation, packing, etc.)
- Per row: order number, club name, items summary, label_generated_at
- **"Download label" button** → opens `label_pdf_path` from Supabase Storage for printing
- **"Confirm handed to La Poste" button** → calls `confirm-shipped` → row disappears from this tab

**"Label error" alert**
- Orders where `status = 'paid'` AND `label_generated_at IS NULL` AND `label_errors` row exists
- Shows error code + "Retry label generation" button
- Should never be a long list — requires admin attention

**Active shipments tab**
- Lists orders with `status = 'shipped'` and `delivered = false` in tracking log
- Last known Suivi v2 status + last polled timestamp
- "Force refresh tracking" button (manual poll outside scheduled window)

**Delivered / exceptions**
- `delivered` orders with `delivered_at` timestamp
- `RE1` (return to sender) alerts with action required badge

---

### 2.10 Customer UI — Order Tracking

The public order page `/order/[access_token]` (linked from every confirmation/shipping email) shows a status timeline. Same component is reused on `/account/orders/[id]` for authenticated users.

```
✓ Order placed      [date]
✓ Payment confirmed [date]
✓ In preparation    [date]  ← visible once label_generated_at is set
◌ Shipped           [pending — shown with tracking once admin confirms handoff]
  ↳ Tracking: 6A11111111111  [Track on La Poste →]
◌ Delivered         [pending]
```

Tracking number links to `https://www.laposte.fr/outils/suivre-vos-envois?code={parcelNumber}`.

---

### 2.11 Environment Variables (Colissimo)

```
COLISSIMO_SLS_BASE_URL=https://ws.colissimo.fr/sls-ws/SlsServiceWSRest/3.1
COLISSIMO_SLS_SANDBOX_URL=https://ws.colissimo.fr/sandbox/sls-ws/SlsServiceWS/2.0
COLISSIMO_API_KEY=<from Cbox>
COLISSIMO_CONTRACT_NUMBER=<from Colissimo enterprise contract>
COLISSIMO_SENDER_NAME=Intersport
COLISSIMO_SENDER_LINE2=<warehouse street address>
COLISSIMO_SENDER_CITY=<city>
COLISSIMO_SENDER_ZIP=<zipcode>
LAPOSTE_SUIVI_KEY=<from developer.laposte.fr>
LAPOSTE_SUIVI_URL=https://api.laposte.fr/suivi/v2/idships
```

---

---

## Part 3 — Pickup Delivery Methods (Club & Intersport Shop)

### Overview

Both pickup methods share the same logistics chain: Intersport delivers the package itself with its own trucks. The order stays `paid` until Intersport's truck reaches the destination (club or shop). The admin then marks the order **ready for pickup** — this triggers a customer email and moves the order to `awaiting_pickup`. When the customer physically collects the package, the admin marks it **picked up** and the order transitions to `picked_up` (terminal state).

| Step | Trigger | Status |
|---|---|---|
| Payment confirmed | SystemPay IPN or admin (bank transfer) | `paid` |
| Truck delivered to club/shop | Admin clicks **"Mark ready for pickup"** | `awaiting_pickup` (+ customer email) |
| Customer collects in person | Admin clicks **"Confirm picked up"** | `picked_up` |

No carrier API, no label generation, no polling. The chain is fully manual on the Intersport side, but the customer-facing UX (timeline, magic-link order page, email cadence) is identical to Colissimo.

---

### 3.1 DB Migration — Pickup

#### Extend `orders.status` enum

Add two new values:

```sql
ALTER TYPE order_status ADD VALUE 'awaiting_pickup';
ALTER TYPE order_status ADD VALUE 'picked_up';
```

> The terminal state for Colissimo is `delivered`; for pickup it is `picked_up`. Both are equally final from Footspot's perspective — the centralized order trigger already dispatches `order.status_changed` for any status mutation.

#### Add delivery method columns to `orders`

```sql
CREATE TYPE delivery_method AS ENUM ('colissimo', 'club_pickup', 'shop_pickup');

ALTER TABLE public.orders
  ADD COLUMN delivery_method      delivery_method NOT NULL DEFAULT 'colissimo',
  ADD COLUMN pickup_shop_id       uuid REFERENCES public.intersport_shops(id),
  ADD COLUMN ready_for_pickup_at  timestamptz,
  ADD COLUMN picked_up_at         timestamptz;

-- * pickup_shop_id is only populated when delivery_method = 'shop_pickup'
ALTER TABLE public.orders
  ADD CONSTRAINT orders_shop_pickup_check
  CHECK (
    (delivery_method = 'shop_pickup' AND pickup_shop_id IS NOT NULL)
    OR (delivery_method <> 'shop_pickup' AND pickup_shop_id IS NULL)
  );
```

#### Per-club enabled delivery methods

Each club's shop page exposes only the delivery methods toggled on by the admin:

```sql
ALTER TABLE public.clubs
  ADD COLUMN delivery_colissimo_enabled    boolean NOT NULL DEFAULT true,
  ADD COLUMN delivery_club_pickup_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN delivery_shop_pickup_enabled  boolean NOT NULL DEFAULT false;
```

The `create-order` function rejects any order whose `delivery_method` is disabled for the target club — defense in depth in case the frontend cache is stale.

#### Intersport shops (for `shop_pickup`)

```sql
CREATE TABLE public.intersport_shops (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,                 -- * e.g. "Intersport Maurepas"
  google_maps_url          text NOT NULL,                 -- * share link from maps.app.goo.gl
  delivery_delay_open_days integer NOT NULL CHECK (delivery_delay_open_days >= 0),
  enabled                  boolean NOT NULL DEFAULT true, -- * admin can hide a shop without deleting
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX intersport_shops_enabled_idx ON public.intersport_shops(enabled) WHERE enabled = true;
```

> Intersport shops are restricted to **Île-de-France** (75, 77, 78, 91, 92, 93, 94, 95). This is a business rule, not a DB constraint — admin is responsible for only registering eligible shops.

---

### 3.2 Estimated Pickup Date

The shop's `delivery_delay_open_days` is the number of **business days** (Mon–Fri, excluding French public holidays) between order payment and the package being available at the shop.

```typescript
// * French public holidays — fixed dates + Easter-derived Pâques/Ascension/Pentecôte
function easterSunday(year: number): Date {
  // * Anonymous Gregorian algorithm — gives the date of Easter Sunday in `year`
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)         // * 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function isFrenchHoliday(d: Date): boolean {
  const y = d.getFullYear(), md = `${d.getMonth() + 1}-${d.getDate()}`
  // * Fixed-date jours fériés
  const fixed = ['1-1', '5-1', '5-8', '7-14', '8-15', '11-1', '11-11', '12-25']
  if (fixed.includes(md)) return true
  // * Easter-derived: Lundi de Pâques (+1), Ascension (+39), Lundi de Pentecôte (+50)
  const easter = easterSunday(y)
  for (const offset of [1, 39, 50]) {
    const h = new Date(easter); h.setDate(h.getDate() + offset)
    if (h.getMonth() === d.getMonth() && h.getDate() === d.getDate()) return true
  }
  return false
}

function estimatedPickupDate(paidAt: Date, openDays: number): Date {
  const d = new Date(paidAt)
  let added = 0
  while (added < openDays) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()  // * 0 = Sun, 6 = Sat
    if (day === 0 || day === 6) continue
    if (isFrenchHoliday(d)) continue
    added++
  }
  return d
}
```

Display this date on:
- Each shop card in the customer pickup-shop selector ("Pickup available from **Tue 12 May**")
- The order confirmation email (when shop_pickup is selected)
- The customer order page `/order/[access_token]` timeline

For `club_pickup`, no per-club delay is configured at v1 — the customer sees a generic message ("You will receive an email when your order is ready at the club, usually within a few days"). Add `clubs.pickup_delay_open_days` later if needed.

---

### 3.3 Admin UI — Intersport Shops CRUD

New admin page: `/admin/intersport-shops`.

**List view**
- Columns: name, google maps link (clickable, opens in new tab), delivery delay (days), enabled toggle, edit/delete actions
- "Add shop" button opens a modal

**Create / edit form**
- `name` (text, required) — e.g. "Intersport Maurepas"
- `google_maps_url` (URL, required) — admin pastes share link from Google Maps; basic validation that it starts with `https://maps.app.goo.gl/` or `https://www.google.com/maps/`
- `delivery_delay_open_days` (integer, ≥ 0, required)
- `enabled` (boolean, default true)

**Delete behavior**
- Hard delete is blocked if any order has `pickup_shop_id` referencing this shop
- Admin must instead toggle `enabled = false` to remove from customer selectors

---

### 3.4 Admin UI — Per-club Delivery Settings

On the existing `/admin/clubs/[id]` page, add a **"Delivery methods"** section with three toggles:

- ☑ Colissimo — enabled by default
- ☐ Club pickup
- ☐ Intersport shop pickup

At least one must remain enabled (frontend validation; backend rejects an update that would zero-out all three with a clear error).

When a method is disabled mid-session for a club whose shop page a customer is browsing, the customer sees only the still-enabled methods on next page load. Existing orders are unaffected.

---

### 3.5 Customer UI — Delivery Method Selection

On the club's shop page, the checkout form shows a delivery method picker filtered by the club's enabled methods.

```
○ Colissimo Home Delivery        — €X.XX, 2–3 business days
○ Pickup at the Club             — Free
○ Pickup at an Intersport Shop   — Free
   └─ [Select a shop ▾]
       Intersport Maurepas        Pickup from Tue 12 May  [📍 View on map]
       Intersport Vélizy          Pickup from Wed 13 May  [📍 View on map]
       …
```

- Methods not enabled for the club are not rendered at all
- Selecting "Pickup at an Intersport Shop" expands a dropdown listing all `intersport_shops` where `enabled = true`, ordered alphabetically. Each row shows shop name, computed estimated pickup date, and a "View on map" link opening `google_maps_url` in a new tab
- Submitting checkout passes `delivery_method` and (if applicable) `pickup_shop_id` to `create-order`

---

### 3.6 Edge Function: `mark-ready-for-pickup`

**Caller**: Admin clicks **"Mark ready for pickup"** in backoffice on a `paid` order whose delivery method is `club_pickup` or `shop_pickup`.  
**Auth**: Supabase session, `role = 'admin'` or `'employee'`.

```
POST /functions/v1/mark-ready-for-pickup

Input: { order_id: uuid }

Precondition:
  - orders.status = 'paid'
  - orders.delivery_method IN ('club_pickup', 'shop_pickup')

Action:
  1. UPDATE orders SET
       status = 'awaiting_pickup',
       ready_for_pickup_at = now()
  2. Send email to customer:
       - Recipient: users.email if user_id IS NOT NULL else guest_email
       - Subject: "Your order is ready to pick up"
       - Body includes:
         * Pickup location (club name + address, OR shop name + google_maps_url)
         * Order number
         * Magic link {APP_URL}/order/{access_token}
         * Reminder to bring an ID
  3. Centralized order trigger fires `order.status_changed (status: 'awaiting_pickup')`
     to Footspot when orders.footspot_member_id IS NOT NULL.
     Do not push directly from this function.

Output: { ok: true }
```

---

### 3.7 Edge Function: `confirm-picked-up`

**Caller**: Admin clicks **"Confirm picked up"** when the customer physically collects the package.  
**Auth**: Supabase session, `role = 'admin'` or `'employee'`.

```
POST /functions/v1/confirm-picked-up

Input: { order_id: uuid }

Precondition:
  - orders.status = 'awaiting_pickup'

Action:
  1. UPDATE orders SET
       status = 'picked_up',
       picked_up_at = now()
  2. Centralized order trigger fires `order.status_changed (status: 'picked_up')`
     to Footspot when orders.footspot_member_id IS NOT NULL.
  3. (Optional) Send a "Thanks for your order" email — low priority, can ship later.

Output: { ok: true }
```

---

### 3.8 Admin UI — Pickup Management

Add a new tab in the orders backoffice: **"Pickups"**.

**"Awaiting truck dispatch"**
- Filter: `status = 'paid' AND delivery_method IN ('club_pickup', 'shop_pickup')`
- Per row: order number, customer, club or shop name + address, items summary, paid_at
- This list is the loading manifest for the next truck run
- **"Mark ready for pickup"** button on each row → calls `mark-ready-for-pickup` once truck has dropped the package off

**"Awaiting customer pickup"**
- Filter: `status = 'awaiting_pickup'`
- Per row: order number, customer name + email + phone, ready_for_pickup_at
- Useful at the club/shop counter — staff search by customer name when they arrive
- **"Confirm picked up"** button → calls `confirm-picked-up`

**"Picked up (last 30 days)"**
- Filter: `status = 'picked_up' AND picked_up_at > now() - interval '30 days'`
- Read-only audit list

---

### 3.9 Customer UI — Order Tracking Timeline (Pickup)

The same `/order/[access_token]` timeline component renders different rows depending on `delivery_method`:

```
✓ Order placed         [date]
✓ Payment confirmed    [date]
✓ In preparation       [date]
◌ Ready for pickup     [pending]
   ↳ Pickup at: Intersport Maurepas
     [📍 View on map]
     Estimated availability: Tue 12 May
◌ Picked up            [pending]
```

When `status = 'awaiting_pickup'`, the "Ready for pickup" row becomes ✓ with the actual `ready_for_pickup_at` timestamp, and the timeline highlights the location prominently.

---

### 3.10 Validation & Edge Cases

- **Method disabled mid-order**: if a club admin disables `delivery_club_pickup_enabled` while a customer is mid-checkout, the next call to `create-order` returns `400 delivery_method_disabled_for_club`. Frontend re-fetches the club's enabled methods and re-prompts.
- **Shop disabled mid-order**: same pattern — `400 shop_unavailable`. Customer is asked to pick a different shop.
- **Customer never picks up**: no automated reminder at v1. Admin can resend the "ready for pickup" email manually from the order detail page (re-triggering the same template). Add a 7-day reminder cron later if abandonment becomes an issue.
- **Wrong customer claims the order**: out of scope for software — staff verify customer identity at the counter before clicking "Confirm picked up".

---

### 3.11 Footspot Integration Notes

Pickup orders use the same centralized order trigger as Colissimo orders. New events automatically flow to Footspot when `orders.footspot_member_id` is populated:

| New `orders.status` | Footspot event |
|---|---|
| `awaiting_pickup` | `order.status_changed` (status: `awaiting_pickup`) |
| `picked_up` | `order.status_changed` (status: `picked_up`) |

No changes needed in Footspot dispatch code beyond extending the status whitelist mapping. See the Footspot integration guide, Phase 3 — Order Trigger.

---

## Part 4 — Promo Codes (Shop-wide, Admin-generated)

### Overview

Admin can mint one-time promo codes redeemable across the entire shop — no club restriction, no member restriction. Each code carries a fixed Euro amount (not a percentage) and is **single-use globally**: once redeemed by an order, it cannot be reused by anyone. Multiple customers may hold the same unredeemed code in their checkouts at the same time; the race is resolved at payment success.

---

### 4.1 DB Migration — Promo Codes

```sql
CREATE TABLE public.promo_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text    NOT NULL UNIQUE,
  amount_cents     integer NOT NULL CHECK (amount_cents > 0),
  used_at          timestamptz,
  used_by_order_id uuid REFERENCES public.orders(id),
  revoked_at       timestamptz,                    -- * admin can void unused codes
  created_by       uuid    NOT NULL REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- * partial index for the validate-promo-code lookup (only unused, non-revoked codes)
CREATE INDEX promo_codes_redeemable_idx
  ON public.promo_codes(code)
  WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.orders
  ADD COLUMN subtotal_cents       integer NOT NULL DEFAULT 0,
  ADD COLUMN promo_code_id        uuid REFERENCES public.promo_codes(id),
  ADD COLUMN promo_discount_cents integer NOT NULL DEFAULT 0;
```

> Assumes `orders.total_cents` already exists and is the customer-payable amount **after** all discounts. `subtotal_cents` is added to make the breakdown auditable.

---

### 4.2 Admin UI — Promo Code Management

New page `/admin/promo-codes`:
- **Create** modal: `code` (auto-generated 10-char A–Z/0–9 if blank, admin-overridable), `amount_cents` (admin enters Euros, frontend × 100). On submit, code is shown once with a copy button (admin pastes it into a customer email or hands it out)
- **List** view: code, amount in EUR, status (Unused / Used by `order_number` on `used_at` / Revoked), created_at, created_by
- **Revoke** button on unused codes → sets `revoked_at = now()`. Revoked codes are no longer redeemable but stay on the list for audit
- Codes cannot be edited after creation

---

### 4.3 Customer UI — Apply at Checkout

On the checkout page, between cart summary and payment method selection:
- "Have a promo code?" expand link → text input + "Apply" button
- On apply: call `validate-promo-code`. Display the discount and update the order summary live: `Subtotal − Promo discount = Total`
- Code is held client-side (in component state) until `create-order` is called — no server-side reservation

---

### 4.4 Edge Function: `validate-promo-code`

```
POST /functions/v1/validate-promo-code
Auth: none (read-only public check)

Input:  { code: string }
Action:
  1. SELECT id, amount_cents FROM promo_codes
     WHERE code = $1 AND used_at IS NULL AND revoked_at IS NULL
  2. If not found → return { valid: false, reason: 'invalid_or_used' }
  3. Else → return { valid: true, promo_code_id, amount_cents }
```

Intentionally read-only and idempotent. Multiple checkouts can validate the same code in parallel.

---

### 4.5 Atomic Claim at Payment Success

The promo code is claimed in the **same DB transaction** that flips the order to `paid` (inside `systempay-ipn`, `confirm-bank-transfer`, or the €0 fast-path of Part 5):

```sql
UPDATE promo_codes
   SET used_at = now(),
       used_by_order_id = $order_id
 WHERE id = $promo_code_id
   AND used_at IS NULL
   AND revoked_at IS NULL
RETURNING id;
```

- **0 rows returned** (race lost): refund the payment immediately (SystemPay `Transaction/CancelOrRefund` / mark bank transfer void), set `orders.promo_discount_cents = 0`, recompute `total_cents`, set `orders.status = 'cancelled'`, send the customer a `promo_code_already_redeemed` email asking them to retry. This must be rare in practice — only happens when two customers click "Pay" within the same millisecond.
- **1 row returned**: success — order proceeds to `paid` normally.

> No pre-claim / soft hold at v1. If race losses become a real complaint, add a `promo_code_holds` table with a 15-minute TTL and run the soft-hold check at `create-order` time.

---

## Part 5 — Footspot Prepaid Order Codes

### Overview

Footspot members who have paid their club contribution **in person** (off-app) can receive a **prepaid order code** generated on Footspot by their club's director, manager, head coach, or coach. The code carries:

- The member's identity (auto-tags the order for Footspot stock allocation — see Footspot integration guide, `intersport-events.order.created`)
- A Euro **cap** — the maximum amount the club has pre-paid for this member's equipment

When the member uses the code at Intersport checkout, the cap is applied as a credit toward the order total:

| Cart vs. cap | Customer pays | Order flow |
|---|---|---|
| Cart ≤ cap | €0 — `payment_method = 'prepaid'`, skip the Smartform | Order goes directly to `paid` |
| Cart > cap | Overflow only — normal payment flow on the residual | Order moves to `paid` after payment succeeds |

The club is billed by Intersport off-app for the consumed amount (monthly invoice generated from the admin reporting page — see 5.6).

> **Owner of the code lifecycle**: Footspot. Intersport never persists the human-readable code; it stores a Footspot-issued reference id (`prepaid_code_ref`) and the consumed amount. See the Footspot integration guide for staff UI, `prepaid_codes` table, and the validate / consume edge functions.

---

### 5.1 DB Migration — Prepaid Tracking on Orders

```sql
ALTER TYPE payment_method ADD VALUE 'prepaid';   -- * used when total_cents = 0

ALTER TABLE public.orders
  ADD COLUMN prepaid_code_ref     text,          -- * Footspot prepaid_codes.id (opaque)
  ADD COLUMN prepaid_credit_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN prepaid_club_id      uuid;          -- * Footspot club id, used for invoicing reports
```

`orders.footspot_member_id` (already added with the rest of the Footspot wiring) is auto-populated from the prepaid code's member identity — never collected from the buyer when a prepaid code is applied.

---

### 5.2 Pricing Pipeline (server-side, in `create-order`)

```
subtotal       = sum(item.unit_price × item.quantity)
after_promo    = subtotal − promo_discount_cents
prepaid_credit = MIN(after_promo, cap_amount_cents)   // * cap returned by Footspot at validate
customer_total = after_promo − prepaid_credit          // * what the Smartform will charge
```

Never trust client-supplied amounts — recompute every value from the product table and the codes returned by Footspot.

---

### 5.3 Edge Function: `validate-prepaid-code` *(Intersport-side proxy)*

```
POST /functions/v1/validate-prepaid-code
Auth: none (read-only public check)

Input:  { code: string }
Action:
  1. POST to Footspot's intersport-validate-prepaid-code endpoint
       Headers: Bearer (per-club token? — see note below) + HMAC + X-Timestamp + X-Idempotency-Key
       Body:   { code }
  2. Pass through Footspot's response unchanged

Output: {
  valid:             boolean,
  prepaid_code_ref?: string,    -- * opaque Footspot id, sent back at order finalization
  member_id?:        string,    -- * Footspot user id
  member_name?:      string,
  member_email?:     string,
  club_id?:          string,    -- * Footspot club id (used for invoicing)
  cap_amount_cents?: integer,
  reason?:           string     -- * 'code_invalid' | 'code_consumed' | 'code_expired'
}
```

> **Bearer note**: prepaid codes are not bound to a specific club at validation time from the customer's perspective — the customer doesn't know which club issued it. The Intersport proxy authenticates with Footspot using a **shop-level service token** (`INTERSPORT_FOOTSPOT_SERVICE_TOKEN`), distinct from the per-club tokens used by `intersport-events`. Footspot resolves the club from the code itself. Add this token to the secrets list (see 5.7).

Validation is read-only — Footspot does **not** consume on validate. Consumption happens at order finalization (5.5).

---

### 5.4 Customer UI — Apply Prepaid Code

Alongside the promo code input on the checkout page:
- "Have a club prepaid code?" expand link → text input + "Apply" button
- On apply: call `validate-prepaid-code`. On success, show:
  - Banner: "Prepaid by **{club_name}** — credit up to **€{cap}**"
  - Auto-fill identity fields (`first_name`, `last_name`, `email`) from the Footspot member record and **disable editing** (the code is bound to that member)
  - Update order summary: `Prepaid credit: −€{credit}` and `You pay: €{customer_total}`
- A prepaid code carries member identity, so the separate Footspot purchase-code input (used today for stock allocation, see Part 1.3 `footspot.member_id`) is hidden once a prepaid code is applied — the code already does both jobs
- At most **one** prepaid code per order. Promo code may still be combined (applied first)

---

### 5.5 Order Finalization — Two Paths

#### Path A — `customer_total = 0` (fully prepaid)

- `create-order` sets `payment_method = 'prepaid'`, `status = 'paid'`, `paid_at = now()` directly in the same insert
- No `create-form-token`, no Smartform render, no `submit-bank-transfer`
- Insert a synthetic `payment_events` row: `provider = 'prepaid'`, `event_id = order_id::text`, `event_type = 'prepaid.consumed'`
- Atomically claim the promo code (if any) inline with the insert (see 4.5)
- POST to Footspot `intersport-events` with `order.created` + `prepaid_code_ref` + `prepaid_amount_used_cents` (= `prepaid_credit_cents`). Footspot consumes the code atomically on its side.
- If Footspot returns `prepaid_code_already_consumed` (validate→order.created race lost): set `orders.status = 'cancelled'`, `prepaid_credit_cents = 0`, send admin + customer a recovery email. Promo code (if claimed) is reverted: `UPDATE promo_codes SET used_at = NULL, used_by_order_id = NULL WHERE id = $1`.

#### Path B — `customer_total > 0` (partial prepaid)

- Normal payment flow runs on the residual via card / PayPal / bank transfer
- On the payment success handler (`systempay-ipn` / `confirm-bank-transfer`):
  1. Atomically claim promo code (4.5)
  2. UPDATE order to `paid`
  3. POST `intersport-events.order.created` with `prepaid_code_ref` + `prepaid_amount_used_cents`
  4. If Footspot consumption fails: refund the customer's residual via SystemPay `Transaction/CancelOrRefund`, set `status = 'cancelled'`, revert promo claim, notify customer

In both paths, `intersport-events.order.created` is the single point where Footspot is notified of the order. Pickup and Colissimo flows downstream are unchanged — both methods continue from `paid` regardless of how it was paid.

---

### 5.6 Admin Reporting — Per-club Invoicing

New admin page `/admin/prepaid-orders`:
- Filters: `club_id`, date range, status
- Columns: `order_number`, `member_name`, `club_name` (joined from Footspot via cached lookup or stored at order time), `prepaid_credit_cents`, `customer_paid_cents`, `paid_at`, `delivered_at`
- "Export CSV" button — used as the basis for the monthly invoice the accounting team sends to each club
- Aggregate row at the top of each filter result: total prepaid for the period

---

### 5.7 Environment Variables (Prepaid)

```
INTERSPORT_FOOTSPOT_SERVICE_TOKEN=<shop-level bearer for prepaid validation; agreed with Footspot team>
INTERSPORT_FOOTSPOT_HMAC_SECRET=<shared HMAC secret — same one used by intersport-events authentication>
FOOTSPOT_FUNCTIONS_BASE_URL=https://<footspot-project-ref>.supabase.co/functions/v1
```

---

## Part 6 — Backorder Dates & Low-Stock Notifications

### Overview

When a product runs out of stock, the admin can set a **future restock date**. Customers can still place orders — the product page and cart show a banner explaining the delivery delay. After every paid order, the system checks the post-decrement stock of each ordered product and notifies admins/employees the **first time** a product crosses below the **50-unit** threshold (no spam — only the threshold-crossing event triggers a notification).

---

### 6.1 DB Migration

```sql
ALTER TABLE public.products
  ADD COLUMN available_from date;   -- * nullable; meaningful when stock_quantity = 0

CREATE TABLE public.low_stock_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  current_stock   integer NOT NULL,
  notified_at     timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id)
);

-- * one open (unacknowledged) notification per product at a time — enforced by partial unique index
CREATE UNIQUE INDEX low_stock_notifications_one_open_per_product
  ON public.low_stock_notifications(product_id)
  WHERE acknowledged_at IS NULL;
```

> Assumes `products.stock_quantity integer NOT NULL` already exists. If not, add it as part of the same migration.

---

### 6.2 Admin UI — Set Restock Date

On `/admin/products/[id]`:
- New field **"Available from"** (date picker, optional). Visible always; intended use is when `stock_quantity = 0`
- When admin saves the form with `stock_quantity > 0`, the field is **automatically cleared** server-side (a stocked product needs no restock date)

---

### 6.3 Customer UI — Out-of-stock with Delivery Delay

On the product detail page and inside the cart:

| Stock state | UI |
|---|---|
| `stock_quantity > 0` | Render normally |
| `stock_quantity = 0` AND `available_from IS NOT NULL` | Yellow banner: *"Out of stock — restocked on **{available_from}**. You can still order; your delivery will be sent after this date."* Add-to-cart stays enabled. |
| `stock_quantity = 0` AND `available_from IS NULL` | Red banner: *"Out of stock — restock date to be confirmed."* Add-to-cart stays enabled (admin can set the date later and the order will dispatch then). |

The order confirmation email and the magic-link order page surface the **latest** of all `available_from` dates across the order's items as the expected dispatch / pickup-ready date. For Colissimo orders, the label is generated immediately at `paid` regardless of restock — but the package is held until the latest restock date is reached (admin gates the "Confirm handed to La Poste" action manually).

---

### 6.4 Low-stock Notification Trigger

Fires inside the same transaction that flips an order to `paid` (across all three entry points: SystemPay IPN, bank-transfer confirmation, and the prepaid €0 fast-path). For each item in the paid order:

```
1. SELECT stock_quantity FROM products WHERE id = item.product_id FOR UPDATE
2. new_stock = stock_quantity - item.quantity
3. UPDATE products SET stock_quantity = new_stock,
                       available_from = (CASE WHEN new_stock > 0 THEN NULL ELSE available_from END)
   WHERE id = item.product_id
4. IF new_stock < 50:
     INSERT INTO low_stock_notifications (product_id, current_stock)
     VALUES (item.product_id, new_stock)
     ON CONFLICT (product_id) WHERE acknowledged_at IS NULL DO NOTHING;
     -- * the partial unique index guarantees idempotency: one open notification per product
5. IF a row was actually inserted (RETURNING):
     - In-app notification + email to all users with role IN ('admin','employee')
     - Subject: "Low stock — {product_name}: {new_stock} left"
```

A new low-stock notification will only re-fire for the same product once the previous one is acknowledged. This avoids alert fatigue when a product steadily drains below 50.

---

### 6.5 Admin UI — Low-stock Panel

Existing admin notification center adds a "Low stock" tab:
- Each row: product name, current stock, notified_at, [Acknowledge] button
- "Acknowledge" → `acknowledged_at = now()`, `acknowledged_by = current user`. Use this after replenishing stock or placing a supplier order
- Bulk-acknowledge action for the whole list
- A separate "Restock manager" view lists every product where `stock_quantity = 0` and lets the admin batch-set `available_from` dates

---

## Implementation Order

The roadmap below interleaves the work in this guide with the parallel **Footspot integration** work tracked in `FOOTSPOT_INTEGRATION.md`. Footspot rows are prefixed `[FS]` so the dev can decide whether to run them on a separate branch — but the order trigger (Phase 3 in the Footspot guide) is the single point that dispatches both order events to Footspot AND the Colissimo label generation, so it MUST be in place before the SystemPay IPN goes live in production.

| Week | Task |
|---|---|
| 1 | SystemPay onboarding via the bank: confirm contract, activate methods (card + PayPal + Apple Pay + Google Pay as needed), grab REST keys + HMAC + endpoint, register IPN URL |
| 1 | DB migration: guest checkout columns (`user_id` nullable, `guest_*`, `access_token`, `idempotency_key`) + `payment_events` table |
| 1 | Email templates folder `_shared/emails/` + `render.ts` + `send.ts` (Brevo wrapper using existing `BREVO_API_KEY`/`BREVO_SENDER_EMAIL`) |
| 1 | `create-order` Edge Function (guest + authenticated, all 3 delivery methods, idempotency check) + Nuxt checkout form with optional guest email block |
| 1 | [FS] DB migrations: `clubs.footspot_linked`, enums, `footspot_integration_requests`, `footspot_links`, `footspot_event_log`, `orders.footspot_member_id` |
| 2 | `create-form-token` Edge Function (with `billingDetails`) + Smartform Vue component (`@lyracom/embedded-form-glue` + theme files) |
| 2 | `validate-payment-hash` Edge Function (browser-side UX check) |
| 2 | `systempay-ipn` Edge Function: HMAC verification + idempotency + `payment_method` extraction; sends `payment-confirmed` email to `user_id` OR `guest_email` |
| 2 | [FS] `lookup-club-by-slug` + `footspot-send-new-club-request` + Flow 2 admin form UI |
| 2 | [FS] `footspot-pairing-complete` + admin notification + club link badge UI |
| 3 | Bank transfer flow (`submit-bank-transfer` + `confirm-bank-transfer`) + admin confirmation UI (RIB on confirmation page AND in `bank-transfer-pending` email) |
| 3 | Refund admin flow via `Transaction/CancelOrRefund` (works on `paid`/`shipped`/`delivered`/`awaiting_pickup`/`picked_up`) |
| 3 | [FS] Product tagging UI (`footspot_category` + per-variant `footspot_size`) |
| 4 | Public order page `/order/[access_token]` (magic-link only — NO account-creation CTA) |
| 4 | [FS] `footspot-validate-purchase-code` (proxy) + checkout "Adhésion club" step |
| 4 | Full payment testing in SystemPay sandbox (test cards from Lyra docs; PayPal sandbox if activated; guest + authenticated flows) |
| 5 | [FS] `footspot-push-event` + **centralized `orders` Postgres trigger** (single source of truth for: Footspot dispatch, Colissimo label kickoff, pickup readiness, refund propagation) + `footspot_event_log` |
| 5 | Colissimo Cbox setup + Suivi v2 key registration |
| 5 | DB migration: `orders.label_pdf_path/label_generated_at`, `colissimo_tracking_log`, `label_errors`, `products.weight_kg`, `labels` storage bucket + RLS |
| 6 | `generate-colissimo-label` Edge Function (sandbox first, using `Imp. des Broderies, 78310 Coignières` as test address) + label PDF storage |
| 6 | Admin "Labels ready" tab UI + download label button + label-error retry |
| 6 | [FS] `footspot-retry-worker` (scheduled) + admin event log UI + manual resend |
| 7 | `confirm-shipped` Edge Function + "Confirm handed to La Poste" button + `shipped` email |
| 7 | Customer order tracking timeline UI (In preparation → Shipped → Delivered) |
| 7 | [FS] Unlink flow + reconciliation cron (daily diff with Footspot) |
| 8 | `colissimo-tracking-worker` scheduled function + `delivered` / return-to-sender email |
| 8 | End-to-end test: payment → label auto-generated (via centralized trigger) → admin confirms → tracking → delivered → Footspot notified |
| 8 | [FS] End-to-end test: Flow 1 + Flow 2 + member purchase + non-member purchase |
| 9 | DB migration: extend `order_status` enum (`awaiting_pickup`, `picked_up`), add `delivery_method` enum, `orders.delivery_method/pickup_shop_id/ready_for_pickup_at/picked_up_at`, `clubs.delivery_*_enabled`, `intersport_shops` table |
| 9 | Admin Intersport-shops CRUD page + per-club delivery method toggles |
| 10 | `mark-ready-for-pickup` + `confirm-picked-up` Edge Functions + `ready-for-pickup` email |
| 10 | Customer delivery method selector (Colissimo / Club pickup / Shop pickup) on club shop pages, with shop dropdown + estimated date (French holiday-aware) |
| 10 | Admin "Pickups" tab (Awaiting truck dispatch / Awaiting customer pickup / Picked up) |
| 11 | Pickup timeline rows on `/order/[access_token]` + Footspot status whitelist update |
| 11 | End-to-end test of all 3 delivery methods: payment → method-specific chain → terminal state → Footspot notified |
| 12 | DB migration: `promo_codes` table, `orders.subtotal_cents/promo_code_id/promo_discount_cents` |
| 12 | Promo code admin CRUD page (`/admin/promo-codes`) + customer apply UI + `validate-promo-code` Edge Function |
| 12 | Atomic promo claim + revert wired into all three payment-success paths (SystemPay, bank, prepaid) + `promo-code-already-redeemed` email |
| 13 | DB migration: `payment_method` enum value `prepaid`, `orders.prepaid_code_ref/prepaid_credit_cents/prepaid_club_id` |
| 13 | `validate-prepaid-code` proxy Edge Function + customer prepaid apply UI (auto-fill identity, hide purchase-code input) |
| 13 | Server-side pricing pipeline (subtotal → promo → prepaid → customer_total) in `create-order` |
| 13 | €0 fast-path: skip the Smartform when total = 0; synthetic `payment_events` row (provider='prepaid') |
| 13 | `intersport-events.order.created` carries `prepaid_code_ref` + amount; failure path refunds + reverts promo + `prepaid-race-loss` email |
| 14 | Admin `/admin/prepaid-orders` reporting page with per-club CSV export for invoicing |
| 14 | Coordination with Footspot side: `prepaid_codes` table, generate Edge Function, `intersport-validate-prepaid-code`, staff Flutter UI (see Footspot integration guide) |
| 15 | DB migration: `products.available_from` + `low_stock_notifications` table with partial unique index |
| 15 | Admin product form: "Available from" field + auto-clear on restock |
| 15 | Customer-side out-of-stock banner (yellow / red variants) on product page + cart + email |
| 15 | Low-stock trigger inside `paid` transaction (all 3 entry points) + admin notification panel + bulk acknowledge + `low-stock-alert` email |
| 16 | Full regression test suite: promo + prepaid + backorder + all delivery methods + Footspot dispatch |
| 16 | Production go-live with real SystemPay / Colissimo / Footspot credentials |





 Lyra test card: 4970 1000 0000 0003, any future expiry, CVV 123.