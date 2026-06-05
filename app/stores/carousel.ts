// * Home hero carousel store — admin CRUD + public read.
// * Create/update accept an optional File (image) packaged as FormData.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export type SlideAnimation = 'zoom' | 'soccer' | 'basketball'

export interface HomeSlide {
  id: string
  image_path: string
  title: string | null
  sort_order: number
  animation: SlideAnimation
  created_at: string
}

export interface SlideInput {
  id?: string
  title?: string | null
  sort_order?: number
  animation?: SlideAnimation
  file?: File | null
}

function buildBody(payload: SlideInput) {
  const { file, ...rest } = payload
  if (file) {
    const fd = new FormData()
    fd.append('data', JSON.stringify(rest))
    fd.append('image', file)
    return fd
  }
  return rest
}

export const useCarouselStore = defineStore('carousel', () => {
  const items = ref<HomeSlide[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const sorted = computed(() => [...items.value].sort((a, b) => a.sort_order - b.sort_order))

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const { data, error: err } = await client
        .from('home_slides')
        .select('*')
        .order('sort_order', { ascending: true })
      if (err) throw err
      items.value = (data ?? []) as HomeSlide[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load carousel'
    } finally {
      loading.value = false
    }
  }

  async function create(payload: SlideInput) {
    const { data, error: err } = await invokeEdge<{ slide: HomeSlide }>('admin-carousel', {
      method: 'POST',
      body: buildBody(payload),
    })
    if (err) throw new Error(err.message)
    if (data?.slide) items.value.push(data.slide)
    return data?.slide
  }

  async function update(payload: SlideInput & { id: string }) {
    const { data, error: err } = await invokeEdge<{ slide: HomeSlide }>('admin-carousel', {
      method: 'PUT',
      body: buildBody(payload),
    })
    if (err) throw new Error(err.message)
    const updated = data?.slide
    if (updated) {
      const idx = items.value.findIndex((x) => x.id === updated.id)
      if (idx !== -1) items.value[idx] = updated
    }
    return updated
  }

  async function remove(id: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-carousel', {
      method: 'DELETE',
      query: { id },
    })
    if (err) throw err
    items.value = items.value.filter((x) => x.id !== id)
  }

  return { items, loading, error, sorted, fetchAll, create, update, remove }
})
