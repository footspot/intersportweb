// * Single source of truth for pricing and club-fund math (DEVELOPMENT_GUIDE.md §6).
// * Every price preview, cart total, checkout snapshot, and fund credit must reuse
// * this module — never recompute inline.

export type DiscountSource = 'club' | 'intersport' | null

export interface PricingInput {
  buying_price: number
  selling_price: number
  discount_percent?: number              // * 0–100
  discount_source?: DiscountSource
}

export interface UnitPricing {
  unit_price_paid: number                // * what the member pays per unit
  member_discount_amount: number         // * absolute discount per unit
  buying_price_effective: number         // * effective buying price after any Intersport discount
  club_fund_per_unit: number             // * margin credited to the club fund per unit
  margin_percent: number                 // * fund / unit_price_paid × 100 (0 if unit_price_paid = 0)
  absorbing_party: 'club' | 'intersport' | 'none'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computeUnitPricing(input: PricingInput): UnitPricing {
  const buying = Number(input.buying_price)
  const selling = Number(input.selling_price)
  const pct = Math.max(0, Math.min(100, Number(input.discount_percent ?? 0)))
  const source: DiscountSource = pct > 0 ? (input.discount_source ?? null) : null

  const memberDiscount = selling * (pct / 100)
  const unitPaid = selling - memberDiscount
  const buyingEffective = source === 'intersport' ? buying - memberDiscount : buying
  const fund = unitPaid - buyingEffective
  const marginPct = unitPaid > 0 ? (fund / unitPaid) * 100 : 0

  let absorbing: UnitPricing['absorbing_party'] = 'none'
  if (pct > 0 && source) absorbing = source

  return {
    unit_price_paid: round2(unitPaid),
    member_discount_amount: round2(memberDiscount),
    buying_price_effective: round2(buyingEffective),
    club_fund_per_unit: round2(fund),
    margin_percent: round2(marginPct),
    absorbing_party: absorbing,
  }
}

// * Apply a Footspot club discount on top of an already-computed unit price.
// * The reduction is absorbed entirely by the club's margin — Intersport's
// * margin is never touched (SHOP_PERSONALIZATION_GUIDE.md §3.2). Mirror of
// * applyClubDiscount() in app/composables/usePricingPreview.ts.
export function applyClubDiscount(unitPrice: number, discountPct: number): number {
  const pct = Math.max(0, Math.min(80, Number(discountPct) || 0))
  return round2(Number(unitPrice) * (1 - pct / 100))
}

// * ---------------------------------------------------------------------------
// * Line add-ons — flocking customisation + custom paid options.
// *
// * Add-ons are charged ON TOP of the catalogue unit price and do NOT affect the
// * club fund (the fund stays based on catalogue margin). The cart and the server
// * recompute them identically from trusted product data, so the checkout price
// * can be validated instead of trusted blindly. Mirrors the client helpers in
// * app/components/home/FlockingOptions.vue and the cart store.
// * ---------------------------------------------------------------------------

export interface FlockingSelection {
  name?: string | null
  initial?: string | null
  number?: string | null
}

export interface FlockingConfig {
  flocking_kind?: 'none' | 'members' | 'supporters' | null
  flocking_members_name_price?: number | null
  flocking_members_initials_price?: number | null
  flocking_supporter_price?: number | null
}

// * Per-unit flocking surcharge for a selection, given the product's config.
export function computeFlockingAddon(
  p: FlockingConfig,
  f: FlockingSelection | null | undefined,
): number {
  const kind = p.flocking_kind ?? 'none'
  if (kind === 'members') {
    return round2(
      (f?.name ? Number(p.flocking_members_name_price || 0) : 0) +
        (f?.initial ? Number(p.flocking_members_initials_price || 0) : 0),
    )
  }
  if (kind === 'supporters') {
    return f?.name || f?.number ? round2(Number(p.flocking_supporter_price || 0)) : 0
  }
  return 0
}

export interface ProductOptionRow {
  id: string
  name: string
  price: number
  // * When true, the option carries an optional free-text value typed by the
  // * customer (e.g. a jersey number). The value never affects the price.
  allow_custom_input?: boolean
}

export interface ResolvedOption {
  name: string
  price: number
  // * Customer-entered value, only kept for options that allow custom input.
  value?: string | null
}

// * Resolve the selected option ids against the product's own options. Unknown
// * ids (e.g. an option deleted since add-to-cart) are ignored. Returns the
// * per-unit surcharge plus {name, price, value?} snapshots for the order record.
// * `optionValues` maps option id → customer-typed value; it's only honoured for
// * options flagged `allow_custom_input` and never changes the surcharge.
export function resolveOptions(
  productOptions: ProductOptionRow[],
  selectedIds: string[] | null | undefined,
  optionValues?: Record<string, string> | null,
): { addon: number; selected: ResolvedOption[] } {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return { addon: 0, selected: [] }
  const byId = new Map(productOptions.map((o) => [o.id, o]))
  const selected: ResolvedOption[] = []
  let addon = 0
  for (const id of selectedIds) {
    const o = byId.get(id)
    if (!o) continue
    const price = Number(o.price) || 0
    addon += price
    const row: ResolvedOption = { name: o.name, price }
    if (o.allow_custom_input) {
      const raw = optionValues?.[id]
      const value = typeof raw === 'string' ? raw.trim() : ''
      row.value = value || null
    }
    selected.push(row)
  }
  return { addon: round2(addon), selected }
}

// * Validate pricing inputs for server-side integrity checks.
export function validatePricing(input: PricingInput): string | null {
  if (!Number.isFinite(input.buying_price) || input.buying_price < 0) {
    return 'buying_price must be a non-negative number'
  }
  if (!Number.isFinite(input.selling_price) || input.selling_price < 0) {
    return 'selling_price must be a non-negative number'
  }
  if (input.selling_price < input.buying_price) {
    return 'selling_price must be greater than or equal to buying_price'
  }
  const pct = Number(input.discount_percent ?? 0)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return 'discount_percent must be between 0 and 100'
  }
  if (pct > 0 && !input.discount_source) {
    return 'discount_source must be set when discount_percent > 0'
  }
  return null
}
