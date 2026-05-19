// * Catalog links store — admin CRUD + public read.
// * Create/update accept an optional File (logo) packaged as FormData.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export interface CatalogLink {
  id: string
  name: { fr: string; en: string }
  url: string
  logo_path: string | null
  sort_order: number
  created_at: string
}

export interface CatalogInput {
  id?: string
  name: { fr: string; en: string }
  url: string
  sort_order?: number
  clear_logo?: boolean
  file?: File | null
}

function buildBody(payload: CatalogInput) {
  const { file, ...rest } = payload
  if (file) {
    const fd = new FormData()
    fd.append('data', JSON.stringify(rest))
    fd.append('logo', file)
    return fd
  }
  return rest
}

export const useCatalogStore = defineStore('catalog', () => {
  const items = ref<CatalogLink[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const sorted = computed(() => [...items.value].sort((a, b) => a.sort_order - b.sort_order))

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const { data, error: err } = await client
        .from('catalog_links')
        .select('*')
        .order('sort_order', { ascending: true })
      if (err) throw err
      items.value = (data ?? []) as CatalogLink[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load catalog'
    } finally {
      loading.value = false
    }
  }

  async function create(payload: CatalogInput) {
    const { data, error: err } = await invokeEdge<{ link: CatalogLink }>('admin-catalog', {
      method: 'POST',
      body: buildBody(payload),
    })
    if (err) throw new Error(err.message)
    if (data?.link) items.value.push(data.link)
    return data?.link
  }

  async function update(payload: CatalogInput & { id: string }) {
    const { data, error: err } = await invokeEdge<{ link: CatalogLink }>('admin-catalog', {
      method: 'PUT',
      body: buildBody(payload),
    })
    if (err) throw new Error(err.message)
    const updated = data?.link
    if (updated) {
      const idx = items.value.findIndex((x) => x.id === updated.id)
      if (idx !== -1) items.value[idx] = updated
    }
    return updated
  }

  async function remove(id: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-catalog', {
      method: 'DELETE',
      query: { id },
    })
    if (err) throw err
    items.value = items.value.filter((x) => x.id !== id)
  }

  return { items, loading, error, sorted, fetchAll, create, update, remove }
})
