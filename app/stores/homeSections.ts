// * Home page entry sections store — admin CRUD + public read.
// * A section is a category card on slide 0 of the home carousel; clicking
// * it opens a panel listing the section's URL links (like /catalog).
// * Sections + their links are loaded together in fetchAll().
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export interface HomeSection {
  id: string
  name: string
  description: string | null
  logo_path: string | null
  cover_image_path: string | null
  accent_color: string
  text_color: string | null
  cover_gradient: boolean
  is_visible: boolean
  sort_order: number
  created_at: string
}

export interface HomeSectionLink {
  id: string
  section_id: string
  name: string
  url: string
  logo_path: string | null
  sort_order: number
  created_at: string
}

export interface HomeSectionInput {
  id?: string
  name: string
  description?: string | null
  accent_color?: string
  text_color?: string | null
  cover_gradient?: boolean
  is_visible?: boolean
  sort_order?: number
  clear_logo?: boolean
  clear_cover?: boolean
  file?: File | null         // * logo
  cover_file?: File | null   // * full-card cover image
}

export interface HomeSectionLinkInput {
  id?: string
  section_id?: string
  name: string
  url: string
  sort_order?: number
  clear_logo?: boolean
  file?: File | null
}

function buildBody<T extends { file?: File | null; cover_file?: File | null }>(payload: T) {
  const { file, cover_file, ...rest } = payload
  if (file || cover_file) {
    const fd = new FormData()
    fd.append('data', JSON.stringify(rest))
    if (file) fd.append('logo', file)
    if (cover_file) fd.append('cover', cover_file)
    return fd
  }
  return rest
}

export const useHomeSectionsStore = defineStore('homeSections', () => {
  const items = ref<HomeSection[]>([])
  const links = ref<HomeSectionLink[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const sorted = computed(() =>
    [...items.value].sort((a, b) => a.sort_order - b.sort_order),
  )
  const visible = computed(() => sorted.value.filter((s) => s.is_visible))

  function byId(id: string) {
    return items.value.find((s) => s.id === id) ?? null
  }
  function linksFor(sectionId: string): HomeSectionLink[] {
    return links.value
      .filter((l) => l.section_id === sectionId)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const [sectionsRes, linksRes] = await Promise.all([
        client.from('home_sections').select('*').order('sort_order', { ascending: true }),
        client.from('home_section_links').select('*').order('sort_order', { ascending: true }),
      ])
      if (sectionsRes.error) throw sectionsRes.error
      if (linksRes.error) throw linksRes.error
      items.value = (sectionsRes.data ?? []) as HomeSection[]
      links.value = (linksRes.data ?? []) as HomeSectionLink[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load home sections'
    } finally {
      loading.value = false
    }
  }

  async function create(payload: HomeSectionInput) {
    const { data, error: err } = await invokeEdge<{ section: HomeSection }>(
      'admin-home-sections',
      { method: 'POST', body: buildBody(payload) },
    )
    if (err) throw new Error(err.message)
    if (data?.section) items.value.push(data.section)
    return data?.section
  }

  async function update(payload: HomeSectionInput & { id: string }) {
    const { data, error: err } = await invokeEdge<{ section: HomeSection }>(
      'admin-home-sections',
      { method: 'PUT', body: buildBody(payload) },
    )
    if (err) throw new Error(err.message)
    const updated = data?.section
    if (updated) {
      const idx = items.value.findIndex((x) => x.id === updated.id)
      if (idx !== -1) items.value[idx] = updated
    }
    return updated
  }

  async function remove(id: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-home-sections', {
      method: 'DELETE',
      query: { id },
    })
    if (err) throw err
    items.value = items.value.filter((x) => x.id !== id)
    // * The cascade on the DB removes child links too — mirror locally.
    links.value = links.value.filter((l) => l.section_id !== id)
  }

  async function toggleVisible(section: HomeSection) {
    return update({ id: section.id, name: section.name, is_visible: !section.is_visible })
  }

  // * --- Section links ---

  async function createLink(payload: HomeSectionLinkInput & { section_id: string }) {
    const { data, error: err } = await invokeEdge<{ link: HomeSectionLink }>(
      'admin-home-section-links',
      { method: 'POST', body: buildBody(payload) },
    )
    if (err) throw new Error(err.message)
    if (data?.link) links.value.push(data.link)
    return data?.link
  }

  async function updateLink(payload: HomeSectionLinkInput & { id: string }) {
    const { data, error: err } = await invokeEdge<{ link: HomeSectionLink }>(
      'admin-home-section-links',
      { method: 'PUT', body: buildBody(payload) },
    )
    if (err) throw new Error(err.message)
    const updated = data?.link
    if (updated) {
      const idx = links.value.findIndex((x) => x.id === updated.id)
      if (idx !== -1) links.value[idx] = updated
    }
    return updated
  }

  async function removeLink(id: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-home-section-links', {
      method: 'DELETE',
      query: { id },
    })
    if (err) throw err
    links.value = links.value.filter((x) => x.id !== id)
  }

  return {
    items,
    links,
    loading,
    error,
    sorted,
    visible,
    byId,
    linksFor,
    fetchAll,
    create,
    update,
    remove,
    toggleVisible,
    createLink,
    updateLink,
    removeLink,
  }
})
