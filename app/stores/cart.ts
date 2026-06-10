// * Customer cart — persisted to localStorage via VueUse useStorage.
// * Each line carries a pricing snapshot so the UI stays stable until checkout
// * validation (cart-validate edge function).
// *
// * Bundle lines have variant_id = null; resolution to specific component
// * variants happens at checkout / validation time based on (size, secondary_size).
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { computeUnitPricing, applyClubDiscount, type DiscountSource } from '~/composables/usePricingPreview'
import { primaryImagePath, type Product } from '~/stores/products'

export interface FlockingOptions {
  name?: string | null
  initial?: string | null
  number?: string | null
}

export interface CartLine {
  line_id: string
  product_id: string
  variant_id: string | null          // * null for bundles
  is_pack: boolean
  club_id: string
  reference: string
  name: { fr: string; en: string }
  // * Snapshot of the product's primary image at add-to-cart time.
  image_path: string | null
  size: string                       // * primary size (bundle) or variant size
  secondary_size: string | null      // * secondary size for bundles
  color: string | null               // * color variant name (display only; null = no color)
  quantity: number
  max_stock: number
  unit_price_paid: number             // * post-discount price the buyer pays (incl. flocking add-on)
  selling_price: number
  buying_price: number
  discount_percent: number
  discount_source: DiscountSource
  footspot_discount_pct: number       // * Footspot club discount layered on top (0 = none)
  flocking: FlockingOptions
  flocking_addon: number
  // * Custom paid options the buyer ticked (snapshot). Price baked into unit_price_paid.
  // * `value` holds the optional free-text the buyer typed (input-enabled options).
  selected_options: { id: string; name: string; price: number; value?: string | null }[]
  options_addon: number
}

interface CartState {
  lines: CartLine[]
}

const STORAGE_KEY = 'intersport:cart'

function flockingKey(f: FlockingOptions | undefined): string {
  if (!f) return ''
  return `${f.name ?? ''}|${f.initial ?? ''}|${f.number ?? ''}`
}

export const useCartStore = defineStore('cart', () => {
  const state = useStorage<CartState>(STORAGE_KEY, { lines: [] })

  const lines = computed<CartLine[]>(() => state.value.lines ?? [])
  const count = computed(() => lines.value.reduce((n, l) => n + l.quantity, 0))
  const isEmpty = computed(() => lines.value.length === 0)
  const subtotal = computed(() =>
    lines.value.reduce((s, l) => s + l.unit_price_paid * l.quantity, 0),
  )

  const clubIds = computed(() => Array.from(new Set(lines.value.map((l) => l.club_id))))

  function add(opts: {
    product: Product
    variantId: string | null              // * null for bundles
    size: string
    secondarySize?: string | null
    color?: string | null                  // * color variant name (display only)
    colorImagePath?: string | null         // * color's image, snapshotted onto the line
    maxStock: number
    quantity: number
    flocking?: FlockingOptions
    flockingAddon?: number
    options?: Array<{ id: string; name: string; price: number; value?: string | null }>  // * selected paid options
    footspotDiscountPct?: number           // * Footspot club discount for this product
  }) {
    const {
      product,
      variantId,
      size,
      secondarySize = null,
      color = null,
      colorImagePath = null,
      maxStock,
      quantity,
      flocking,
      flockingAddon = 0,
      options = [],
      footspotDiscountPct = 0,
    } = opts
    const pricing = computeUnitPricing({
      buying_price: Number(product.buying_price),
      selling_price: Number(product.selling_price),
      discount_percent: Number(product.discount_percent ?? 0),
      discount_source: product.discount_source ?? null,
    })
    const footspotPct = Math.max(0, Math.min(80, Number(footspotDiscountPct) || 0))
    // * The Footspot club discount applies to the product price, not the
    // * flocking add-on. create-order recomputes this server-side identically.
    const discountedUnit = applyClubDiscount(pricing.unit_price_paid, footspotPct)
    const addon = Math.max(0, Number(flockingAddon) || 0)
    // * Custom paid options: snapshot + summed surcharge. Charged on top, no fund.
    const cleanOptions = (options ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      price: Math.max(0, Number(o.price) || 0),
      value: o.value?.trim() || null,
    }))
    const optionsAddon = cleanOptions.reduce((s, o) => s + o.price, 0)
    // * Distinct option selections (incl. typed value) are distinct cart lines.
    const optionsKey = cleanOptions.map((o) => `${o.id}:${o.value ?? ''}`).sort().join(',')
    // * Bundle lines don't have a single variantId, so include size axes in the key.
    const lineId = variantId
      ? `${product.id}::${variantId}::${flockingKey(flocking)}::${addon}::${optionsKey}`
      : `${product.id}::pack::${size}::${secondarySize ?? ''}::${flockingKey(flocking)}::${addon}::${optionsKey}`
    const existing = state.value.lines.find((l) => l.line_id === lineId)
    const clampedQty = (current: number) =>
      Math.max(1, Math.min(maxStock, current + quantity))

    if (existing) {
      existing.quantity = clampedQty(existing.quantity)
      existing.max_stock = maxStock
    } else {
      state.value.lines.push({
        line_id: lineId,
        product_id: product.id,
        variant_id: variantId,
        is_pack: !!product.is_pack,
        club_id: product.club_id,
        reference: product.reference,
        name: product.name,
        // * Prefer the picked color's image so the cart thumbnail matches.
        image_path: colorImagePath ?? primaryImagePath(product),
        size,
        secondary_size: secondarySize?.trim() || null,
        color: color?.trim() || null,
        quantity: Math.max(1, Math.min(maxStock, quantity)),
        max_stock: maxStock,
        unit_price_paid: discountedUnit + addon + optionsAddon,
        selling_price: Number(product.selling_price),
        buying_price: Number(product.buying_price),
        discount_percent: Number(product.discount_percent ?? 0),
        discount_source: product.discount_source ?? null,
        footspot_discount_pct: footspotPct,
        flocking: {
          name: flocking?.name?.trim() || null,
          initial: flocking?.initial?.trim() || null,
          number: flocking?.number?.trim() || null,
        },
        flocking_addon: addon,
        selected_options: cleanOptions,
        options_addon: optionsAddon,
      })
    }
  }

  function setQuantity(lineId: string, qty: number) {
    const line = state.value.lines.find((l) => l.line_id === lineId)
    if (!line) return
    line.quantity = Math.max(1, Math.min(line.max_stock, Math.floor(qty)))
  }

  function remove(lineId: string) {
    state.value.lines = state.value.lines.filter((l) => l.line_id !== lineId)
  }

  function clear() {
    state.value.lines = []
  }

  /** * True when the line's snapshot price differs from the current product. */
  function isStale(line: CartLine, current: Product | null): boolean {
    if (!current) return false
    if (Number(current.selling_price) !== line.selling_price) return true
    if (Number(current.discount_percent ?? 0) !== line.discount_percent) return true
    if ((current.discount_source ?? null) !== line.discount_source) return true
    return false
  }

  return { lines, count, isEmpty, subtotal, clubIds, add, setQuantity, remove, clear, isStale }
})
