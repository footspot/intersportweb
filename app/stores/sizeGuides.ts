// * Size-guides Pinia store — reads the brand size-chart library and drives the
// * admin CRUD (upload / rename / replace / delete) through the admin-size-guides
// * edge function. Files live in the public `size-guides` storage bucket.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'
import type { SizeGuide } from '~/stores/products'

interface SizeGuideRow extends SizeGuide {
  created_at: string
}

interface SizeGuideState {
  items: SizeGuideRow[]
  loading: boolean
  loaded: boolean
  error: string | null
}

export const useSizeGuidesStore = defineStore('sizeGuides', {
  state: (): SizeGuideState => ({
    items: [],
    loading: false,
    loaded: false,
    error: null,
  }),

  getters: {
    byId: (state) => (id: string) => state.items.find((g) => g.id === id) ?? null,
  },

  actions: {
    // * Public read — RLS allows anyone to select size_guides, so the storefront
    // * and the admin both load them the same way.
    async fetchAll(force = false) {
      if (this.loaded && !force) return
      this.loading = true
      this.error = null
      try {
        const client = useSupabaseClient()
        const { data, error } = await client
          .from('size_guides')
          .select('id, name, file_path, file_type, created_at')
          .order('created_at', { ascending: false })
        if (error) throw error
        this.items = (data ?? []) as SizeGuideRow[]
        this.loaded = true
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load size guides'
      } finally {
        this.loading = false
      }
    },

    async create(name: string, file: File) {
      const fd = new FormData()
      fd.append('data', JSON.stringify({ name }))
      fd.append('file', file)
      const { data, error } = await invokeEdge<{ guide: SizeGuideRow }>('admin-size-guides', {
        method: 'POST',
        body: fd,
      })
      if (error) throw new Error(error.message)
      if (data?.guide) this.items.unshift(data.guide)
      return data?.guide
    },

    // * Update the name and/or replace the file. Omit `file` to rename only.
    async update(id: string, patch: { name?: string; file?: File | null }) {
      const fd = new FormData()
      fd.append('data', JSON.stringify({ id, name: patch.name }))
      if (patch.file) fd.append('file', patch.file)
      const { data, error } = await invokeEdge<{ guide: SizeGuideRow }>('admin-size-guides', {
        method: 'PUT',
        body: fd,
      })
      if (error) throw new Error(error.message)
      const updated = data?.guide
      if (updated) {
        const idx = this.items.findIndex((g) => g.id === updated.id)
        if (idx !== -1) this.items[idx] = updated
      }
      return updated
    },

    async remove(id: string) {
      const { error } = await invokeEdge<{ ok: true }>('admin-size-guides', {
        method: 'DELETE',
        query: { id },
      })
      if (error) throw new Error(error.message)
      this.items = this.items.filter((g) => g.id !== id)
    },
  },
})
