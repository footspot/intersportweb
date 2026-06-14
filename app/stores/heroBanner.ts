// * Hero background carousel store — admin CRUD + public read. Full-bleed media
// * (images + videos) that fills the hero banner behind the card deck.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export type HeroMediaKind = 'image' | 'video'

export interface HeroMedia {
  id: string
  media_kind: HeroMediaKind
  media_path: string
  sort_order: number
  created_at: string
}

export const useHeroBannerStore = defineStore('heroBanner', () => {
  const items = ref<HeroMedia[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const sorted = computed(() => [...items.value].sort((a, b) => a.sort_order - b.sort_order))

  function mediaUrl(path: string | null): string | null {
    if (!path) return null
    const { data } = useSupabaseClient().storage.from('home-carousel').getPublicUrl(path)
    return data?.publicUrl ?? null
  }

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const { data, error: err } = await client
        .from('hero_banner_media')
        .select('*')
        .order('sort_order', { ascending: true })
      if (err) throw err
      items.value = (data ?? []) as HeroMedia[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load hero media'
    } finally {
      loading.value = false
    }
  }

  async function create(file: File, mediaKind: HeroMediaKind) {
    const fd = new FormData()
    fd.append('data', JSON.stringify({ media_kind: mediaKind, sort_order: items.value.length }))
    fd.append('file', file)
    const { data, error: err } = await invokeEdge<{ item: HeroMedia }>('admin-hero-media', {
      method: 'POST',
      body: fd,
    })
    if (err) throw new Error(err.message)
    if (data?.item) items.value.push(data.item)
    return data?.item
  }

  async function update(payload: { id: string; sort_order: number }) {
    const { data, error: err } = await invokeEdge<{ item: HeroMedia }>('admin-hero-media', {
      method: 'PUT',
      body: payload,
    })
    if (err) throw new Error(err.message)
    const updated = data?.item
    if (updated) {
      const idx = items.value.findIndex((x) => x.id === updated.id)
      if (idx !== -1) items.value[idx] = updated
    }
    return updated
  }

  async function remove(id: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-hero-media', {
      method: 'DELETE',
      query: { id },
    })
    if (err) throw err
    items.value = items.value.filter((x) => x.id !== id)
  }

  return { items, loading, error, sorted, mediaUrl, fetchAll, create, update, remove }
})
