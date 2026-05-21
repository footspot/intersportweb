// * Footspot per-club product discounts ("Ma boutique" feature). Read-only on
// * the Intersport side — Footspot is the sole writer (update-product-discounts
// * edge function). See SHOP_PERSONALIZATION_GUIDE.md §3.2.
// *
// * A product belongs to exactly one club, and products.reference is unique, so
// * a discount is keyed by `${club_id}|${product_reference}`.
import { defineStore } from 'pinia'

export interface ProductDiscount {
  club_id: string
  product_reference: string
  discount_pct: number
}

function discountKey(clubId: string, reference: string): string {
  return `${clubId}|${reference}`
}

export const useProductDiscountsStore = defineStore('productDiscounts', () => {
  // * `${club_id}|${reference}` → discount_pct. Only active (>0) rows are held.
  const map = ref<Record<string, number>>({})
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      const client = useSupabaseClient()
      const { data, error } = await client
        .from('product_discounts')
        .select('club_id, product_reference, discount_pct')
        .gt('discount_pct', 0)
      if (error) throw error
      const next: Record<string, number> = {}
      for (const r of (data ?? []) as ProductDiscount[]) {
        next[discountKey(r.club_id, r.product_reference)] = r.discount_pct
      }
      map.value = next
    } catch {
      // * Discounts are a non-critical overlay — never block the storefront.
      map.value = {}
    } finally {
      loading.value = false
    }
  }

  // * Discount % for a product (0 when none). Takes the product's club + ref.
  const pctFor = computed(() => (clubId: string, reference: string): number =>
    map.value[discountKey(clubId, reference)] ?? 0,
  )

  return { map, loading, fetchAll, pctFor }
})
