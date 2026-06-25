// * Products Pinia store — reads the catalog (variants + bundle components)
// * and drives admin CRUD.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'
import type { DiscountSource } from '~/composables/usePricingPreview'

export type FlockingKind = 'none' | 'members' | 'supporters'
// * primary/secondary = shared sizing groups · product = independent per-product
// * size selector · unique = single fixed variant ("Taille unique" badge).
export type BundleAxis = 'primary' | 'secondary' | 'product' | 'unique'

export type FootspotSize =
  | '4XS' | '3XS' | '2XS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL' | '4XL'

export type FootspotCategory =
  | 'jersey' | 'shorts' | 'socks' | 'ball' | 'cone' | 'bib'
  | 'goalkeeper_gloves' | 'training_vest' | 'other'

export interface Variant {
  id: string
  product_id: string
  size: string
  stock: number
  sku: string | null
  footspot_size: FootspotSize | null
  // * Null when the product has no colors. Otherwise points at a product_colors row.
  color_id: string | null
}

// * A color variant of a product: display name + hex (from the admin color
// * picker). Size/stock variants and gallery images reference it by id.
export interface ProductColor {
  id: string
  name: string
  hex: string
  position: number
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
  // * Null = shown for every color / no color. Otherwise tied to a product_colors row.
  color_id: string | null
}

// * A paid add-on the seller defines per product (name + price). Free-form,
// * dynamic count — distinct from the structured flocking options.
export interface ProductOption {
  id: string
  name: string
  price: number
  position: number
  // * When true the storefront shows an optional free-text input (the customer
  // * can type e.g. a jersey number). `input_label` is the prompt next to it.
  allow_custom_input: boolean
  input_label: string | null
}

// * Multipart slot descriptor for create/update requests. Position 0 = primary.
// * `color_key` ties the image to a color in the same payload (see ProductPayload.colors).
export type ImageSlot =
  | { existing: string; color_key?: string | null }
  | { file_key: string; color_key?: string | null }

// * Draft color in a create/update payload. New colors carry only a client-side
// * `key`; existing ones also carry their `id`. Variants and images reference a
// * color by `key`, so the edge function can resolve them to ids after insert.
export type ColorPayload = { id?: string; key: string; name: string; hex: string }

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
  footspot_category: FootspotCategory | null
  sort_order: number
  created_at: string
  variants: Variant[]
  // * When is_pack = true, this is the ordered list of component links. Empty otherwise.
  bundle_components: BundleComponent[]
  // * Ordered gallery (position 0 = primary). Empty when no images uploaded.
  images: ProductImage[]
  // * Ordered paid add-ons (by position). Empty when none defined.
  options: ProductOption[]
  // * Ordered color variants (by position). Empty when the product has no colors.
  colors: ProductColor[]
}

export type ProductPayload = Omit<
  Product,
  'id' | 'created_at' | 'variants' | 'bundle_components' | 'images' | 'options' | 'colors'
> & {
  id?: string
  variants?: Array<
    Pick<Variant, 'size' | 'stock' | 'sku' | 'footspot_size'> & {
      id?: string
      // * References a color in `colors[]` by its `key` (null = no color).
      color_key?: string | null
    }
  >
  components?: Array<{ component_product_id: string; axis: BundleAxis; quantity: number }>
  options?: Array<{ name: string; price: number; allow_custom_input?: boolean; input_label?: string | null }>
  colors?: ColorPayload[]
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

function sortOptions(options: ProductOption[] | null | undefined): ProductOption[] {
  return [...(options ?? [])].sort((a, b) => a.position - b.position)
}

function sortColors(colors: ProductColor[] | null | undefined): ProductColor[] {
  return [...(colors ?? [])].sort((a, b) => a.position - b.position)
}

function enrich(p: Product): Product {
  return {
    ...p,
    variants: p.variants ?? [],
    bundle_components: p.bundle_components ?? [],
    images: sortImages(p.images),
    options: sortOptions(p.options),
    colors: sortColors(p.colors),
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
    // * True when the product is used as a component of at least one bundle.
    // * (It stays sellable standalone — this is informational for the admin UI.)
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
            '*, variants:product_variants(*), bundle_components!bundle_components_bundle_product_id_fkey(*), images:product_images(id, image_path, position, color_id), options:product_options(id, name, price, position, allow_custom_input, input_label), colors:product_colors(id, name, hex, position)',
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

    // * Merge product rows into the store (upsert by id). Used to inject a pack's
    // * component products — which may be hidden (is_visible=false) and excluded
    // * by RLS from fetchAll — so byId resolves them for size availability. The
    // * storefront grid filters is_visible, so these never appear as listings.
    mergeItems(list: Product[]) {
      for (const raw of list) {
        const p = enrich(raw)
        const idx = this.items.findIndex((x) => x.id === p.id)
        if (idx === -1) this.items.push(p)
        else this.items[idx] = p
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

    // * Persist a new sort_order for a set of products (admin drag-and-drop,
    // * scoped to one club). Updates the local copies optimistically.
    async reorder(order: Array<{ id: string; sort_order: number }>) {
      const { error } = await invokeEdge<{ ok: true }>('backoffice-products/reorder', {
        method: 'POST',
        body: { order },
      })
      if (error) throw new Error(error.message)
      for (const { id, sort_order } of order) {
        const p = this.items.find((x) => x.id === id)
        if (p) p.sort_order = sort_order
      }
    },

    // * Bulk rename (to = new name) or delete (to = null) a free-text category
    // * across every product that uses it. Patches local copies on success.
    async updateCategory(from: string, to: string | null) {
      const { data, error } = await invokeEdge<{ ok: true; affected: number }>(
        'backoffice-products/update-category',
        { method: 'POST', body: { from, to } },
      )
      if (error) throw new Error(error.message)
      const next = to && to.trim() ? to.trim() : null
      for (const p of this.items) {
        if (p.category === from) p.category = next
      }
      return data?.affected ?? 0
    },

    // * Deep-copy a product into a new hidden draft and prepend it locally.
    // * Returns the new product so the caller can open it for editing.
    async duplicate(id: string) {
      const { data, error } = await invokeEdge<{ product: Product }>('backoffice-products/duplicate', {
        method: 'POST',
        body: { id },
      })
      if (error) throw new Error(error.message)
      if (data?.product) this.items.unshift(enrich(data.product))
      return data?.product ?? null
    },

    async toggleClearance(product: Product) {
      const next = !product.is_on_clearance
      const updated = await this.update({
        ...product,
        is_on_clearance: next,
        // * Preserve colors + per-variant/per-image color links so a toggle
        // * doesn't wipe them (the edge function replaces the whole set).
        colors: product.colors.map((c) => ({ id: c.id, key: c.id, name: c.name, hex: c.hex })),
        image_slots: product.images.map((img) => ({
          existing: img.image_path,
          color_key: img.color_id,
        })),
        variants: product.is_pack
          ? undefined
          : product.variants.map((v) => ({
              id: v.id,
              size: v.size,
              stock: v.stock,
              sku: v.sku,
              footspot_size: v.footspot_size,
              color_key: v.color_id,
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
        // * Keep the current gallery + colors untouched (whole sets are replaced
        // * on save, so they must be echoed back).
        colors: product.colors.map((c) => ({ id: c.id, key: c.id, name: c.name, hex: c.hex })),
        image_slots: product.images.map((img) => ({
          existing: img.image_path,
          color_key: img.color_id,
        })),
        // * Re-serialise the shape the edge function expects depending on kind
        variants: product.is_pack
          ? undefined
          : product.variants.map((v) => ({
              id: v.id,
              size: v.size,
              stock: v.stock,
              sku: v.sku,
              footspot_size: v.footspot_size,
              color_key: v.color_id,
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
