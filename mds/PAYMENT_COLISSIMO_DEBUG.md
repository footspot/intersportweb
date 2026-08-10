# Payment & Colissimo Debug Log

Reference companion to `PAYMENT_COLISSIMO_GUIDE.md`. Captures the bugs found and fixes applied across the SystemPay → Brevo → Colissimo chain so they can be re-diagnosed quickly if anything regresses.

Spans **2026-05-15 → 2026-05-19**. Project: `hznvltijxkeadqpwctop` (Supabase).

---

## 1. SSR hydration mismatches (frontend)

**Symptom** — browser console:
- `LayoutAppHeader`: server rendered `<!---->`, client expected `<span>`.
- `Checkout`: server rendered the empty-cart `<div>`, client expected `<form>`.

**Root cause** — `useCartStore` is backed by `useStorage` (localStorage). On the server, cart is always empty; on hydration it's populated. Branches diverge.

**Fixes**
- `app/components/layout/AppHeader.vue:108` — cart count badge wrapped in `<ClientOnly>`.
- `app/pages/checkout.vue:252` — entire cart-state-dependent block wrapped in `<ClientOnly>` with a spinner fallback.

**How to verify** — open `/` and `/checkout` in a logged-out browser, watch the console: no "Hydration node mismatch" warnings.

---

## 2. SystemPay IPN failures

The IPN went through three stacked failures, each masking the next.

### 2.1 `unsupported_hash_algorithm` (HTTP 400 from your code)

**Symptom** — SystemPay back-office shows `FAILED_SERVER_400_ERROR, response={"error":"unsupported_hash_algorithm"}`.

**Root cause** — Lyra's IPN sends a `kr-hash-key` form field telling you which secret signed the payload: `sha256_hmac` (the HMAC flag) or `password` (the REST private key). The handler only accepted `sha256_hmac`. Back-office was configured for `password` mode.

**Fix** — `supabase/functions/systempay-ipn/index.ts` now accepts both modes and selects the right secret (`SYSTEMPAY_HMAC_KEY` vs `SYSTEMPAY_PASSWORD`). Cryptographically equivalent; `sha256_hmac` is preferred operationally (smaller blast radius if leaked).

**Verify** — back-office → *Settings → Notification rules → IPN → Voir les exécutions*; recent attempts return 200.

### 2.2 `UNAUTHORIZED_NO_AUTH_HEADER` (HTTP 401 from Supabase gateway)

**Symptom** — SystemPay log: `FAILED_SERVER_401_ERROR, response={"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`. Supabase function logs show **no invocations** for the timeframe.

**Root cause** — Supabase edge functions default `verify_jwt: true`. SystemPay's POST has no JWT; the gateway rejects before the function runs.

**Fix** — `supabase/config.toml`:

```toml
[functions.systempay-ipn]
verify_jwt = false
```

Deployed with `supabase functions deploy systempay-ipn --no-verify-jwt`. The function still self-authenticates via the HMAC check on the body.

**Verify** — Supabase dashboard → Edge Functions → `systempay-ipn` → Logs shows POST entries with 200.

### 2.3 No invoice generated post-paid

**Symptom** — paid orders have `invoice_path = NULL`. Customer sees no invoice link.

**Root cause** — the (now-deleted) `webhook-stripe` had a `dispatchPaidSideEffects` helper that called `generate-invoice`. The SystemPay IPN was never wired the same way.

**Fix** — `supabase/functions/systempay-ipn/index.ts` now has a `callInternal()` helper (service-role POST) that fires `generate-invoice` after `process_paid_order` succeeds, fire-and-forget. Errors are logged but don't fail the IPN (Lyra retries on non-2xx).

**Verify**:
```sql
SELECT order_number, invoice_path FROM orders WHERE status='paid' ORDER BY created_at DESC LIMIT 3;
```
After a fresh paid order, `invoice_path` should be `<year>/<order_number>.pdf`.

### 2.4 Silent Brevo failures swallowed

**Symptom** — IPN returned 200 with execution time consistent with a Brevo round-trip, but no email arrived.

**Root cause** — the IPN's `catch` block around `sendOrderEmail()` only `console.error`'d the raw error object. Default `Error` stringification hid the detail.

**Fix** — error log now includes `order_number`, `order_id`, `recipient`, `template`, full `error.message + stack`. Look in **Edge Functions → systempay-ipn → Logs (stderr)** for `[systempay-ipn] payment-confirmed email FAILED`.

---

## 3. Stripe purge (2026-05-15)

Stripe was scaffolded but never used; SystemPay is the only payment processor.

**Removed**
- `supabase/functions/webhook-stripe/` (local + remote)
- `server/payments/` (whole directory — `index.ts`, `types.ts`, `providers/stripe.ts`, `README.md`)
- `app/components/checkout/PaymentSelector.vue`
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` from `nuxt.config.ts`
- `[functions.webhook-stripe]` block in `config.toml`

**Not Stripe** — the `stripe: 'bg-brand-…'` strings in `app/pages/admin/index.vue` are decorative CSS class names (top stripe on KPI cards), unrelated to payment.

---

## 4. Admin status workflow tightened

**Why** — once the IPN flow worked, allowing an admin to manually flip `pending → paid` became dangerous (would bypass `process_paid_order`'s stock decrement + fund credit + email).

**Fix** — central `ORDER_TRANSITIONS` map in `app/stores/orders.ts`. `pending` only allows `['cancelled']`. Both `Table.vue` dropdown and `OrderDetailDrawer.vue` action row consume it.

**Note** — when the bank-transfer purge happened (§ 9), `pending_bank_transfer` was also dropped from this map.

---

## 5. Brevo configuration

Brevo silently failed for stacked reasons. Diagnosed live by a temp `brevo-status` edge function calling `/v3/account`, `/v3/senders`, `/v3/senders/domains`.

| Order | Issue | Status |
|---|---|---|
| 1 | `BREVO_API_KEY` invalid (401 *Key not found*) | Fixed: new key set 2026-05-15 |
| 2 | `BREVO_SENDER_EMAIL` was the literal string `"set"` | Fixed: pointed at `kalilou.conte@footspot.co` |
| 3 | `no-reply@intersportclubidf.com` not verified in Brevo | Fixed: reverted to `kalilou.conte@footspot.co` |
| 4 | Zero authenticated domains (DKIM/SPF/DMARC) | **Deploy-gated** — DNS records can only land when production DNS goes live |

**Pre-deploy reality** — Brevo *accepts* sends (Brevo's API returns 201 + messageId), but Gmail/Yahoo/Outlook will deprioritise or spam-bin them because the sender domain isn't authenticated. Working as designed for now.

**Verify**
```bash
curl -H "api-key: <BREVO_API_KEY>" https://api.brevo.com/v3/senders
```
Returns array containing a sender whose `email` matches `BREVO_SENDER_EMAIL`. Any other state means a send will be rejected as *invalid sender*.

**Memory** — `~/.claude/projects/-home-g1--ved-intersport/memory/project_brevo_dns_pending.md`.

---

## 6. Colissimo label generation — five stacked bugs

### 6.1 SOAP endpoint receiving JSON

**Symptom** — `label_errors` shows `multipart/xop+xml` SOAP fault: `Unexpected character '{' (code 123) in prolog`.

**Root cause** — `COLISSIMO_ENDPOINT` was set to `https://ws.colissimo.fr/sandbox/sls-ws/SlsServiceWS/2.0` (SOAP service); the function sends JSON. SLS has two endpoints on the same host:

| Path | Format |
|---|---|
| `/sls-ws/SlsServiceWS/2.0` | SOAP/XML |
| `/sls-ws/SlsServiceWSRest/2.0` | JSON |

**Fix** — secret updated:
```bash
supabase secrets set COLISSIMO_ENDPOINT=https://ws.colissimo.fr/sandbox/sls-ws/SlsServiceWSRest/2.0
```
Also fixed the function's default fallback in `supabase/functions/generate-colissimo-label/index.ts:66` (was pointing at SOAP).

### 6.2 Supabase gateway 401 on internal call

**Symptom** — probe returned `{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT"}`.

**Root cause** — Supabase moved service-role keys to the new `sb_secret_...` format (not a JWT). When the trigger / internal-callers pass it as `Authorization: Bearer ...`, the gateway rejects.

**Fix** — `supabase/config.toml`:
```toml
[functions.generate-colissimo-label]
verify_jwt = false

[functions.colissimo-tracking-worker]
verify_jwt = false
```
Both functions self-authenticate via `X-Internal-Call` header check.

### 6.3 `depositDate` format

**Symptom** — Colissimo returned 400: *Cannot deserialize value of type java.util.Date from "19/05/2026": expected format "yyyy-MM-dd"*.

**Root cause** — function emitted French `dd/MM/yyyy`. SLS REST wants ISO.

**Fix** — `generate-colissimo-label/index.ts` `depositDate()` returns `new Date().toISOString().slice(0, 10)`.

### 6.4 `countryCodeFor` operator precedence

**Symptom** — Colissimo: *Le code pays du destinataire est incorrect* (id 30207). Outgoing payload had `countryCode: "FRANCE"`.

**Root cause**:
```ts
return m[country] ?? country.length === 2 ? country.toUpperCase() : 'FR'
```
JS parses as `(m[country] ?? (country.length === 2)) ? country.toUpperCase() : 'FR'`. For `"France"`, `m["France"]='FR'` is truthy → ternary returns `country.toUpperCase()` = `"FRANCE"`.

**Fix** — split into explicit `if`s (`generate-colissimo-label/index.ts:countryCodeFor`).

### 6.5 multipart/related response not parsed

**Symptom** — `JSON.parse: No number after minus sign in JSON at position 3 (line 2 column 2)` — choking on the `--<boundary>` delimiter.

**Root cause** — SLS REST success responses are **multipart/related** with two parts: `<jsonInfos>` (the JSON metadata) and `<label>` (binary PDF bytes). The function only handled plain JSON. Worse, the content-type detection check `contentType.includes('application/json')` passed because the multipart header was `multipart/related; ...; type="application/json"`.

**Fix** — added `parseMultipart()` + `extractBoundary()` to `generate-colissimo-label/index.ts`. New flow:
1. Read response as `ArrayBuffer` (preserves binary).
2. If `content-type.startsWith('multipart/related')` → split by boundary, extract `<jsonInfos>` part and `<label>` part.
3. Else parse the whole body as JSON.
4. Fall back to `pdfUrl` / base64 `label` if the multipart binary part was absent.

Also fixed the response key: v2 schema uses `labelV2Response`, not `labelResponse`. Interface now handles both.

**Verify after fix**:
```sql
SELECT order_number, label_pdf_path, shipping_tracking FROM orders WHERE order_number IN ('CMD-2026-G8TF8G','CMD-2026-4Z8GFU');
```
Should show populated `label_pdf_path` of shape `<order-uuid>/label.pdf` and `shipping_tracking` like `6C99999999990` (sandbox-fake parcel number).

PDF is in the private `labels` bucket. Generate a signed URL with:
```sql
-- via the admin client (Storage RLS allows is_backoffice()).
```

---

## 7. Suivi v2 tracking worker

**Symptom** — `colissimo-tracking-worker` 500'd on every cron tick (every 2h).

**Root cause** — `COLISSIMO_SUIVI_KEY` (X-Okapi-Key from developer.laposte.fr) was not set.

**Fix** — secret set. Function then returns 200 with `processed: N`. Confirmed end-to-end against seed shipped orders.

**Verify**:
```sql
SELECT id, status_code, LEFT(content::text, 200) AS body, created FROM net._http_response WHERE id IN (SELECT id FROM net._http_response ORDER BY id DESC LIMIT 5) ORDER BY id DESC;
```
Look for entries from `colissimo-tracking-worker` returning 200.

---

## 8. confirm-shipped + customer tracking timeline (Week 7)

Server-side validation only — admin browser-side button click is the final E2E test left to the user.

**Validated**
- `shipped.html` template variables (`{{order_number}}`, `{{customer_name}}`, `{{tracking_number}}`, `{{tracking_url}}`, `{{magic_link}}`) match what `confirm-shipped` passes.
- `get_order_by_token` returns `to_jsonb(o)` so `shipped_at` / `delivered_at` flow through automatically.
- Customer page timeline at `app/pages/order/[access_token].vue:152-164` computes `[paid ✓, shipped (current), delivered ⊙]` correctly when status=shipped.
- Brevo accepted the `shipped` email via the same shared `sendOrderEmail()` path.
- Admin button at `app/pages/admin/labels.vue:141-143` correctly calls `invokeEdge('confirm-shipped')`.

**Test order** — `CMD-2026-G8TF8G` was left in `status=shipped` for downstream delivered-flow tests. `6C99999999990` is a sandbox-fake parcel number; Suivi v2 won't have real events for it.

---

## 9. Admin label download / print

**Symptom** — once an order ships, it disappears from `/admin/labels` (filter is `status='paid'`). No other UI surfaced the PDF, so a re-print was impossible.

**Fixes**
- `app/components/admin/orders/OrderDetailDrawer.vue` — new "Étiquette (imprimer)" button (i-lucide-printer icon) appears whenever `detail.label_pdf_path` is set. Opens the signed PDF URL in a new tab (browser's PDF viewer exposes Save + Print).
- `app/pages/admin/labels.vue` download handler — silent failure swallowed `createSignedUrl` errors. Now surfaces them via the page's flash.
- `app/stores/orders.ts` — `Order` interface extended with `label_pdf_path` + `label_generated_at`.
- i18n key `admin.orders.detail.openLabel` added (FR/EN).

RLS for the `labels` bucket was already correct (`backoffice reads labels` policy with `is_backoffice()` check).

---

## 10. Auto-label trigger (Week 5 closure)

**Discovery** — migration `20260511082900_orders_status_trigger.sql` already had the full implementation but silently no-op'd because two Vault secrets were missing.

**Fix** — set Vault secrets via Supabase dashboard:

```sql
SELECT vault.create_secret('https://hznvltijxkeadqpwctop.supabase.co', 'supabase_url');
SELECT vault.create_secret('<service-role-key>', 'service_role_key');
```

The trigger `orders_status_changed` fires `AFTER INSERT OR UPDATE OF status ON orders` and, when `NEW.status='paid' AND NEW.delivery_method='colissimo' AND NEW.label_pdf_path IS NULL`, calls `generate-colissimo-label` via `pg_net.http_post`.

**Verify**:
```sql
-- Reset 4Z8GFU back to pending then re-flip; trigger should regenerate the label within ~5s.
UPDATE orders SET label_pdf_path=NULL, label_generated_at=NULL, shipping_tracking=NULL, status='pending' WHERE order_number='CMD-2026-4Z8GFU';
UPDATE orders SET status='paid' WHERE order_number='CMD-2026-4Z8GFU';
-- wait 5s
SELECT order_number, label_pdf_path, shipping_tracking FROM orders WHERE order_number='CMD-2026-4Z8GFU';
```

`label_pdf_path` should be populated. To inspect the pg_net response:

```sql
SELECT id, status_code, LEFT(content::text, 300) AS body, created FROM net._http_response ORDER BY id DESC LIMIT 3;
```

**Failure mode** — if Vault secrets are unset, the trigger emits a `RAISE WARNING` and returns. Check Postgres logs for `service_role_key vault secret missing — skipping dispatch`.

---

## 11. Bank transfer fully purged (2026-05-19)

**Why** — client confirmed no bank transfer in the project; SystemPay only.

**Migration** — `supabase/migrations/20260519080000_drop_bank_transfer.sql`:
1. Reclassified 2 seed rows (`ORD-2026-1016` → cancelled, `ORD-2026-1007` → payment_method null).
2. Dropped + recreated `order_status` enum without `pending_bank_transfer`. Postgres can't `ALTER TYPE ... DROP VALUE`, so the type is recreated and the column re-typed with `USING status::text::order_status_new`. Had to drop the column `DEFAULT` and the `orders_status_changed` trigger first (both depend on the column type).
3. Dropped + recreated `payment_method` enum without `bank_transfer`. Same recreate pattern.
4. Restored the trigger at the end.

**Code purged**
- `app/stores/orders.ts` — enum union members, `ORDER_TRANSITIONS` row, comment rationale.
- `app/components/admin/orders/Table.vue` — `STATUS_STYLE` row.
- `app/pages/order/[access_token].vue` — `pending_bank_transfer` banner, bankTransfer payment label branch, `isBankTransferPending` computed.
- `supabase/functions/backoffice-orders/index.ts` — entire `becamePaid` branch (IPN owns paid).
- `supabase/functions/create-order/index.ts` — comment fix.
- `nuxt.config.ts` — default `paymentProvider` flipped from `'bank_transfer'` to `'card'`.

**Templates + i18n**
- Deleted `bank-transfer-confirmed.html` + `bank-transfer-pending.html`.
- Removed both entries from `_shared/emails/templates.ts`.
- Removed `checkout.payment.bankTransfer*` keys + `orders.bankTransfer.*` block + `pending_bank_transfer` status labels from `i18n/locales/{fr,en}.json`.

**Verify after migration**
```sql
SELECT typname, array_agg(enumlabel ORDER BY enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE typname IN ('order_status','payment_method') GROUP BY typname;
```
Should NOT contain `pending_bank_transfer` or `bank_transfer`.

---

## Test data state (as of 2026-05-19)

| Order | Status | Notes |
|---|---|---|
| `CMD-2026-G8TF8G` | shipped | Has label `333ef55b-…/label.pdf`. Manually advanced via SQL during § 8 testing. |
| `CMD-2026-4Z8GFU` | paid | Has label `8fec0d27-…/label.pdf` (regenerated by auto-trigger). Useful seed for "ready to ship" UX. |
| `CMD-2026-DP89U1` | delivered | Legacy/pre-fix. `payment_method=NULL`, `payment_id=NULL` (was manually advanced before the manual-paid transition was removed). |
| `ORD-2026-1016` | cancelled | Was `pending_bank_transfer` before § 11. |
| `ORD-2026-1007` | delivered | `payment_method` cleared by § 11 migration. |

---

## Outstanding items / known gaps

- **Brevo DKIM** — gated on production DNS cutover. Until then, deliveries land in spam for some receivers. Memory: `project_brevo_dns_pending.md`.
- **Refund flow** — `refund-order` function exists, untested end-to-end against Lyra `Transaction/CancelOrRefund`.
- **Delivered E2E** — `colissimo-tracking-worker` runs but won't flip status because sandbox parcel numbers have no real Suivi events. Need to inject a synthetic `colissimo_tracking_log` row with code `DR1` to test the worker's terminal-status branch.
- **Promo codes / prepaid codes / backorder dates** — not built (Weeks 12-15).
- **Centralized trigger v2** — current trigger only dispatches Colissimo label. The roadmap plans for it to also fire Footspot events when that integration lands.

---

## Quick env-var checklist (Supabase secrets)

These must all be set in the project's Supabase secrets for the chain to work:

| Secret | Purpose | Failure mode if wrong |
|---|---|---|
| `SYSTEMPAY_USERNAME` | numeric shop id | `create-form-token` 401 |
| `SYSTEMPAY_PASSWORD` | REST private key | `create-form-token` 401 |
| `SYSTEMPAY_PUBLIC_KEY` | Smartform public key | browser-side form load fails |
| `SYSTEMPAY_HMAC_KEY` | IPN HMAC (if `kr-hash-key=sha256_hmac`) | IPN 401 `invalid_hash` |
| `SYSTEMPAY_ENDPOINT` | Lyra API host | `create-form-token` connection refused |
| `BREVO_API_KEY` | Brevo auth | every email 401 |
| `BREVO_SENDER_EMAIL` | Verified sender on Brevo | every email 400 *Invalid sender* |
| `COLISSIMO_API_KEY` | SLS REST apikey header | label 401 |
| `COLISSIMO_CONTRACT` | Numeric contract number | label 400 |
| `COLISSIMO_ENDPOINT` | **Must contain `SlsServiceWSRest`, not `SlsServiceWS`** | label SOAP fault on JSON body |
| `COLISSIMO_PRODUCT_CODE` | `DOS` / `DOM` / `COL` | label rejected for unknown product |
| `COLISSIMO_SENDER_*` | Sender address fields | label rejected for invalid sender |
| `COLISSIMO_SUIVI_KEY` | X-Okapi-Key from developer.laposte.fr | tracking-worker 500 |
| `SITE_URL` | base for magic links | email links go to `intesport-web.netlify.app` (fallback) |

Plus Vault (for the trigger):

| Vault secret | Purpose |
|---|---|
| `supabase_url` | base for pg_net → edge functions |
| `service_role_key` | matched against `X-Internal-Call` header by called functions |

---

## File index (changes this session)

```
nuxt.config.ts
supabase/config.toml
supabase/migrations/20260519080000_drop_bank_transfer.sql           (new)
supabase/functions/systempay-ipn/index.ts
supabase/functions/generate-colissimo-label/index.ts
supabase/functions/backoffice-orders/index.ts
supabase/functions/create-order/index.ts
supabase/functions/_shared/emails/templates.ts
supabase/functions/_shared/emails/templates/bank-transfer-confirmed.html   (deleted)
supabase/functions/_shared/emails/templates/bank-transfer-pending.html     (deleted)
supabase/functions/webhook-stripe/                                          (deleted)
app/components/layout/AppHeader.vue
app/components/admin/orders/Table.vue
app/components/admin/orders/OrderDetailDrawer.vue
app/pages/checkout.vue
app/pages/admin/labels.vue
app/pages/order/[access_token].vue
app/stores/orders.ts
app/components/checkout/PaymentSelector.vue                                 (deleted)
server/payments/                                                            (deleted)
i18n/locales/fr.json
i18n/locales/en.json
```
