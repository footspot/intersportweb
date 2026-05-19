// * Sports Pinia store — reads the public sports list and drives admin CRUD.
// * Create/update support an optional File (icon). Images upload + row insert
// * happen in a single edge-function call to avoid orphaned storage files.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export interface Sport {
  id: string
  name: { fr: string; en: string }
  icon_path: string | null
  sort_order: number
  created_at: string
}

interface SportState {
  items: Sport[]
  loading: boolean
  error: string | null
}

export interface SportInput {
  id?: string
  name: { fr: string; en: string }
  sort_order?: number
  clear_icon?: boolean
  file?: File | null
}

function buildBody(payload: SportInput) {
  const { file, ...rest } = payload
  if (file) {
    const fd = new FormData()
    fd.append('data', JSON.stringify(rest))
    fd.append('icon', file)
    return fd
  }
  return rest
}

export const useSportsStore = defineStore('sports', () => {
  const items = ref<Sport[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const sorted = computed((): Sport[] =>
    [...items.value].sort((a, b) => a.sort_order - b.sort_order),
  )
  const byId = computed(() => (id: string) => items.value.find((s) => s.id === id) ?? null)

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const { data, error: err } = await client
        .from('sports')
        .select('id, name, icon_path, sort_order, created_at')
        .order('sort_order', { ascending: true })
      if (err) throw err
      items.value = (data ?? []) as Sport[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load sports'
    } finally {
      loading.value = false
    }
  }

  async function create(payload: SportInput) {
    const { data, error: err } = await invokeEdge<{ sport: Sport }>('admin-sports', {
      method: 'POST',
      body: buildBody(payload),
    })
    if (err) throw new Error(err.message)
    if (data?.sport) items.value.push(data.sport)
    return data?.sport
  }

  async function update(payload: SportInput & { id: string }) {
    const { data, error: err } = await invokeEdge<{ sport: Sport }>('admin-sports', {
      method: 'PUT',
      body: buildBody(payload),
    })
    if (err) throw new Error(err.message)
    const updated = data?.sport
    if (updated) {
      const idx = items.value.findIndex((s) => s.id === updated.id)
      if (idx !== -1) items.value[idx] = updated
    }
    return updated
  }

  async function remove(id: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-sports', {
      method: 'DELETE',
      query: { id },
    })
    if (err) throw err
    items.value = items.value.filter((s) => s.id !== id)
  }

  async function reorder(order: Array<{ id: string; sort_order: number }>) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-sports/reorder', {
      method: 'POST',
      body: { order },
    })
    if (err) throw new Error(err.message)
    for (const { id, sort_order } of order) {
      const s = items.value.find((x) => x.id === id)
      if (s) s.sort_order = sort_order
    }
  }

  return { items, loading, error, sorted, byId, fetchAll, create, update, remove, reorder }
})
