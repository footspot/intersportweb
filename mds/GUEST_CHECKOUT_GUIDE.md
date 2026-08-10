# Guest Checkout — Development Guide

> **Goal:** Let visitors complete an order and pay **without creating an account**. They receive the order confirmation and invoice by email (via Brevo), and can follow their order through a signed link in that email. Existing customer accounts keep working unchanged — guest checkout is an *additional* path, not a replacement.

> **Status:** Proposal. Awaiting final client confirmation before implementation.

---

## 1. Why this change

The current flow forces every buyer to register before paying. The client wants the friction-free path used by most commerce sites:

> *"Just pay, get email with order details, and that's all."*

The existing architecture (Supabase + edge functions + Brevo) already supports most of what's needed — the `send-order-email` function reads the recipient from `shipping_address.email` first, and the email provider works without a user row. The work below is mostly about **removing the auth wall** and **letting guests retrieve their own order** safely.

---

## 2. Current blockers (what must change)

| # | Layer | File | Blocker |
|---|-------|------|---------|
| 1 | Route middleware | `app/pages/checkout.vue:8` | `middleware: ['auth', 'customer-only']` forces login |
| 2 | Route middleware | `app/pages/orders/[id].vue:6` | Same middleware — guest can't view their own order |
| 3 | Edge function | `supabase/functions/checkout-start/index.ts:141-146` | Rejects requests without `Authorization` header |
| 4 | Edge function | `supabase/functions/checkout-start/index.ts:160-166` | Requires `profiles.role = 'customer'` |
| 5 | Database | `supabase/migrations/20260419000002_tables.sql:93` | `orders.user_id UUID NOT NULL REFERENCES profiles(id)` |
| 6 | RLS policy | `supabase/migrations/20260419000004_rls_policies.sql:22` | `"own orders" USING (auth.uid() = user_id)` — guests have no `auth.uid()` |
| 7 | UI | `app/components/cart/CartDrawer.vue:17-20` | Cart button leads to `/checkout` expecting a session |

Everything else (cart validation, pricing, stock, Stripe/PayPal redirect, Brevo email, invoice generation) is already account-agnostic and needs no change.

---

## 3. Target flow

```
[Cart]
  └─ "Checkout" → /checkout (no login required)

[/checkout]
  ├─ Shipping form  (name, email*, phone, line1, postal_code, city, country)
  ├─ Payment selector  (Stripe / PayPal / bank transfer)
  └─ "Place order" → checkout-start (anon)
        ├─ cart-validate  (anon)
        ├─ create order  (user_id = NULL, guest_email = shipping.email, guest_token = random)
        └─ branch by provider:
              ├─ Stripe → redirect to Stripe Checkout
              ├─ PayPal → redirect to PayPal approval
              └─ bank_transfer → redirect to /orders/{id}?token=...

[Email from Brevo]
  "Your order CMD-2026-XXXXXX is confirmed"
  └─ link: https://<site>/orders/{id}?token=<guest_token>

[/orders/{id}?token=...]
  Guest loads order detail via anon RPC using (id, token)
```

\* Email is **mandatory for guest checkout** — it is the only identifier we have.

---

## 4. Implementation plan (ordered steps)

### Step 4.1 — Database schema

New migration file: `supabase/migrations/2026XXXXXXXXXX_guest_checkout.sql`

```sql
-- * Allow guest orders: user_id becomes optional, add guest fields.
ALTER TABLE orders
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN guest_email TEXT,
  ADD COLUMN guest_token TEXT;

-- * Exactly one of (user_id, guest_email) must be set.
ALTER TABLE orders
  ADD CONSTRAINT orders_owner_check
  CHECK (
    (user_id IS NOT NULL AND guest_email IS NULL AND guest_token IS NULL)
    OR
    (user_id IS NULL AND guest_email IS NOT NULL AND guest_token IS NOT NULL)
  );

-- * Fast lookup by token (used when the guest opens the email link).
CREATE UNIQUE INDEX orders_guest_token_idx ON orders (guest_token) WHERE guest_token IS NOT NULL;
CREATE INDEX orders_guest_email_idx ON orders (LOWER(guest_email)) WHERE guest_email IS NOT NULL;
```

**Why token-based access:** guests can't authenticate, so we mint a cryptographically random `guest_token` (at least 32 bytes, URL-safe base64) at order creation and embed it in the email link. Anyone with the link can see the order — that is acceptable for guest orders and matches the industry norm.

### Step 4.2 — RLS policies

Same migration, append:

```sql
-- * Customers still see their own orders (unchanged).
-- * Nothing changes for "own orders" / "own order items" policies — they already
-- * only match rows where user_id = auth.uid(), which skips guest orders.

-- * Guest access goes through a SECURITY DEFINER RPC (see 4.3). No additional
-- * permissive RLS policy is needed; the RPC bypasses RLS via elevated rights
-- * and enforces the token match itself. This keeps the blast radius tight.
```

### Step 4.3 — Guest order lookup RPC

Same migration:

```sql
-- * Returns an order + its items iff the token matches. Anon callable.
CREATE OR REPLACE FUNCTION public.get_guest_order(p_order_id UUID, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order JSONB;
BEGIN
  SELECT to_jsonb(o) INTO v_order
  FROM orders o
  WHERE o.id = p_order_id
    AND o.guest_token = p_token
    AND o.user_id IS NULL;

  IF v_order IS NULL THEN
    RETURN NULL;
  END IF;

  -- * Attach items, club summary, refunds (mirror existing customer view).
  v_order := v_order || jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(i) FROM order_items i WHERE i.order_id = p_order_id), '[]'::jsonb),
    'refunds', COALESCE((SELECT jsonb_agg(r) FROM order_refunds r WHERE r.order_id = p_order_id), '[]'::jsonb)
  );

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.get_guest_order(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_order(UUID, TEXT) TO anon, authenticated;
```

### Step 4.4 — `checkout-start` edge function

Edit `supabase/functions/checkout-start/index.ts`:

- Make the `Authorization` header **optional** (lines 141-146). Only validate it when present.
- When absent:
  - Skip the `profiles` lookup (lines 160-166).
  - Require `shipping_address.email` to be a valid email (add a regex check).
  - Generate `guest_token` (use `crypto.getRandomValues` → base64url, 32 bytes).
  - Insert the order with `user_id = NULL, guest_email = shipping.email, guest_token = <token>`.
  - For the Stripe session, pass `customer_email = shipping.email`.
  - In the response `order` object, include `guest_token` for the front end to build the detail URL.
- When present (logged-in customer), behavior is unchanged.

Pseudocode sketch near the top of `Deno.serve`:

```ts
const authHeader = req.headers.get('Authorization')
let userId: string | null = null
let userEmail = ''

if (authHeader) {
  const uClient = userClient(authHeader)
  const { data: userRes, error } = await uClient.auth.getUser()
  if (error || !userRes?.user) return jsonResponse({ error: 'Invalid session' }, { status: 401 })
  userId = userRes.user.id
  userEmail = userRes.user.email ?? ''
}
// * …later, before inserting the order:
const isGuest = !userId
if (isGuest && !isValidEmail(body.shipping_address.email)) {
  return jsonResponse({ error: 'guest_email_required' }, { status: 400 })
}
const guestToken = isGuest ? generateToken() : null
const guestEmail = isGuest ? body.shipping_address.email : null

// * profile + role check only runs when userId is set.
if (userId) {
  const { data: profile } = await sb.from('profiles').select('role, active').eq('id', userId).single()
  if (!profile || !profile.active) return jsonResponse({ error: 'Profile disabled' }, { status: 403 })
  if (profile.role !== 'customer') return jsonResponse({ error: 'Only customers can checkout' }, { status: 403 })
}
```

And in the `orders` insert payload:

```ts
.insert({
  order_number: number,
  user_id: userId,                  // * null for guests
  guest_email: guestEmail,
  guest_token: guestToken,
  club_id: clubId,
  status: 'pending',
  /* …rest unchanged… */
})
```

### Step 4.5 — `cart-validate` edge function

Already public logic (no user-specific data). Confirm it doesn't require auth; if it does, remove the auth check. File: `supabase/functions/cart-validate/index.ts`.

### Step 4.6 — `/checkout` page

File: `app/pages/checkout.vue`

- Remove `middleware: ['auth', 'customer-only']` from `definePageMeta` (line 8). Keep `ssr: false`.
- `useSupabaseUser()` may now return `null`. Handle both cases:
  ```ts
  const user = useSupabaseUser()
  const shipping = ref<ShippingAddress>({
    full_name: '',
    email: user.value?.email ?? '',
    /* … */
  })
  ```
- When guest (`!user.value`), the email field in the shipping form must be **required**. Update `validAddress()`:
  ```ts
  function validAddress(): boolean {
    const a = shipping.value
    const base = !!(a.full_name && a.line1 && a.postal_code && a.city && a.country)
    if (!user.value && !isValidEmail(a.email)) return false
    return base
  }
  ```
- After a successful bank-transfer response, redirect with the token:
  ```ts
  const qs = res.order.guest_token ? `?token=${encodeURIComponent(res.order.guest_token)}` : ''
  await navigateTo(`/orders/${res.order.id}${qs}`)
  ```
- For Stripe/PayPal, the provider redirects the buyer — make sure the `success_url` passed to `checkout-start` includes the guest token for guest flows:
  ```ts
  const successPath = guestToken
    ? `/orders/${/* filled by edge */ ''}?token=${guestToken}`
    : `/orders`
  ```
  Simpler: let `checkout-start` build the `success_url` itself when the caller is a guest, since it's the one generating the token.

### Step 4.7 — Shipping form

File: `app/components/checkout/ShippingForm.vue`

- Mark the `email` field as required + add inline validation when the current user is `null`.
- Add a small helper text: *"We'll send the order confirmation and invoice to this address."*
- Translations in `i18n/locales/fr/checkout.json` and `i18n/locales/en/checkout.json` (use `easy_localization` conventions — actually this is Nuxt `@nuxtjs/i18n`, use the project's existing i18n setup).

### Step 4.8 — `/orders/[id]` page

File: `app/pages/orders/[id].vue`

- Remove `middleware: ['auth', 'customer-only']` from `definePageMeta` (line 6).
- Read `token` from the query string. If present and no user is logged in, call the guest RPC:
  ```ts
  const route = useRoute()
  const user = useSupabaseUser()
  const token = computed(() => (route.query.token as string | undefined) ?? null)
  const client = useSupabaseClient()

  await useAsyncData(`order-${orderId.value}`, async () => {
    if (user.value) {
      detail.value = await orders.fetchOne(orderId.value, true)
    } else if (token.value) {
      const { data, error } = await client.rpc('get_guest_order', {
        p_order_id: orderId.value,
        p_token: token.value,
      })
      if (error) throw error
      if (!data) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
      detail.value = data
    } else {
      throw createError({ statusCode: 403, statusMessage: 'Missing access token' })
    }
    return true
  })
  ```
- The invoice download (`generate-invoice`) currently assumes an authenticated caller. Either:
  - Extend `generate-invoice` to accept an `order_id + guest_token` pair, or
  - Return a pre-signed invoice URL inside the Brevo email body (simpler — one less auth path).

  Recommendation: **include the invoice link in the email** and hide the "Download invoice" button for guests. Fewer moving parts.

### Step 4.9 — Cart drawer

File: `app/components/cart/CartDrawer.vue`

No code change required — it already navigates to `/checkout` unconditionally. Once step 4.6 lands, guests will flow through naturally. Consider adding a small info line: *"No account needed — you'll receive your order by email."* (new i18n key).

### Step 4.10 — Email template

File: `supabase/functions/send-order-email/index.ts`

- Already picks `shipping_address.email` before falling back to profile email (around the recipient-resolution block). Verify nothing short-circuits on `user_id = null`.
- Append `?token=<guest_token>` to the order link when `order.user_id` is null. The function has access to the order row and can branch on that.

### Step 4.11 — `customer-only` middleware

File: `app/middleware/customer-only.ts`

Keep as-is. It still protects the **logged-in customer areas** (`/orders` list, profile). It no longer guards `/checkout` after step 4.6. Admin/employee lockout is unchanged.

### Step 4.12 — Backoffice admin view

File: `app/pages/admin/orders/*` (back-office order list + detail)

- The list query must tolerate rows with `user_id IS NULL`. When joining `profiles`, use a LEFT JOIN (or conditional fetch).
- In the UI, show `guest_email` when present, with a "Guest" badge next to the order number.
- Search by email should match both `profiles.email` (for registered customers) and `orders.guest_email`.

### Step 4.13 — Stripe/PayPal webhooks

Files: `supabase/functions/webhook-stripe/index.ts`, `supabase/functions/webhook-paypal/index.ts`

- No auth change — these are already called with service role by the provider.
- Confirm the `process_paid_order` RPC and `send-order-email` both handle orders with `user_id IS NULL`. The RPC may assume a user row for fund credit — verify it does not blow up (guest orders still credit the club fund the same way).

---

## 5. Security considerations

- **Token strength.** `guest_token` must be ≥ 32 random bytes, URL-safe base64. Never expose the raw UUID alone — the token is the secret.
- **No enumeration.** Never leak whether an order ID exists without a valid token. The RPC returns `NULL` for both "wrong id" and "wrong token".
- **Rate limit** `cart-validate` and `checkout-start` when called anonymously — guests bypass the login choke point. Supabase has request limits per anon key, but add an IP-based rate-limit in the edge function (Deno KV or upstash) if abuse becomes visible.
- **Email verification.** The shipping email is unverified. If a typo happens, the buyer never gets the link. Mitigations:
  - Show the order summary + token link **once** on the success page (post-Stripe redirect), so the buyer can bookmark it.
  - Consider a "I didn't receive my email" recovery flow: user types email + order number → we re-send to the address stored on the order (not to the one typed). Simpler: rely on the post-pay page screenshot and customer support.
- **Don't log tokens.** Scrub `guest_token` from edge-function logs and Sentry breadcrumbs.
- **Expire tokens?** Optional. For MVP keep them permanent — the URL is already the only recovery mechanism.
- **Refund / cancel actions by guests.** Out of scope. Guests can *view* their order; any action (cancel, dispute) goes through email to support.

---

## 6. Client-side UX adjustments

- On `/cart`, replace the "Log in to continue" copy (if any) with "Checkout" unconditionally.
- On the post-pay confirmation page (`/orders/[id]?token=...`), show a "**Save this page** — we also emailed it to you" banner.
- **No "Create an account" CTA anywhere.** Client decision 2026-05-19: customer accounts are not offered. The magic link is the only retrieval mechanism. Do not add a `/register` route or login link for customers.

---

## 7. Migration of existing data

Nothing to backfill. `orders.user_id` is currently NOT NULL, so every existing row is a customer order and the new CHECK constraint is satisfied by all of them (`user_id NOT NULL` branch).

Run the migration on staging first; verify:

```sql
SELECT COUNT(*) FROM orders WHERE user_id IS NULL;      -- * expect 0 before any guest order
SELECT COUNT(*) FROM orders WHERE guest_token IS NOT NULL; -- * expect 0 before first guest order
```

---

## 8. Testing checklist

### Guest happy path
- [ ] Anon visitor adds product → cart → `/checkout` (no redirect to `/login`).
- [ ] Submits shipping form with a valid email → receives confirmation email with working link.
- [ ] Opens `/orders/{id}?token=...` and sees the full order.
- [ ] Opens `/orders/{id}` (no token) → 403.
- [ ] Opens `/orders/{id}?token=wrong` → 404.

### Guest payment paths
- [ ] Stripe: redirect + return + webhook marks order paid + email sent.
- [ ] PayPal: same.
- [ ] Bank transfer: order stays pending + email sent + admin flip to paid re-sends.

### Logged-in customer (regression)
- [ ] Existing customer flow still works end-to-end.
- [ ] `/checkout` uses profile email pre-filled.
- [ ] `/orders` list and `/orders/[id]` (no token) still work for logged-in customers.
- [ ] Admin/employee still can't reach `/checkout` (no regression on `customer-only`? — actually this middleware is removed from `/checkout`; confirm admins don't accidentally land there. If they do, it's cosmetic only since they have no cart.)

### Admin view
- [ ] Guest orders appear in `/admin/orders` with a "Guest" badge.
- [ ] Admin can search by `guest_email`.
- [ ] Admin can mark guest bank-transfer orders as paid → email fires to `guest_email`.

### Security
- [ ] Guest token is ≥ 32 bytes random, base64url, not a UUID.
- [ ] Token does not appear in logs.
- [ ] Rate limits survive a burst of 100 anon checkout-start calls from one IP.
- [ ] RLS blocks direct `SELECT * FROM orders WHERE id = X` from `anon` even when token is in hand (force use of the RPC).

---

## 9. Rollout

1. Land the migration on **staging**. Smoke-test the four paths above.
2. Ship a feature-flagged version (`NUXT_PUBLIC_ENABLE_GUEST_CHECKOUT`) so the client can A/B it.
3. Once the client signs off, drop the flag and make guest the default.

---

## 10. Open questions for the client

1. **Required or optional?** Should the site *offer* guest checkout but keep the account path equally visible, or **default to guest** and demote the login link?
2. **Order history for guests.** If a guest places three orders with the same email, should they see all three via a single "resend my orders" email-lookup page?
3. **Invoicing.** Guests are the end customer — do invoices still need to show a club affiliation, or is the shipping address enough?
4. **Marketing consent.** Should the checkout form include a "send me offers" opt-in for Brevo list subscription? Legally safer to add with a default-off checkbox.
5. **Scope.** Should existing customer accounts still be offered (e.g. the fund/cagnotte mechanism requires identified buyers), or are we phasing accounts out entirely on the storefront side?

---

*Last updated: 2026-04-23. Maintainer: see project README.*
