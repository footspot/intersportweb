// * Client-side pricing preview — mirrors supabase/functions/_shared/pricing.ts.
// * Keep this file logically in sync with the server module; every number the
// * customer or admin sees must match what the server computes at checkout.
import { computed, type Ref } from 'vue'

export type DiscountSource = 'club' | 'intersport' | null

export interface PricingInput {
  buying_price: number
  selling_price: number
  discount_percent?: number
  discount_source?: DiscountSource
}

export interface UnitPricing {
  unit_price_paid: number
  member_discount_amount: number
  buying_price_effective: number
  club_fund_per_unit: number
  margin_percent: number
  absorbing_party: 'club' | 'intersport' | 'none'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computeUnitPricing(input: PricingInput): UnitPricing {
  const buying = Number(input.buying_price) || 0
  const selling = Number(input.selling_price) || 0
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

export function usePricingPreview(input: Ref<PricingInput>) {
  return computed<UnitPricing>(() => computeUnitPricing(input.value))
}
