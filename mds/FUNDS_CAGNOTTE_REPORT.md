# Club Funds (Cagnotte) — Full Behaviour Report

> Verified on 2026-06-24 against both the codebase and the **live** Supabase DB
> (project `hznvltijxkeadqpwctop`). Where local migration files and the live DB
> diverge, the **live function bodies are authoritative** (this project's
> migration history is divergent — see CLAUDE.md / memory).

---

## 1. The model in one paragraph

Each club has a single running balance, `clubs.fund_balance NUMERIC(12,2)`. Every
movement is an **append-only row** in `fund_transactions` (signed `amount`). An
`AFTER INSERT` trigger (`sync_fund_balance`) adds `NEW.amount` to
`clubs.fund_balance`. So the balance is a *cache* of `SUM(fund_transactions.amount)`
per club — **the ledger is the source of truth, the column is derived**. Nothing
writes `fund_balance` directly except the trigger and (in principle) hand-run SQL.

The amount credited per sold unit is **`club_fund_per_unit = unit_price_paid −
buying_price_effective`**, computed once in `_shared/pricing.ts` and frozen onto
the order line as `order_items.fund_credit_snapshot` at order creation. The fund
is only actually moved at **payment capture**, never at cart/order creation.

---

## 2. Data model

| Object | Where | Notes |
|---|---|---|
| `clubs.fund_balance` | `20260419000002_tables.sql:30` | `NUMERIC(12,2)`, default 0. The displayed balance. |
| `fund_transactions` | `20260419000002_tables.sql:130-140` | Append-only ledger. Columns: `club_id, type, amount, reason, reference, order_item_id, created_by, created_at`. |
| `fund_transactions.idempotency_key`, `.source` | `20260530000001_cagnotte_adjust.sql:13-15` | Added for Footspot director self-service. Partial unique index on `idempotency_key`. |
| `order_items.fund_credit_snapshot` | `20260419000002_tables.sql:122` | Per-unit fund frozen at order creation. |
| `fund_tx_type` enum | `20260419000001_enums.sql` + later | `auto_sale`, `manual_credit`, `manual_debit`, `refund_reversal`, `promo_absorbed`. |

**Sync trigger** (`20260419000003_functions_triggers.sql:38-54`):

```sql
CREATE FUNCTION sync_fund_balance() ... AS $$
BEGIN
  UPDATE clubs SET fund_balance = fund_balance + NEW.amount WHERE id = NEW.club_id;
  RETURN NEW;
END $$;
CREATE TRIGGER fund_tx_after_insert AFTER INSERT ON fund_transactions
  FOR EACH ROW EXECUTE FUNCTION sync_fund_balance();
```

There is no trigger for UPDATE/DELETE on `fund_transactions` — corrections must be
done by inserting a *compensating* row, never by editing/deleting a row (an edit
would silently desync the balance).

---

## 3. The pricing / fund formula (`_shared/pricing.ts`)

```
memberDiscount  = selling * pct/100
unitPaid        = selling - memberDiscount
buyingEffective = (source === 'intersport') ? buying - memberDiscount : buying
fund            = unitPaid - buyingEffective      // club_fund_per_unit
```

Consequence of `source`:

- **`source = 'club'`** → `buyingEffective = buying` → the discount comes straight
  out of the **club's margin**. Fund shrinks by the discount.
- **`source = 'intersport'`** → `buyingEffective = buying − discount` → Intersport
  eats the discount, **fund is unchanged** (same as no discount).
- **no discount** → `fund = selling − buying`.

`validatePricing()` rejects `selling < buying` and requires a `discount_source`
whenever `discount_percent > 0`. Add-ons (flocking, paid options) are charged on
top and **never affect the fund** — the fund stays on catalogue margin.

---

## 4. When/how the fund is CREDITED

### Trigger point
The fund is touched **only** by `process_paid_order(order_id)`, called:

1. **Card / PayPal / wallet:** from `systempay-ipn/index.ts:277` after the IPN
   reports `PAID` (and after the promo is atomically claimed).
2. **Fully-prepaid €0 order:** from `create-order/index.ts:721` synchronously, when
   prepaid credit covers the whole total.

### `process_paid_order` (live body, verified)
Iterates every order line. Three branches:

- **Bundle/pack** (`is_pack`): decrements each component variant *with* a
  `stock >= qty` guard. If any component is OOS it rolls back the others, marks the
  line `refunded_oos`, credits **0** fund, and notifies backoffice. Else credits
  `fund_credit_snapshot * quantity`.
- **Backorder** (`available_from IS NOT NULL`): decrements stock **with NO stock
  guard** (stock may go negative — intentional, it's a pre-order) and **always
  credits** the fund.
- **Normal:** decrements with `stock >= qty` guard. If short → `refunded_oos`,
  0 fund. Else credits `fund_credit_snapshot * quantity`.

Credit row:
```sql
INSERT INTO fund_transactions(club_id, type, amount, reason, reference, order_item_id)
VALUES (v_item.item_club_id, 'auto_sale', fund_credit_snapshot * quantity, 'sale', order_number, item_id);
```

**Multi-club:** each line credits its **own product's** `products.club_id`
(`item_club_id`), not the order-level `orders.club_id`. A cart spanning clubs
splits the fund correctly per club.

Finally the order status is set: `cancelled` (all lines OOS), `partially_refunded`
(some OOS), or `paid`.

### Promo absorption (inside the same RPC)
After the line loop:
```sql
IF promo.absorbs_by = 'club' AND v_any_ok THEN
  v_promo_club := CASE WHEN promo.scope='global' THEN orders.club_id ELSE promo.club_id END;
  IF v_promo_club IS NOT NULL AND promo_discount > 0 THEN
    INSERT INTO fund_transactions(club_id,'promo_absorbed', -promo_discount, 'promo: '||code, order_number);
  END IF;
END IF;
```
So a **club-absorbed promo** posts a *negative* `promo_absorbed` row → the club
pays for the discount. An **intersport-absorbed promo** posts nothing → fund
intact.

---

## 5. Discounts — full matrix of fund impact

| Discount | Set where | Fund effect |
|---|---|---|
| Per-product, `discount_source='club'` | product row | Baked into `fund_credit_snapshot` (smaller). Club pays. |
| Per-product, `discount_source='intersport'` | product row | No fund effect (buying reduced too). |
| Footspot per-product club discount | `product_discounts` table; `applyClubDiscount()` in create-order:322-326 | **Always** reduces `fund_credit_snapshot`. Club pays. Capped 0–80%. |
| Promo code `absorbs_by='intersport'` (default) | `promo_codes` | No fund row. Just reduces order total. |
| Promo code `absorbs_by='club'` | `promo_codes` | Negative `promo_absorbed` row at capture. Club pays. |
| Cart add-ons (flocking / options) | product config | Never affect fund. |

Promo **scope** (`global` / `club` / `products`) is re-validated server-side at
checkout (`create-order` recomputes the eligible subtotal from trusted line data,
caps the discount, enforces `min_subtotal`). Client previews are informational only.

---

## 6. Prepaid (Footspot) codes — €0 fast-path

A member-redeemed Footspot prepaid code is validated live against Footspot
(`create-order` ~535-570), capped at `cap_amount_cents`, and applied **after**
promo: `total = subtotal + shipping − promoDiscount − prepaidCredit`.

**Prepaid does NOT change the fund directly.** The fund credit still comes from
each line's `fund_credit_snapshot`. Prepaid only changes *who/what pays the
member's bill* (Footspot wallet vs card). If `total <= 0` the order is marked
`paid`/`payment_method='prepaid'` immediately and `process_paid_order` runs
synchronously — so the club is credited its normal margin even on a €0 checkout.

---

## 7. When/how the fund is REVERSED (or not)

| Path | Fund reversed? | Mechanism |
|---|---|---|
| **OOS at capture** (`refunded_oos`) | N/A — never credited | Line skipped in `process_paid_order`; customer refunded via `orders.refund_total`. |
| **Payment declined / abandoned** | N/A — never credited | `systempay-ipn` just flips order to `cancelled`. |
| **Promo race-loss** (code claimed by another order first) | N/A — never credited | Order cancelled *before* `process_paid_order` runs (IPN: `claim_promo_for_order` is checked first; prepaid: same in create-order). |
| **Admin manual refund** | ✅ Yes | `refund-order` edge fn → `refund_order_lines` RPC inserts negative `refund_reversal` rows (`-fund_credit_snapshot*qty`) per refunded line. Also writes a `refunds` audit row. |
| **Colissimo return-to-sender (RE1)** | ❌ **NO** — see Risk R1 | `colissimo-tracking-worker` only flips status to `cancelled`. |
| **Club-absorbed promo, later refunded** | ❌ **NO** — see Risk R2 | `refund_order_lines` reverses `auto_sale` only, not `promo_absorbed`. |

---

## 8. Admin & director-facing fund movement

- **Admin manual credit/debit:** `admin-fund` edge fn (admin-only). UI:
  `app/pages/admin/fund.vue` + `components/admin/fund/*` + `stores/fund.ts`.
  Stores a signed `manual_credit`/`manual_debit` row. **No overdraft guard** — an
  admin debit *can* push a club negative (UI warns but does not block).
- **Footspot director self-service:** `adjust-cagnotte` edge fn (HMAC + per-club
  Bearer). Stricter: **idempotency-key dedupe**, **overdraft blocked** (cannot go
  below 0), `source='footspot'`, and notifies backoffice. Works in cents.
- **Reporting:** `club-stats` returns `cagnotte_balance_cents` straight from
  `clubs.fund_balance`, plus a period delta = `SUM(fund_transactions.amount)`.

---

## 9. Idempotency / double-spend guards

- **IPN replay:** `payment_events (provider, event_id)` UNIQUE; duplicate IPN
  returns 200 early → `process_paid_order` not re-run → no double-credit.
- **Order creation replay:** `orders.idempotency_key` short-circuits create-order.
- **Promo single-use:** `claim_promo_for_order` does a conditional
  `UPDATE ... WHERE used_at IS NULL` and returns whether exactly 1 row changed —
  atomic, race-safe.
- **Director adjustments:** `fund_transactions.idempotency_key` unique index.
- **Manual admin refund:** ⚠️ **no idempotency** — calling `refund-order` twice on
  the same lines would double-reverse (see Risk R3).

---

## 10. Risks / things that can cost money

**R1 — Return-to-sender does not reverse the fund (and leaves no refund trail).**
`colissimo-tracking-worker` sets RE1 orders to `cancelled` but never calls
`refund_order_lines`, never writes a `refunds` row, never sets `refund_total`. A
paid+shipped order that bounces back leaves the club credited margin on goods that
came back. Decide policy: either reverse the fund + refund the customer, or at
minimum write an audit row. *(Confirmed by reading the worker; the credit
definitely happened at capture.)*

**R2 — Club-absorbed promo discount is never returned on refund.** When a
club-absorbed promo order is refunded, `refund_order_lines` reverses only the
`auto_sale` credits. The negative `promo_absorbed` row stays. Net effect: the club
stays *down* by the promo discount even though the sale was undone. If a club
absorbs promos, refunds leave their cagnotte slightly too low.

**R3 — Manual refund concurrency (FIXED 2026-06-24).** *Corrected analysis:* the
fund reversal was already idempotent (`refund_order_lines` locks the order
`FOR UPDATE` and skips `refunded_oos` lines), and `refund-order` returns early on
a sequential retry — so double **fund** reversal was already prevented. The real
residual gap was two *simultaneous* in-flight requests both reaching the Lyra
`CancelOrRefund` call before either committed, double-refunding the **customer**.
Fixed by an atomic per-line claim taken before the processor call:
`begin_refund_lines` (flips `order_items.refund_started_at` under the order lock,
returns only newly-claimed rows) gates the Lyra call; `cancel_refund_lines`
releases the claim if Lyra fails. See `20260624000001_refund_idempotency.sql` and
`refund-order/index.ts`. Verified live: first claim → 1 line, repeat claim → 0.

**R4 — Multi-club + global promo silently skips the club debit.** For a
`scope='global'` club-absorbed promo on a multi-club cart, `orders.club_id` is
NULL, so the `promo_absorbed` debit is skipped — the member gets the discount but
no club pays for it (Intersport effectively eats it). The SQL comments call this
"legacy". Best fix: forbid global club-absorbed promos on multi-club carts at
validation time.

**R5 — Backorder lines credit the fund with no stock guard.** Intentional for
pre-orders, but means stock can go negative and the fund is credited before goods
exist. Fine if that's the business intent; worth knowing.

**R6 — Stored balance vs ledger can drift, and currently does (seed data).** The
balance is only kept correct *through the trigger*. Any direct write to
`clubs.fund_balance`, or any edit/delete of a `fund_transactions` row, desyncs it
permanently with no self-healing. **As of this report the live DB already shows
drift** — see §11. Recommend a scheduled reconciliation check.

---

## 11. Live reconciliation snapshot (2026-06-24)

```
clubs total: 7 | positive: 2 | negative: 0 | total fund: €3834.86
fund_transactions rows: 2 (both auto_sale) | orders: 4 (1 paid-ish)

Drift (fund_balance − SUM(ledger)):
  FC FOOTSPOT  balance 2206.86  ledger 1.00  drift +2205.86
  FC93         balance 1628.00  ledger 0.00  drift +1628.00
```

Interpretation: the system has barely been used (4 orders, 2 real credits). 6 of 7
clubs predate the first ledger row, so these balances were **seeded directly onto
`clubs.fund_balance`** (test/seed data) and are not backed by the ledger. This is
**not** evidence of a credit-path bug — but it's a live demonstration of R6: if
Intersport ever audits "where did this club's cagnotte come from", the ledger only
explains €1 of €3834. Before go-live, either zero the seeded balances or back-fill
matching ledger rows, and add a periodic reconciliation query:

```sql
SELECT c.id, c.name, c.fund_balance, COALESCE(SUM(ft.amount),0) AS ledger,
       c.fund_balance - COALESCE(SUM(ft.amount),0) AS drift
FROM clubs c LEFT JOIN fund_transactions ft ON ft.club_id = c.id
GROUP BY c.id HAVING c.fund_balance <> COALESCE(SUM(ft.amount),0);
```

---

## 12. Key file references

- Formula: `supabase/functions/_shared/pricing.ts:27-59`
- Snapshot frozen: `supabase/functions/create-order/index.ts:308-326, 657-681`
- Credit trigger point (card): `supabase/functions/systempay-ipn/index.ts:259-281`
- Credit trigger point (prepaid): `supabase/functions/create-order/index.ts:707-733`
- Credit/promo-debit RPC: `process_paid_order` (live DB; mirrors `20260615120500_promo_scope_fund_debit.sql`)
- Promo claim RPC: `claim_promo_for_order` (live DB)
- Refund RPC: `refund_order_lines` (`20260608000001_multi_club_fund_split.sql:257-340`)
- Balance sync trigger: `20260419000003_functions_triggers.sql:38-54`
- Admin fund: `supabase/functions/admin-fund/index.ts`, `app/pages/admin/fund.vue`, `app/stores/fund.ts`
- Director fund: `supabase/functions/adjust-cagnotte/index.ts`
- Return-to-sender (R1): `supabase/functions/colissimo-tracking-worker/index.ts:127-153`
</content>
</invoke>
