// * Clubs Pinia store — reads public clubs list and drives admin CRUD.
// * Create/update accept an optional File (logo) packaged as FormData.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export interface Club {
  id: string
  sport_id: string
  name: string
  logo_path: string | null
  is_password_protected: boolean
  fund_balance: number
  sort_order: number
  created_at: string
  accent_color: string | null
  slogan: string | null
  footspot_linked: boolean
  shop_status: 'active' | 'disconnected'
  product_count?: number
  order_count?: number
}

interface ClubState {
  items: Club[]
  loading: boolean
  error: string | null
}

export interface ClubInput {
  id?: string
  sport_id: string
  name: string
  is_password_protected?: boolean
  password?: string | null
  sort_order?: number
  clear_logo?: boolean
  file?: File | null
  accent_color?: string | null
  slogan?: string | null
}

function buildBody(payload: ClubInput) {
  const { file, ...rest } = payload
  if (file) {
    const fd = new FormData()
    fd.append('data', JSON.stringify(rest))
    fd.append('logo', file)
    return fd
  }
  return rest
}

export const useClubsStore = defineStore('clubs', () => {
  const items = ref<Club[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const bySport = computed(() => (sportId: string): Club[] =>
    items.value.filter((c) => c.sport_id === sportId),
  )
  const byId = computed(() => (id: string) => items.value.find((c) => c.id === id) ?? null)

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const { data: clubs, error: err } = await client
        .from('clubs')
        .select(
          'id, sport_id, name, logo_path, is_password_protected, fund_balance, sort_order, created_at, accent_color, slogan, footspot_linked, shop_status',
        )
        .order('sort_order', { ascending: true })
      if (err) throw err
      const base = (clubs ?? []) as Club[]

      const counts = await Promise.all(
        base.map((c) =>
          client
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('club_id', c.id)
            .then(({ count }) => ({ id: c.id, count: count ?? 0 })),
        ),
      )
      const byIdMap = Object.fromEntries(counts.map((r) => [r.id, r.count]))
      items.value = base.map((c) => ({ ...c, product_count: byIdMap[c.id] ?? 0 }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load clubs'
    } finally {
      loading.value = false
    }
  }

  async function create(payload: ClubInput) {
    const { data, error: err } = await invokeEdge<{ club: Club }>('admin-clubs', {
      method: 'POST',
      body: buildBody(payload),
    })
    if (err) throw new Error(err.message)
    if (data?.club) items.value.push({ ...data.club, product_count: 0 })
    return data?.club
  }

  async function update(payload: ClubInput & { id: string }) {
    const { data, error: err } = await invokeEdge<{ club: Club }>('admin-clubs', {
      method: 'PUT',
      body: buildBody(payload),
    })
    if (err) throw new Error(err.message)
    const updated = data?.club
    if (updated) {
      const idx = items.value.findIndex((c) => c.id === updated.id)
      if (idx !== -1) items.value[idx] = { ...items.value[idx], ...updated }
    }
    return updated
  }

  async function resetPassword(id: string, password: string | null) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-clubs/reset-password', {
      method: 'POST',
      body: { id, password },
    })
    if (err) throw new Error(err.message)
    const club = items.value.find((c) => c.id === id)
    if (club) club.is_password_protected = password !== null
  }

  async function remove(id: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-clubs', {
      method: 'DELETE',
      query: { id },
    })
    if (err) throw err
    items.value = items.value.filter((c) => c.id !== id)
  }

  return { items, loading, error, bySport, byId, fetchAll, create, update, resetPassword, remove }
})
