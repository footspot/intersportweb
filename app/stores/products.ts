// * Products Pinia store — reads the catalog (variants + bundle components)
// * and drives admin CRUD.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'
import type { DiscountSource } from '~/composables/usePricingPreview'

export type FlockingKind = 'none' | 'members' | 'supporters'
export type BundleAxis = 'primary' | 'secondary'

export interface Variant {
  id: string
  product_id: string
  size: string
  stock: number
  sku: string | null
}

export interface BundleComponent {
  bundle_product_id: string
  component_product_id: string
  axis: BundleAxis
  quantity: number
}

export interface ProductImage {
  id: string
  image_path: string
  position: number
}

// * Multipart slot descriptor for create/update requests. Position 0 = primary.
export type ImageSlot = { existing: string } | { file_key: string }

export interface Product {
  id: string
  club_id: string
  name: { fr: string; en: string }
  reference: string
  details: { fr?: string; en?: string } | null
  category: string | null
  buying_price: number
  selling_price: number
  discount_percent: number
  discount_source: DiscountSource
  flocking_kind: FlockingKind
  flocking_members_name_price: number
  flocking_members_initials_price: number
  flocking_supporter_price: number
  is_pack: boolean
  is_visible: boolean
  is_on_clearance: boolean
  weight_grams: number
  available_from: string | null
  sort_order: number
  created_at: string
  variants: Variant[]
  // * When is_pack = true, this is the ordered list of component links. Empty otherwise.
  bundle_components: BundleComponent[]
  // * Ordered gallery (position 0 = primary). Empty when no images uploaded.
  images: ProductImage[]
}

export type ProductPayload = Omit<
  Product,
  'id' | 'created_at' | 'variants' | 'bundle_components' | 'images'
> & {
  id?: string
  variants?: Array<Pick<Variant, 'size' | 'stock' | 'sku'> & { id?: string }>
  components?: Array<{ component_product_id: string; axis: BundleAxis; quantity: number }>
  image_slots?: ImageSlot[]
}

interface ProductState {
  items: Product[]
  loading: boolean
  error: string | null
}

export function primaryImagePath(p: Product | null | undefined): string | null {
  return p?.images?.[0]?.image_path ?? null
}

function sortImages(images: ProductImage[] | null | undefined): ProductImage[] {
  return [...(images ?? [])].sort((a, b) => a.position - b.position)
}

function enrich(p: Product): Product {
  return {
    ...p,
    variants: p.variants ?? [],
    bundle_components: p.bundle_components ?? [],
    images: sortImages(p.images),
  }
}

function buildBody(payload: ProductPayload, files: Record<string, File>): FormData | ProductPayload {
  const keys = Object.keys(files)
  if (keys.length === 0) return payload
  const fd = new FormData()
  fd.append('data', JSON.stringify(payload))
  for (const k of keys) fd.append(k, files[k])
  return fd
}

export const useProductsStore = defineStore('products', {
  state: (): ProductState => ({
    items: [],
    loading: false,
    error: null,
  }),

  getters: {
    byClub: (state) => (clubId: string) => state.items.filter((p) => p.club_id === clubId),
    byId: (state) => (id: string) => state.items.find((p) => p.id === id) ?? null,
    totalStock: () => (p: Product) => p.variants.reduce((sum, v) => sum + v.stock, 0),
    // * A product is "locked" when it's a component of at least one bundle.
    isComponent: (state) => (productId: string) =>
      state.items.some((p) =>
        p.is_pack && p.bundle_components.some((bc) => bc.component_product_id === productId),
      ),
    // * All bundles that include this productId (used by the admin lock banner).
    bundlesUsing: (state) => (productId: string) =>
      state.items.filter(
        (p) =>
          p.is_pack && p.bundle_components.some((bc) => bc.component_product_id === productId),
      ),
  },

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const client = useSupabaseClient()
        const { data, error } = await client
          .from('products')
          .select(
            '*, variants:product_variants(*), bundle_components!bundle_components_bundle_product_id_fkey(*), images:product_images(id, image_path, position)',
          )
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
        if (error) throw error
        this.items = ((data ?? []) as Product[]).map(enrich)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load products'
      } finally {
        this.loading = false
      }
    },

    async create(payload: ProductPayload, files: Record<string, File> = {}) {
      const body = buildBody(payload, files)
      const { data, error } = await invokeEdge<{ product: Product }>('backoffice-products', {
        method: 'POST',
        body,
      })
      if (error) throw new Error(error.message)
      if (data?.product) {
        this.items.unshift(enrich(data.product))
      }
      return data?.product
    },

    async update(payload: ProductPayload & { id: string }, files: Record<string, File> = {}) {
      const body = buildBody(payload, files)
      const { data, error } = await invokeEdge<{ product: Product }>('backoffice-products', {
        method: 'PUT',
        body,
      })
      if (error) throw new Error(error.message)
      const updated = data?.product
      if (updated) {
        const enriched = enrich(updated)
        const idx = this.items.findIndex((p) => p.id === enriched.id)
        if (idx !== -1) this.items[idx] = enriched
      }
      return updated
    },

    async remove(id: string) {
      const { error } = await invokeEdge<{ ok: true }>('backoffice-products', {
        method: 'DELETE',
        query: { id },
      })
      if (error) throw error
      this.items = this.items.filter((p) => p.id !== id)
    },

    async toggleClearance(product: Product) {
      const next = !product.is_on_clearance
      const updated = await this.update({
        ...product,
        is_on_clearance: next,
        image_slots: product.images.map((img) => ({ existing: img.image_path })),
        variants: product.is_pack
          ? undefined
          : product.variants.map((v) => ({
              id: v.id,
              size: v.size,
              stock: v.stock,
              sku: v.sku,
            })),
        components: product.is_pack
          ? product.bundle_components.map((bc) => ({
              component_product_id: bc.component_product_id,
              axis: bc.axis,
              quantity: bc.quantity,
            }))
          : undefined,
      })
      // * Defensive: if the deployed edge function/DB doesn't surface
      // * `is_on_clearance` in its SELECT *, the local item ends up with the
      // * field stripped. Force the expected value so the UI reflects intent.
      if (updated && (updated as Product).is_on_clearance !== next) {
        const idx = this.items.findIndex((p) => p.id === product.id)
        if (idx !== -1) this.items[idx] = { ...this.items[idx]!, is_on_clearance: next }
      }
    },

    async toggleVisibility(product: Product) {
      await this.update({
        ...product,
        is_visible: !product.is_visible,
        // * Keep the current gallery untouched.
        image_slots: product.images.map((img) => ({ existing: img.image_path })),
        // * Re-serialise the shape the edge function expects depending on kind
        variants: product.is_pack
          ? undefined
          : product.variants.map((v) => ({
              id: v.id,
              size: v.size,
              stock: v.stock,
              sku: v.sku,
            })),
        components: product.is_pack
          ? product.bundle_components.map((bc) => ({
              component_product_id: bc.component_product_id,
              axis: bc.axis,
              quantity: bc.quantity,
            }))
          : undefined,
      })
    },
  },
})
