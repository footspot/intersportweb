# Cagnotte Adjust — Intersport Side Guide

> **Scope**: One new inbound endpoint (`adjust-cagnotte`) so a **Footspot club
> director** can credit/debit his own club's cagnotte from inside Footspot —
> the self-service counterpart to the admin-only `admin-fund` you already have.
> **Counterpart (Footspot side)**: `intersport-adjust-cagnotte` edge function +
> the "Débit / Crédit" buttons in `IntersportStatsTab.vue` are **already built
> and deployed on the Footspot side**. They call the endpoint below; until it
> exists, the buttons return the Intersport error verbatim (a 404).
> **Sibling guides**: `SHOP_PERSONALIZATION_GUIDE.md` (auth pipeline reference),
> `FOOTSPOT_INTEGRATION.md` (order lifecycle).

---

## What this is

The "Statistiques" tab in Footspot shows the club cagnotte (balance + recent
transactions, fed by your existing `club-stats` endpoint). Today the **Débit**
and **Crédit** buttons are placeholders. This feature makes them work: the
director types an amount + a label, and Footspot pushes a signed movement to
**your** cagnotte ledger. Intersport stays the source of truth — Footspot caches
no balance and simply re-reads `club-stats` after a successful push.

This is functionally **`admin-fund`, but reached through the Footspot inbound
auth pipeline instead of the admin session**, and scoped to exactly one club.

---

## What already exists on the Intersport side (REUSE — do not rebuild)

From `supabase/functions/admin-fund/index.ts` and `club-stats/index.ts`:

- **`clubs.fund_balance`** — the live balance, **stored in euros** (numeric), not
  cents. `club-stats` already converts to cents on the way out
  (`Math.round(Number(fund_balance) * 100)`).
- **`fund_transactions`** — one signed row per movement:
  `{ club_id, type, amount (signed, euros), reason, reference, created_by, created_at }`.
  Positive `amount` = credit, negative = debit.
- **`sync_fund_balance` trigger** — keeps `clubs.fund_balance` in sync on insert.
  So the endpoint only inserts a `fund_transactions` row; the balance updates
  itself.
- **`type` values** `'manual_credit'` / `'manual_debit'` already exist (used by
  `admin-fund`). Reuse them so the admin panel's fund history renders these
  director-initiated rows with no extra work.

> The ONLY thing missing is a write path that authenticates as a **Footspot
> club** (HMAC + per-club Bearer) rather than an Intersport admin, and that
> verifies the movement targets the caller's own club.

---

## `adjust-cagnotte` — POST  *(to build)*

**Caller**: Footspot's `intersport-adjust-cagnotte` edge function.
**Auth**: **same inbound pipeline as `update-shop-config` / `update-shop-access`**
— `X-Intersport-Partner-Id` + HMAC (`verifyFootspotHmac`) + per-club Bearer
(decrypt → resolve `club_id`), `X-Timestamp` within ±300 s, `X-Idempotency-Key`,
`verify_jwt = false` in `config.toml`. `intersport_club_id` **must** match the
Bearer's resolved club (else 403 `forbidden_cross_club`).

### Input
```json
{
  "intersport_club_id": "<uuid>",
  "direction": "credit",
  "amount_cents": 5000,
  "label": "Remboursement tournoi"
}
```

- `direction` — **required**, `"credit"` (money in) or `"debit"` (money out).
- `amount_cents` — **required positive integer**, in **cents**. Convert to euros
  for `fund_transactions.amount`: `amount_eur = amount_cents / 100`.
- `label` — **required** non-empty string, ≤ 120 chars, no newlines. Stored in
  `fund_transactions.reason`.

> Footspot sends `amount_cents` (its whole UI is cents-based); your ledger is in
> euros — divide by 100 on the way in, multiply by 100 on the way out.

### Logic (mirror `admin-fund`, swap the auth + add the club guard + floor)
1. Verify HMAC + per-club Bearer; resolve `club_id` from the Bearer.
2. `intersport_club_id` must equal that `club_id` → else **403
   `forbidden_cross_club`**.
3. Validate `direction` (else **422 `bad_direction`**), `amount_cents` is a
   positive integer (else **422 `bad_amount`**), `label` non-empty ≤ 120 / no
   newlines (else **422 `bad_label`**).
4. `signed_eur = (direction === 'credit' ? +1 : -1) * amount_cents / 100`.
5. **Overdraft guard (NEW vs admin-fund)**: for a debit, read
   `clubs.fund_balance`; if `fund_balance + signed_eur < 0` → **422
   `insufficient_balance`** (include `{ balance_cents }`). Director self-service
   must not push the kitty negative. *(admin-fund intentionally allows admins to
   overdraw; this stricter rule is deliberate for the club-facing path. Footspot
   also pre-checks this client-side, but the server is authoritative.)*
6. Insert into `fund_transactions`:
   `{ club_id, type: direction === 'credit' ? 'manual_credit' : 'manual_debit',
      amount: signed_eur, reason: label, reference: null, created_by: <null or a
      footspot sentinel> }`. The `sync_fund_balance` trigger updates the balance.
7. Re-read `clubs.fund_balance` and return the envelope below.

### Output
```json
{
  "ok": true,
  "new_balance_cents": 129000,
  "transaction": {
    "date": "30 mai",
    "label": "Remboursement tournoi",
    "amount_cents": 5000
  }
}
```
- `new_balance_cents` — the post-movement balance, **in cents**
  (`Math.round(Number(fund_balance) * 100)`), to match the `club-stats` contract.
- `transaction.amount_cents` — **signed** (negative for a debit), same convention
  as `club-stats.cagnotte_transactions[].amount_cents`.
- `transaction.date` — a display string (reuse `club-stats`'s `frDate()`).

> Footspot doesn't strictly depend on the body — on success it re-fetches
> `club-stats` to refresh the displayed balance — but returning it lets the UI
> confirm without a race and is cheap to provide.

### Errors (standard envelope `{ ok:false, error, message, ... }`)
| HTTP | `error` | When |
|------|---------|------|
| 403 | `forbidden_cross_club` | `intersport_club_id` ≠ Bearer's club |
| 422 | `bad_direction` | not `credit`/`debit` |
| 422 | `bad_amount` | not a positive integer |
| 422 | `bad_label` | empty / > 120 chars / contains a newline |
| 422 | `insufficient_balance` | debit would push the cagnotte below 0 (include `balance_cents`) |
| 404 | `club_not_found` | Bearer's club row missing |

### Idempotency
Footspot sends a fresh `X-Idempotency-Key` per submit. Honour it: if the same
key is replayed, return the original `fund_transactions` row instead of inserting
a duplicate (a double-submit must not double-book the movement). Logging the key
is the minimum; de-duping on it is the goal.

---

## config.toml

```toml
[functions.adjust-cagnotte]
verify_jwt = false
```

(HMAC + per-club Bearer are verified inside the function, exactly like the other
inbound `footspot-*` / `update-*` endpoints.)

---

## Implementation order

| Step | Task |
|------|------|
| 1 | `adjust-cagnotte` endpoint: reuse `admin-fund`'s signed-insert + `manual_credit`/`manual_debit` types; swap admin auth for the Footspot inbound pipeline; add the `forbidden_cross_club` + `insufficient_balance` guards; `verify_jwt = false`. |
| 2 | Idempotency on `X-Idempotency-Key` (return the prior tx on replay). |
| 3 | E2E: Footspot director credits 50 € → `fund_transactions` gets a `+50` `manual_credit` row, `clubs.fund_balance` rises 50, Footspot's Statistiques balance refreshes; director debits more than the balance → 422 `insufficient_balance`, Footspot shows the inline error; admin panel fund history shows both director rows. |

---

## Open questions / future work

- **`created_by` for director rows**: `admin-fund` stamps the admin's id.
  Footspot calls have no Intersport user — store `null`, or seed a per-partner
  "Footspot" sentinel user if the admin panel needs a non-null author. Your call.
- **Audit attribution**: if you want to distinguish director-initiated movements
  from admin ones in the fund history UI, add a nullable
  `fund_transactions.source text` (`'admin' | 'footspot'`) — additive, optional,
  not required for v1.
- **Categories / attachments** (receipts for a debit): out of scope for v1.
