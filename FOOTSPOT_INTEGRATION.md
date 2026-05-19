# Intersport × Footspot — Integration Guide (Intersport Side)

> **Scope**: Everything to build on the Intersport (Nuxt + Supabase) side to enable the partnership with Footspot.
> **Counterpart guide**: `/home/g1/.ved/footspot/footspot-web/INTERSPORT_INTEGRATION.md`

---

## Core assumptions (different from the previous draft)

- **No customer accounts on Intersport.** Buyers are always guests; account creation is post-payment optional and unrelated to Footspot. → No "club user" UI, no pairing-code paste flow on the customer side.
- **Clubs pre-exist on Intersport** as shop pages (each club has its own catalog before any Footspot integration is set up).
- **Buyer-to-member tracking** uses a **Purchase code** that the member generates inside the Footspot mobile app and pastes at Intersport checkout. No OAuth, no license number, no buyer account.
- **This Intersport instance is one of multiple regional partners on Footspot.** It is identified to Footspot by a `INTERSPORT_PARTNER_ID` (a UUID assigned during the off-app onboarding step, see "Partner registration" below). Every outbound call to Footspot stamps this id in the `X-Intersport-Partner-Id` header. From this instance's perspective nothing is multi-tenant — it talks to one Footspot, the partner-aware machinery lives on Footspot's side.

---

## Shared Contracts

### Season calculation (used on both sides)
```
month < August  →  "{year-1}/{year}"    e.g. April 2026 → "2025/2026"
month ≥ August  →  "{year}/{year+1}"    e.g. September 2026 → "2026/2027"
```

### Request security headers (every cross-service call, both directions)
```
Authorization:           Bearer <per-club-api-token OR per-partner shop-level token>
X-Intersport-Partner-Id: <INTERSPORT_PARTNER_ID>   # * Intersport → Footspot only
X-Signature:             sha256=HMAC(raw_body, FOOTSPOT_SERVICE_SECRET)
X-Timestamp:             Unix epoch seconds
X-Idempotency-Key:       <uuid>
```
Receiver rejects if `|now − timestamp| > 300 s`. Every Intersport → Footspot request MUST include the `X-Intersport-Partner-Id` header — Footspot uses it to look up which HMAC secret to verify the signature with. Footspot → Intersport calls do NOT need the header (this Intersport instance only knows itself).

### Partner registration (one-time, off-app, per Intersport regional instance)
Before any code is wired up, the Footspot PDG creates an `intersport_partners` row for this Intersport region in his Flutter admin UI. He shares back, securely:
- `INTERSPORT_PARTNER_ID` (UUID — copy into env)
- `FOOTSPOT_SERVICE_SECRET` (HMAC secret used for `X-Signature` on every outbound call)
- `INTERSPORT_FOOTSPOT_SERVICE_TOKEN` (Bearer used by `validate-prepaid-code` proxy — see PAYMENT_COLISSIMO_GUIDE.md Part 5)

These three values are the entire bootstrap surface. Lose them and the Footspot PDG must rotate them via the partners screen, after which this instance must redeploy.

### Footspot size enum (valid values for `product_variants.footspot_size`)
```
4XS  3XS  2XS  XS  S  M  L  XL  XXL  3XL  4XL
```

### Footspot stock categories (agree final list with Footspot team)
```
jersey  shorts  socks  ball  cone  bib  goalkeeper_gloves  training_vest  other
```

### Purchase code format
- **8-char uppercase alphanumeric**, ambiguous chars excluded (no `0`, `O`, `1`, `I`, `L`).
- Stored without separators; **rendered with a single space at position 4 for readability** (display only — `H7K3 M9XP`). The space is never sent on the wire or persisted.
- **Single use, 30-day TTL** from generation, invalidated on consumption.
- **Locked to one club** — codes from another club are rejected at validation.

---

## Event Envelope v1

```json
{
  "id": "evt_<uuid>",
  "type": "order.created | order.status_changed | shipment.delivered | order.refunded",
  "version": 1,
  "occurred_at": "ISO8601",
  "intersport_club_id": "<uuid>",
  "footspot_club_id": "<bigint as string>",
  "data": {}
}
```

### `order.created` data payload
```json
{
  "intersport_order_id": "<uuid>",
  "order_number": "ORD-...",
  "order_date": "ISO8601",
  "buyer_name": "Jean Dupont",
  "buyer_email": "jean.dupont@example.com",
  "footspot_member_id": "<user_uuid>",
  "items": [
    {
      "product_id": "<uuid>",
      "product_reference": "REF-001",
      "product_name": "Maillot Domicile",
      "footspot_category": "jersey",
      "image_path": "...",
      "is_pack": false,
      "footspot_size": "L",
      "quantity": 2,
      "flocking_name": "DUPONT",
      "flocking_number": "10",
      "unit_price_paid": 49.90,
      "currency": "EUR"
    }
  ]
}
```

> **Member purchase**: `footspot_member_id` is set (resolved at checkout via code validation). Footspot consumes the active purchase code for that member on receipt and pre-assigns the resulting `user_sku` to them. The code itself is never sent in events — it stays on Footspot's side.
> **Non-member purchase**: `footspot_member_id` is `null`. Footspot records the buyer in its outsider field using a per-club sentinel user.
> **Packs** (`is_pack = true`): one item entry for the pack as a whole — components are NOT expanded.
> **Variants without `footspot_size`** are silently excluded from the items array.

### `order.status_changed` data payload
```json
{
  "intersport_order_id": "<uuid>",
  "order_number": "ORD-...",
  "new_status": "shipped",
  "shipping_tracking": "TRACK123"
}
```

### `shipment.delivered` data payload
```json
{
  "intersport_order_id": "<uuid>",
  "order_number": "ORD-...",
  "delivered_at": "ISO8601"
}
```

### `order.refunded` data payload
```json
{
  "intersport_order_id": "<uuid>",
  "order_number": "ORD-...",
  "refund_total": 49.90,
  "currency": "EUR"
}
```

---

## Two Integration Flows

### Flow 1 — Club already on Footspot (director-initiated, fully in-app)
1. Club director (only role allowed) opens his **Stock screen** in the Footspot mobile app → taps **"Request Intersport integration"** → enters the **Intersport shop-page URL** for his club.
2. Footspot calls Intersport's public `lookup-club-by-slug` to resolve `intersport_club_id` from the URL slug.
3. Request is queued to the Footspot owner (PDG) on his mobile app.
4. PDG accepts → Footspot generates a `club_api_token`, inserts an `intersport_links` row on its side.
5. Footspot calls Intersport's `footspot-pairing-complete` (HMAC-signed) with `intersport_club_id`, `footspot_club_id`, `api_token`.
6. Intersport activates the link, sets `clubs.footspot_linked = true`, inserts an in-app notification for every admin profile.

### Flow 2 — Club not yet on Footspot (off-app phone call → admin form)
1. Club director phones Intersport owner directly. **This step is outside the app.**
2. Intersport admin opens the admin panel → **"Send Footspot integration request"** form → picks the Intersport club, fills `contact_email`, `contact_phone`, `club_name`, `director_name` → submit.
3. Submit calls `footspot-send-new-club-request` → emails the Footspot owner with all fields including `intersport_club_id`.
4. Footspot owner uses his mobile app to manually create the new Footspot club, then activates the link from the same workflow.
5. Footspot calls `footspot-pairing-complete` (same endpoint as Flow 1) → Intersport activates the link, notifies admins.
6. PDG contacts the club director directly to onboard them.

---

## Phase 1 — Database Migrations

### 1.1 Extend `clubs`
```sql
ALTER TABLE public.clubs
  ADD COLUMN footspot_linked boolean NOT NULL DEFAULT false;
```
> **Removed from the previous draft**: `club_manager_id` is **not** added — there is no club-user concept on Intersport.

### 1.2 New enums
```sql
CREATE TYPE footspot_request_status AS ENUM ('sent', 'completed', 'failed');
CREATE TYPE footspot_event_status   AS ENUM ('pending', 'sent', 'failed', 'acknowledged');
CREATE TYPE footspot_link_status    AS ENUM ('active', 'revoked');
CREATE TYPE footspot_stock_type     AS ENUM (
  'jersey','shorts','socks','ball','cone','bib',
  'goalkeeper_gloves','training_vest','other'
);
```

### 1.3 `footspot_integration_requests` (Flow 2 audit trail only)
Records every email-form sent by an Intersport admin to the Footspot owner. Flow 1 doesn't touch this table — it starts on the Footspot side.
```sql
CREATE TABLE public.footspot_integration_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES public.clubs(id),
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  contact_name  text NOT NULL,
  club_name     text NOT NULL,
  status        footspot_request_status NOT NULL DEFAULT 'sent',
  sent_by       uuid NOT NULL REFERENCES public.profiles(id),
  sent_at       timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
```

### 1.4 `footspot_links`
One row per active club pairing.
```sql
CREATE TABLE public.footspot_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id             uuid NOT NULL UNIQUE REFERENCES public.clubs(id),
  footspot_club_id    text NOT NULL,
  api_token_encrypted text NOT NULL,
  status              footspot_link_status NOT NULL DEFAULT 'active',
  linked_at           timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz
);
```

### 1.5 Extend `product_variants` — Footspot size mapping
```sql
ALTER TABLE public.product_variants
  ADD COLUMN footspot_size text CHECK (
    footspot_size IS NULL OR footspot_size IN (
      '4XS','3XS','2XS','XS','S','M','L','XL','XXL','3XL','4XL'
    )
  );
```
`NULL` = this variant is not synced to Footspot.

### 1.6 Extend `products` — Footspot category tag
```sql
ALTER TABLE public.products
  ADD COLUMN footspot_category footspot_stock_type;
```
`NULL` = product is not eligible for Footspot sync.

### 1.7 Extend `orders` — Footspot member capture
```sql
ALTER TABLE public.orders
  ADD COLUMN footspot_member_id uuid;
```
`NULL` when the buyer declared "not a member" at checkout. The purchase code itself is **not stored on the Intersport side** — once validated at checkout, only the resolved `member_id` is kept. Footspot already holds the code in its `purchase_codes` table and will consume the active code for `(member_id, club_id)` when it receives `order.created`.

### 1.8 `footspot_event_log`
Delivery audit and retry tracking.
```sql
CREATE TABLE public.footspot_event_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  club_id         uuid NOT NULL REFERENCES public.clubs(id),
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  status          footspot_event_status NOT NULL DEFAULT 'pending',
  attempts        smallint NOT NULL DEFAULT 0,
  last_error      text,
  next_retry_at   timestamptz,
  acknowledged_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

> **Removed from the previous draft**: `footspot_link_codes` is gone (no pairing-code mechanic).

---

## Phase 2 — Edge Functions

All functions live under `supabase/functions/`.

> **Removed from the previous draft**: `footspot-receive-request`, `footspot-admin-decide`, `footspot-redeem-code` — none are needed now.

---

### `lookup-club-by-slug` — POST *(used by Footspot in Flow 1, pre-pairing)*
**Caller**: Footspot Edge Function called from `intersport-request-from-director` to resolve `intersport_club_id` from the shop URL the director provided.
**Auth**: HMAC signed with `FOOTSPOT_SERVICE_SECRET` (no per-club Bearer — no link exists yet at this point). Standard `X-Signature` + `X-Timestamp` + `X-Idempotency-Key` headers required.

**Input**
```json
{ "slug": "as-saint-denis" }
```

**Logic**
1. Verify HMAC + timestamp.
2. Look up `clubs` by URL slug.
3. Return minimal info needed for the request flow — never expose internal fields beyond what's listed.

**Output**
```json
{ "club_id": "<uuid>", "name": "AS Saint-Denis", "footspot_linked": false }
```
404 if no match. If `footspot_linked = true`, Footspot must surface a clear error to the director ("Cette page club est déjà liée à un compte Footspot").

---

### `footspot-send-new-club-request` — POST *(Flow 2)*
**Caller**: Intersport admin UI form.
**Auth**: Supabase session, `role = 'admin'`.

**Input**
```json
{
  "club_id": "<intersport_club_id>",
  "club_name": "AS Saint-Denis",
  "contact_name": "Jean Dupont",
  "contact_email": "director@assaintdenis.fr",
  "contact_phone": "+33612345678"
}
```

**Logic**
1. Verify session role and that `club_id` exists, has no active `footspot_links` row, and has no recent (`< 7 days`) `sent` request.
2. Insert `footspot_integration_requests` (`status = 'sent'`).
3. Send email to `FOOTSPOT_OWNER_EMAIL` containing all fields plus `intersport_club_id` (a copyable plain-text block PDG will paste in his app).
4. Return inserted request id.

**Output**
```json
{ "request_id": "<uuid>" }
```

---

### `footspot-pairing-complete` — POST *(unified activation callback for both flows)*
**Caller**: Footspot — once the PDG has accepted (Flow 1) or manually created the club + activated the link (Flow 2).
**Auth**: HMAC signed with `FOOTSPOT_SERVICE_SECRET`.

**Input**
```json
{
  "intersport_club_id": "<uuid>",
  "footspot_club_id": "42",
  "api_token": "..."
}
```

**Logic**
1. Verify HMAC + timestamp.
2. Verify `intersport_club_id` exists. **Idempotency**: if an active `footspot_links` row already exists for this `(club_id, footspot_club_id)`, return 200 silently.
3. Encrypt `api_token` using `API_TOKEN_ENCRYPTION_KEY` (AES-256-GCM).
4. Insert `footspot_links` (`status = 'active'`).
5. Set `clubs.footspot_linked = true`.
6. If a matching `footspot_integration_requests` row exists for this `club_id`: mark it `completed`.
7. Insert in-app notification for every admin profile (`kind = 'footspot_link_active'`).

**Output**
```json
{ "ok": true }
```

---

### `footspot-validate-purchase-code` — POST *(checkout)*
**Caller**: Intersport Nuxt frontend during checkout.
**Auth**: Supabase anon session (guest checkout supported).

**Input**
```json
{
  "club_id": "<intersport_club_id>",
  "code": "H7K3M9XP"
}
```

**Logic**
1. Look up `footspot_links` for `club_id`. If no active row → return `{ "valid": false, "reason": "club_not_linked" }`.
2. Decrypt `api_token`. POST to Footspot's `intersport-validate-purchase-code` (HMAC + Bearer, full security headers).
3. Forward Footspot's response unchanged. **No state is mutated** here — code consumption happens on `order.created`.

**Output (member match)**
```json
{ "valid": true, "member_id": "<user_uuid>", "member_name": "Lucas Dupont" }
```

**Output (no match)**
```json
{ "valid": false, "reason": "code_invalid | code_expired | code_consumed | wrong_club | club_not_linked" }
```

---

### `footspot-push-event` — internal helper
Called by the order trigger function. Not exposed publicly.

**Logic**
1. Get `footspot_links` for `club_id` → decrypt `api_token`.
2. Build signed event envelope.
3. POST to `${FOOTSPOT_FUNCTIONS_BASE_URL}/intersport-events` with full security headers.
4. Log result to `footspot_event_log`.
5. On failure: set `status = 'failed'`, compute `next_retry_at` with exponential backoff:
   - Attempt 1 → +5 min
   - Attempt 2 → +15 min
   - Attempt 3 → +1 h
   - Attempt 4 → +4 h
   - Attempt 5 → +24 h → give up, notify admin

---

### `footspot-retry-worker` — POST *(scheduled every 5 minutes)*
**Caller**: Supabase cron.

```sql
SELECT * FROM footspot_event_log
WHERE status = 'failed'
  AND next_retry_at <= now()
  AND attempts < 5
```
Re-invoke `footspot-push-event` for each result.

---

## Phase 3 — Order Trigger

After any `orders.status` update, call `footspot-push-event` when:
- `orders.club_id` has an `active` row in `footspot_links`
- New status maps to a Footspot event

| `orders.status`        | Event type              |
|------------------------|-------------------------|
| `paid`                 | `order.created`         |
| `shipped`              | `order.status_changed`  |
| `delivered`            | `shipment.delivered`    |
| `refunded`             | `order.refunded`        |
| `partially_refunded`   | `order.refunded`        |
| `cancelled`            | `order.status_changed`  |

Implement as a Supabase Database Webhook on `orders` or a Postgres trigger calling `pg_net.http_post`. **The trigger is the single source of truth for Footspot dispatch** — every `orders.status` transition fires through it. Per-handler push calls (`confirm-shipped`, the Colissimo tracking worker, refund admin UI, payment webhooks) must NOT also push events directly, to avoid double dispatch.

For `order.created`, the payload **must** include:
- `footspot_member_id` from `orders.footspot_member_id` (null for non-member buyers)
- `buyer_name` resolved as `COALESCE(profiles.full_name, orders.guest_first_name || ' ' || orders.guest_last_name)`
- `buyer_email` resolved as `COALESCE(profiles.email, orders.guest_email)`

---

## Phase 4 — Admin Panel UI

### Integration management
- **Send new club request form** (Flow 2 entry): club picker (existing Intersport clubs without a Footspot link), contact name/email/phone, submit → `footspot-send-new-club-request`. Confirmation toast.
- **Integration requests history**: list of `footspot_integration_requests` with status badge (`sent` / `completed` / `failed`), sender, timestamps.
- **Notifications panel**: shows `footspot_link_active` notifications when activation callbacks land, plus event-failure notifications from the retry worker.

### Club detail page
- Footspot link badge: not linked / active / revoked.
- "Unlink Footspot" action (sets `footspot_links.status = 'revoked'`, `clubs.footspot_linked = false`). Confirm dialog explaining ongoing orders still process; only new events stop.
- Event log table: `footspot_event_log` rows with manual resend button per failed row.

### Product management
- `footspot_category` dropdown on product edit form (optional).
- When a category is set: per-variant `footspot_size` mapping UI — dropdown with the 11 valid sizes + "Ne pas synchroniser" option (maps to `NULL`).

---

## Phase 5 — Customer Checkout UI

> **Visibility rule**: only show this step when the cart's club has an active `footspot_links` row. Otherwise: **skip entirely** — buyer never sees the prompt.

### Checkout step "Adhésion club"
1. Radio: **"Êtes-vous adhérent du club ?"** Options: `Oui` / `Non`. Default: `Non`.
2. **Non** → no extra field, proceed to payment.
3. **Oui** → required text input: **"Code d'achat Footspot"** (8 chars, force uppercase, no ambiguous chars). Render the input value with a visual space at position 4 (`H7K3 M9XP`); the underlying value has no space.
4. Live validation when 8 valid chars are entered: call `footspot-validate-purchase-code`.
   - **Valid** → green confirmation: *"Achat lié à {member_name}"*. Store `code` and `member_id` in cart state.
   - **Invalid** → red error mapped from `reason` (`code_invalid` → "Code invalide", `code_expired` → "Code expiré", `code_consumed` → "Code déjà utilisé", `wrong_club` → "Code non valable pour ce club"). Two buttons: **"Réessayer"** and **"Je ne suis pas adhérent"** (switches the radio to `Non`).
5. **Pay button is disabled while the radio is `Oui` and no valid code is set.** *Pas de code, pas de paiement.*
6. On order creation: persist `footspot_member_id` on the `orders` row. The purchase code itself is not stored on the Intersport side — only the resolved `member_id` is kept. Footspot will look up and consume the active code for `(member_id, club_id)` when it receives `order.created`.

---

## Environment Variables

Add to `supabase/functions/.env` (set via `supabase secrets set`):

```
FOOTSPOT_SERVICE_SECRET=<shared_hmac_secret_agreed_with_footspot_team>
FOOTSPOT_FUNCTIONS_BASE_URL=https://<footspot-project-ref>.supabase.co/functions/v1
FOOTSPOT_OWNER_EMAIL=<email_of_footspot_pdg_for_flow_2_form>
API_TOKEN_ENCRYPTION_KEY=<32_byte_hex_key_for_encrypting_stored_tokens>
```

Never store these in the DB or commit them to git.

---

## Implementation Order

| Week | Task |
|------|------|
| 1    | DB migrations (clubs column, enums, footspot_integration_requests, footspot_links, footspot_event_log, orders columns) |
| 2    | `lookup-club-by-slug` (public) + `footspot-send-new-club-request` + Flow 2 admin form UI |
| 2    | `footspot-pairing-complete` + admin notification + club link badge UI |
| 3    | Product tagging UI (`footspot_category` + per-variant `footspot_size`) |
| 4    | `footspot-validate-purchase-code` (proxy) + checkout "Adhésion club" step |
| 5    | `footspot-push-event` + order trigger + `footspot_event_log` |
| 6    | `footspot-retry-worker` (scheduled) + admin event log UI + manual resend |
| 7    | Unlink flow + reconciliation cron (daily diff with Footspot) |
| 8    | End-to-end test Flow 1 + Flow 2 + member purchase + non-member purchase |
