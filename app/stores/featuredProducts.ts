// * Featured products store — the admin hand-picked roster behind the
// * "Les bons plans du moment" home carousel. Public read via RLS; writes go
// * through the admin-featured-products edge function.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export interface FeaturedProduct {
  id: string
  product_id: string
  sort_order: number
  created_at: string
}

export const useFeaturedProductsStore = defineStore('featuredProducts', () => {
  const items = ref<FeaturedProduct[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // * Ordered product ids — the source of truth for render order.
  const orderedProductIds = computed(() => items.value.map((f) => f.product_id))

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const { data, error: err } = await client
        .from('featured_products')
        .select('*')
        .order('sort_order', { ascending: true })
      if (err) throw err
      items.value = (data ?? []) as FeaturedProduct[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load featured products'
    } finally {
      loading.value = false
    }
  }

  async function add(productId: string) {
    const { data, error: err } = await invokeEdge<{ featured: FeaturedProduct }>(
      'admin-featured-products',
      { method: 'POST', body: { product_id: productId } },
    )
    if (err) throw new Error(err.message)
    if (data?.featured) items.value.push(data.featured)
    return data?.featured
  }

  async function remove(id: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-featured-products', {
      method: 'DELETE',
      query: { id },
    })
    if (err) throw new Error(err.message)
    items.value = items.value.filter((f) => f.id !== id)
  }

  // * Persist a new order (admin reorder) and patch the local copies.
  async function reorder(order: Array<{ id: string; sort_order: number }>) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-featured-products/reorder', {
      method: 'POST',
      body: { order },
    })
    if (err) throw new Error(err.message)
    for (const { id, sort_order } of order) {
      const f = items.value.find((x) => x.id === id)
      if (f) f.sort_order = sort_order
    }
    items.value = [...items.value].sort((a, b) => a.sort_order - b.sort_order)
  }

  return { items, loading, error, orderedProductIds, fetchAll, add, remove, reorder }
})
