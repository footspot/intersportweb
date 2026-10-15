// * Effective minimum order amount for the current cart.
// *
// * Two layers:
// *   site_settings.min_order_subtotal  – the shop-wide floor (0 = none)
// *   clubs.min_order_subtotal          – optional per-club exception
// *                                       (NULL = follow the shop-wide value,
// *                                        0 = no floor for that club)
// *
// * ! The exception applies ONLY when every line in the cart belongs to that one
// * ! club. A mixed-club cart falls back to the shop-wide floor, so a cheap item
// * ! from an exempted club can't lower the bar for somebody else's products
// * ! (client decision 2026-10-15).
// *
// * ! This MIRRORS the authoritative check in supabase/functions/create-order.
// * ! If the rule changes, change it in both places or the customer sees one
// * ! number and the server enforces another.
// *
// * Measured against the goods subtotal — articles only, before shipping, promo
// * code and prepaid credit — which is the same basis create-order uses.

import { useCartStore } from '~/stores/cart'
import { useSiteSettingsStore } from '~/stores/siteSettings'

export function useMinOrder() {
  const cart = useCartStore()
  const siteSettings = useSiteSettingsStore()
  const supabase = useSupabaseClient()

  // * club id → override (null = follows the shop-wide value). Only ids already
  // * looked up appear here; absence means "not fetched yet".
  const clubOverrides = ref<Record<string, number | null>>({})

  watch(
    () => cart.clubIds,
    async (ids) => {
      const missing = ids.filter((id) => !(id in clubOverrides.value))
      if (missing.length === 0) return
      const { data } = await supabase
        .from('clubs')
        .select('id, min_order_subtotal')
        .in('id', missing)
      const next = { ...clubOverrides.value }
      // * Record every id we asked for, including ones that came back empty, so
      // * a missing club isn't re-queried on every cart change.
      for (const id of missing) next[id] = null
      for (const row of (data ?? []) as Array<{ id: string; min_order_subtotal: number | null }>) {
        next[row.id] = row.min_order_subtotal === null ? null : Number(row.min_order_subtotal)
      }
      clubOverrides.value = next
    },
    { immediate: true, deep: true },
  )

  const minOrder = computed(() => {
    const ids = cart.clubIds
    if (ids.length === 1) {
      const override = clubOverrides.value[ids[0] as string]
      // * undefined = not loaded yet → fall through to the shop-wide value.
      // * null = this club follows the shop-wide value. 0 is a real override.
      if (override !== undefined && override !== null) return override
    }
    return siteSettings.minOrderSubtotal
  })

  // * True when the club's own floor is what's being applied — lets the UI say
  // * so instead of implying the shop-wide rule changed.
  const isClubSpecific = computed(() => {
    const ids = cart.clubIds
    if (ids.length !== 1) return false
    const override = clubOverrides.value[ids[0] as string]
    return override !== undefined && override !== null
  })

  const belowMinimum = computed(() => minOrder.value > 0 && cart.subtotal < minOrder.value)
  const missingForMinimum = computed(() => Math.max(0, minOrder.value - cart.subtotal))

  return { minOrder, belowMinimum, missingForMinimum, isClubSpecific }
}
