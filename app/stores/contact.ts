// * Contact info store — singleton.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export interface SocialLink {
  platform: string
  url: string
  icon?: string
}

export interface ContactInfo {
  id: string
  address: string | null
  phone: string | null
  email: string | null
  google_maps_embed_url: string | null
  who_we_are: string | null
  social_media: SocialLink[]
  updated_at: string
}

export type ContactPayload = Partial<Omit<ContactInfo, 'id' | 'updated_at'>>

export const useContactStore = defineStore('contact', () => {
  const info = ref<ContactInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch() {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const { data, error: err } = await client
        .from('contact_info')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (err) throw err
      info.value = (data as ContactInfo | null) ?? null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load contact info'
    } finally {
      loading.value = false
    }
  }

  async function save(payload: ContactPayload) {
    const { data, error: err } = await invokeEdge<{ contact: ContactInfo }>('admin-contact', {
      method: 'PUT',
      body: payload,
    })
    if (err) throw new Error(err.message)
    if (data?.contact) info.value = data.contact
    return data?.contact
  }

  return { info, loading, error, fetch, save }
})
