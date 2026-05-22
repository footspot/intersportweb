# Production Environment Migration

> **Created:** 2026-05-22
> **Purpose:** checklist of every env var / key / external setting that must change before the
> production launch. Most secrets are currently set to **test / sandbox** values.
>
> **Scope:** SystemPay (Lyra), Colissimo (La Poste), and the front-end URL vars.
> Verified against the actual edge function code — not the guide, whose var names are stale.

---

## TL;DR — 5 things to change

| # | Var | Lives in | Change |
|---|---|---|---|
| 1 | `SYSTEMPAY_PASSWORD`        | Supabase secret        | `testprivatekey_…` → `prodpassword_…` |
| 2 | `SYSTEMPAY_HMAC_KEY`        | Supabase secret        | test HMAC flag → prod HMAC flag |
| 3 | `SYSTEMPAY_PUBLIC_KEY`      | Netlify front-end env  | `…:testpublickey_…` → `…:publickey_…` |
| 4 | `COLISSIMO_ENDPOINT`        | Supabase secret        | sandbox URL → production URL |
| 5 | `SITE_URL` + `INTERSPORT_SHOP_URL_PREFIX` | Supabase secrets | Netlify URL → production domain |

Everything else listed below is **identical** between test and prod — leave it untouched.

---

## 1. SystemPay (Lyra)

SystemPay's mode is decided by the **keys**, not the host. The shop id and the API host are
the same string in test and production.

| Supabase secret | Test ≠ Prod? | Used by | Action |
|---|---|---|---|
| `SYSTEMPAY_USERNAME` | ❌ same | `create-form-token`, `systempay-ipn` | leave as-is — numeric shop id, identical in both modes |
| `SYSTEMPAY_ENDPOINT` | ❌ same | `create-form-token`, `systempay-ipn` | leave as-is (e.g. `api.systempay.fr`, no scheme) — verify on the Back Office |
| `SYSTEMPAY_PASSWORD` | ✅ **CHANGE** | `create-form-token`, `systempay-ipn` (HMAC fallback) | replace `testprivatekey_…` with the prod REST private key `prodpassword_…` |
| `SYSTEMPAY_HMAC_KEY` | ✅ **CHANGE** | `systempay-ipn` hash verification | replace with the **production** HMAC-SHA256 flag (separate from the test flag in the Back Office) |

### Front-end (Netlify env — NOT a Supabase secret)

| Var | Test ≠ Prod? | Action |
|---|---|---|
| `SYSTEMPAY_PUBLIC_KEY` | ✅ **CHANGE** | replace `<shopId>:testpublickey_…` with `<shopId>:publickey_…`. Used by the Nuxt Smartform client only — no edge function reads it. |

### Where to get the prod values

Back Office Marchand → toggle to **Production** mode → *Settings → Shop → REST API keys*.

### Non-code step — IPN notification rule ⚠️

In the Back Office, *Settings → Notification rules → Instant Payment Notification*:
- Enable the **End-of-payment IPN** for **production** mode.
- Point it at `https://<project-ref>.supabase.co/functions/v1/systempay-ipn`.
- Keep "retry on failure" enabled.

`systempay-ipn` reads `kr-hash-key` from each payload (`test` / `production`) and verifies the
signature against `SYSTEMPAY_HMAC_KEY` (for `sha256_hmac` mode) or `SYSTEMPAY_PASSWORD`
(for `password` mode). Both keys must match the live mode or every IPN returns 401.

---

## 2. Colissimo (La Poste)

**Colissimo has no separate test/prod keys.** The Cbox API key and the Suivi (Okapi) key are
identical for sandbox and production — confirmed by the code comment in
`generate-colissimo-label/index.ts`. **Only the endpoint URL changes.**

| Supabase secret | Test ≠ Prod? | Used by | Action |
|---|---|---|---|
| `COLISSIMO_API_KEY` | ❌ same | `generate-colissimo-label` | leave as-is — sandbox + prod use the same Cbox key |
| `COLISSIMO_SUIVI_KEY` | ❌ same | `colissimo-tracking-worker` | leave as-is — one Okapi key works for real + test parcels |
| `COLISSIMO_CONTRACT` | ❌ same | `generate-colissimo-label` | leave as-is — the contract number |
| `COLISSIMO_ENDPOINT` | ✅ **CHANGE** | `generate-colissimo-label` | sandbox default is `https://ws.colissimo.fr/sandbox/sls-ws/SlsServiceWSRest/2.0` — for prod drop `/sandbox`: `https://ws.colissimo.fr/sls-ws/SlsServiceWSRest/3.1` (confirm the exact prod path/version with Cbox) |
| `COLISSIMO_PRODUCT_CODE` | ❌ same | `generate-colissimo-label` | leave as-is (defaults to `DOS` — signature delivery) |
| `COLISSIMO_SENDER_COMPANY` | n/a | `generate-colissimo-label` | not a credential — must be the real warehouse identity |
| `COLISSIMO_SENDER_LINE2` | n/a | `generate-colissimo-label` | real warehouse street address |
| `COLISSIMO_SENDER_CITY` | n/a | `generate-colissimo-label` | real warehouse city |
| `COLISSIMO_SENDER_ZIP` | n/a | `generate-colissimo-label` | real warehouse zip |
| `COLISSIMO_SENDER_COUNTRY` | n/a | `generate-colissimo-label` | defaults to `FR` |

> Suivi v2 has no sandbox environment at all — `colissimo-tracking-worker` needs no change.

---

## 3. Front-end URL vars

Not credentials — plain URLs — but if left at the test/Netlify value, every customer email
links to the wrong site.

### `SITE_URL`

- **What it is:** the public base URL of the Nuxt front-end. Hardcoded fallback in all
  6 functions is `https://intesport-web.netlify.app` (the current Netlify subdomain).
- **The guide calls this `APP_URL` — the code uses `SITE_URL`. Go by the code.**
- **Used by 6 edge functions**, all to build customer-facing links in transactional emails:

  | Function | Builds |
  |---|---|
  | `systempay-ipn` | `{SITE_URL}/order/{token}` (magic link) + `{SITE_URL}/` (shop home) |
  | `confirm-shipped` | `{SITE_URL}/order/{token}` — shipped email |
  | `mark-ready-for-pickup` | `{SITE_URL}/order/{token}` — ready-for-pickup email |
  | `confirm-picked-up` | `{SITE_URL}/order/{token}` — picked-up email |
  | `colissimo-tracking-worker` | `{SITE_URL}/order/{token}` — delivered email |
  | `send-order-email` | `{SITE_URL}/orders/{order.id}` — note plural `/orders/` + `order.id` |

- **Action:** set to the production shop domain.

> ⚠️ Inconsistency to resolve separately: `send-order-email` links to `/orders/{order.id}`
> while the 5 newer functions link to `/order/{access_token}`. Verify which route actually
> exists in the Nuxt app — one path is likely stale.

### `INTERSPORT_SHOP_URL_PREFIX`

- **What it is:** the prefix used to build a club's storefront URL as
  `{INTERSPORT_SHOP_URL_PREFIX}{club_id}`.
- **Used by 1 function:** `footspot-send-new-club-request` — sent to Footspot in the
  new-club integration-request email.
- Club pages are served at `.../?club=<uuid>`, so the value **must end with `?club=`** —
  e.g. `https://<production-domain>/?club=`.
- If unset, the email prints `(INTERSPORT_SHOP_URL_PREFIX absent)`.
- **Action:** set to the production domain + `?club=`.

---

## 4. Apply the changes

Set Supabase secrets (production project ref `hznvltijxkeadqpwctop`):

```bash
supabase secrets set \
  SYSTEMPAY_PASSWORD="prodpassword_XXXXXXXX" \
  SYSTEMPAY_HMAC_KEY="<prod HMAC flag>" \
  COLISSIMO_ENDPOINT="https://ws.colissimo.fr/sls-ws/SlsServiceWSRest/3.1" \
  SITE_URL="https://<production-domain>" \
  INTERSPORT_SHOP_URL_PREFIX="https://<production-domain>/?club="
```

Set the front-end var in Netlify (Site settings → Environment variables), then redeploy:

```
SYSTEMPAY_PUBLIC_KEY = <shopId>:publickey_XXXXXXXX
```

> Edge functions pick up new secret values on their **next invocation** — no redeploy needed.
> Front-end vars require a Netlify rebuild/redeploy.

---

## 5. Post-change verification

- [ ] SystemPay Back Office: production-mode IPN rule enabled and pointing at `systempay-ipn`.
- [ ] Place one real low-value card order → confirm `systempay-ipn` returns `200 OK!`
      and the order flips to `paid`.
- [ ] Confirm the payment-confirmed email links to the **production** domain (`SITE_URL`).
- [ ] Generate one Colissimo label against the prod endpoint → confirm a real parcel number
      (`6A…`) is returned and the PDF uploads to the `labels/` bucket.
- [ ] Trigger a Footspot new-club request → confirm the email `shop_url` uses the production
      `INTERSPORT_SHOP_URL_PREFIX`.

---

## 6. Related pending items (not env vars — tracked separately)

- **Lyra Transaction Management** — refunds are blocked until BPCE activates the
  "REST API — Transaction Management" option on the shop (test **and** prod).
- **PayPal via SystemPay** — code is ready; blocked on PayPal activation on the shop contract.
- **Footspot secrets** — the Footspot integration is blocked on 6 separate Supabase secrets
  (see `FOOTSPOT_INTEGRATION.md`); independent of this payment/shipping cutover.
- **CORS allowlist** — when the production domain ships, append it to `ALLOWED_ORIGINS`
  in `supabase/functions/_shared/cors.ts`.
