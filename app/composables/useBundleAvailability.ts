// * Computes availability of a bundle's (primary_size, secondary_size) combos
// * from the component products' variants currently loaded in the products store.
// * Shared between the admin preview and the storefront product page.
import type { BundleComponent, Product } from '~/stores/products'
import { useProductsStore } from '~/stores/products'

export interface BundleAvailability {
  hasSecondary: boolean
  primarySizes: string[]
  secondarySizes: string[]
  // * key = `${primary}::${secondary ?? ''}`, value = max units of the bundle sellable.
  stockMatrix: Record<string, number>
  // * Lookup: for a picked (primary, secondary), which specific variant of each
  // * component would be consumed. Empty array if any component has no matching
  // * variant for this combo.
  resolve(primary: string, secondary: string | null): Array<{
    component: BundleComponent
    variant: { id: string; size: string; stock: number }
  }>
}

const EMPTY: BundleAvailability = {
  hasSecondary: false,
  primarySizes: [],
  secondarySizes: [],
  stockMatrix: {},
  resolve: () => [],
}

export function useBundleAvailability(bundle: Product | null): BundleAvailability {
  if (!bundle || !bundle.is_pack || bundle.bundle_components.length === 0) return EMPTY

  const store = useProductsStore()
  const componentProducts = bundle.bundle_components.map((bc) => ({
    bc,
    product: store.byId(bc.component_product_id),
  }))

  // * If any component product hasn't loaded yet, return empty.
  if (componentProducts.some((cp) => !cp.product)) return EMPTY

  const primaryComponents = componentProducts.filter((cp) => cp.bc.axis === 'primary')
  const secondaryComponents = componentProducts.filter((cp) => cp.bc.axis === 'secondary')

  if (primaryComponents.length === 0) return EMPTY

  // * Intersection of sizes available across all primary-axis components.
  const primarySets = primaryComponents.map(
    (cp) => new Set((cp.product!.variants ?? []).map((v) => v.size)),
  )
  const primarySizes = primarySets.length
    ? Array.from(primarySets[0]!).filter((s) => primarySets.every((set) => set.has(s)))
    : []

  const hasSecondary = secondaryComponents.length > 0
  let secondarySizes: string[] = []
  if (hasSecondary) {
    const secondarySets = secondaryComponents.map(
      (cp) => new Set((cp.product!.variants ?? []).map((v) => v.size)),
    )
    secondarySizes = secondarySets.length
      ? Array.from(secondarySets[0]!).filter((s) => secondarySets.every((set) => set.has(s)))
      : []
  }

  const stockMatrix: Record<string, number> = {}
  const pairs: Array<[string, string | null]> = hasSecondary
    ? primarySizes.flatMap((p) => secondarySizes.map((s) => [p, s] as [string, string | null]))
    : primarySizes.map((p) => [p, null] as [string, string | null])

  for (const [primary, secondary] of pairs) {
    let minUnits = Infinity
    let feasible = true
    for (const { bc, product } of componentProducts) {
      const desired = bc.axis === 'primary' ? primary : secondary
      if (!desired) {
        feasible = false
        break
      }
      const v = (product!.variants ?? []).find((x) => x.size === desired)
      if (!v) {
        feasible = false
        break
      }
      const units = Math.floor(v.stock / Math.max(1, bc.quantity))
      if (units < minUnits) minUnits = units
    }
    const key = `${primary}::${secondary ?? ''}`
    stockMatrix[key] = feasible && minUnits !== Infinity ? minUnits : 0
  }

  function resolve(primary: string, secondary: string | null) {
    const out: Array<{
      component: BundleComponent
      variant: { id: string; size: string; stock: number }
    }> = []
    for (const { bc, product } of componentProducts) {
      const desired = bc.axis === 'primary' ? primary : secondary
      if (!desired) return []
      const v = (product!.variants ?? []).find((x) => x.size === desired)
      if (!v) return []
      out.push({ component: bc, variant: { id: v.id, size: v.size, stock: v.stock } })
    }
    return out
  }

  return { hasSecondary, primarySizes, secondarySizes, stockMatrix, resolve }
}
