// * Computes availability of a bundle's size selections from the component
// * products' variants currently loaded in the products store. Shared between
// * the admin preview and the storefront product page.
// *
// * Four axis kinds drive the size UX:
// *   - primary / secondary : shared sizing groups. Every component on the axis
// *     shares ONE size pick; selectable sizes = intersection of their sizes.
// *   - product             : each component is sized independently — its own
// *     size selector on the page.
// *   - unique              : no size pick; the component always ships its single
// *     variant ("Taille unique" badge).
// *
// * Effective-unique rule: a component is treated as unique when its axis is
// * 'unique' OR it has a single variant (a one-size add-on declared on any axis
// * rides along without constraining that axis — keeps older packs working).
import type { Product } from '~/stores/products'
import { useProductsStore } from '~/stores/products'

export interface ProductAxis {
  componentId: string
  name: string
  quantity: number
  sizes: string[]
  // * units sellable per size = floor(stock / quantity)
  stockBySize: Record<string, number>
}

export interface UniqueComponent {
  componentId: string
  name: string
  size: string
  stock: number
  quantity: number
}

export interface BundleSelection {
  primary: string | null
  secondary: string | null
  // * componentId → picked size, for product-axis components.
  productSizes: Record<string, string>
}

export interface BundleAvailability {
  hasSecondary: boolean
  primarySizes: string[]
  secondarySizes: string[]
  productAxes: ProductAxis[]
  uniqueComponents: UniqueComponent[]
  // * Shared-axis stock keyed `${primary}::${secondary}` (product axes excluded,
  // * unique components folded into the min). Empty primary/secondary use ''.
  stockMatrix: Record<string, number>
  // * Max units sellable for a complete selection (Infinity-safe internally,
  // * always returns a finite number; 0 when any required pick is missing/OOS).
  maxUnits(sel: BundleSelection): number
}

const EMPTY: BundleAvailability = {
  hasSecondary: false,
  primarySizes: [],
  secondarySizes: [],
  productAxes: [],
  uniqueComponents: [],
  stockMatrix: {},
  maxUnits: () => 0,
}

export function useBundleAvailability(
  bundle: Product | null,
  locale: 'fr' | 'en' = 'fr',
): BundleAvailability {
  if (!bundle || !bundle.is_pack || bundle.bundle_components.length === 0) return EMPTY

  const store = useProductsStore()
  const componentProducts = bundle.bundle_components.map((bc) => ({
    bc,
    product: store.byId(bc.component_product_id),
  }))

  // * If any component product hasn't loaded yet, return empty.
  if (componentProducts.some((cp) => !cp.product)) return EMPTY

  type Comp = (typeof componentProducts)[number]
  const variantsOf = (cp: Comp) => cp.product!.variants ?? []
  const nameOf = (cp: Comp) =>
    cp.product!.name?.[locale] || cp.product!.name?.fr || cp.product!.reference

  // * Classify each component by its effective behaviour.
  const isUnique = (cp: Comp) => cp.bc.axis === 'unique' || variantsOf(cp).length <= 1
  const primarySized = componentProducts.filter((cp) => cp.bc.axis === 'primary' && !isUnique(cp))
  const secondarySized = componentProducts.filter((cp) => cp.bc.axis === 'secondary' && !isUnique(cp))
  const productSized = componentProducts.filter((cp) => cp.bc.axis === 'product' && !isUnique(cp))
  const uniqueComps = componentProducts.filter((cp) => isUnique(cp))

  // * Shared-axis sizes = intersection of the axis's sized components.
  const intersectSizes = (comps: Comp[]): string[] => {
    if (comps.length === 0) return []
    const sets = comps.map((cp) => new Set(variantsOf(cp).map((v) => v.size)))
    return Array.from(sets[0]!).filter((s) => sets.every((set) => set.has(s)))
  }

  const primarySizes = intersectSizes(primarySized)
  const secondarySizes = intersectSizes(secondarySized)
  const hasSecondary = secondarySizes.length > 0

  // * Independent per-product axes.
  const productAxes: ProductAxis[] = productSized.map((cp) => {
    const stockBySize: Record<string, number> = {}
    for (const v of variantsOf(cp)) {
      stockBySize[v.size] = Math.floor(v.stock / Math.max(1, cp.bc.quantity))
    }
    return {
      componentId: cp.bc.component_product_id,
      name: nameOf(cp),
      quantity: cp.bc.quantity,
      sizes: variantsOf(cp).map((v) => v.size),
      stockBySize,
    }
  })

  // * Unique components — always their single variant.
  const uniqueComponents: UniqueComponent[] = uniqueComps.map((cp) => {
    const v = variantsOf(cp)[0]
    return {
      componentId: cp.bc.component_product_id,
      name: nameOf(cp),
      size: v?.size ?? '',
      stock: v?.stock ?? 0,
      quantity: cp.bc.quantity,
    }
  })

  // * Units a single component contributes at a given (already-resolved) size.
  const unitsAt = (cp: Comp, size: string | null): number => {
    if (isUnique(cp)) {
      const v = variantsOf(cp)[0]
      return v ? Math.floor(v.stock / Math.max(1, cp.bc.quantity)) : 0
    }
    if (!size) return 0
    const v = variantsOf(cp).find((x) => x.size === size)
    return v ? Math.floor(v.stock / Math.max(1, cp.bc.quantity)) : 0
  }

  // * Shared-axis matrix (primary × secondary), unique components folded in.
  // * Product axes are NOT here — they're picked independently.
  const sharedComps = [...primarySized, ...secondarySized, ...uniqueComps]
  const stockMatrix: Record<string, number> = {}
  const pSizes = primarySizes.length ? primarySizes : [null]
  const sSizes = hasSecondary ? secondarySizes : [null]
  for (const p of pSizes) {
    for (const s of sSizes) {
      let min = Infinity
      for (const cp of sharedComps) {
        const size = cp.bc.axis === 'primary' ? p : cp.bc.axis === 'secondary' ? s : null
        const u = unitsAt(cp, size)
        if (u < min) min = u
      }
      stockMatrix[`${p ?? ''}::${s ?? ''}`] = min
    }
  }

  function maxUnits(sel: BundleSelection): number {
    let min = stockMatrix[`${sel.primary ?? ''}::${sel.secondary ?? ''}`]
    if (min === undefined) min = Infinity
    for (const ax of productAxes) {
      const picked = sel.productSizes[ax.componentId]
      min = Math.min(min, picked ? (ax.stockBySize[picked] ?? 0) : 0)
    }
    return Number.isFinite(min) ? min : 0
  }

  return {
    hasSecondary,
    primarySizes,
    secondarySizes,
    productAxes,
    uniqueComponents,
    stockMatrix,
    maxUnits,
  }
}
