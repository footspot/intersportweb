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
