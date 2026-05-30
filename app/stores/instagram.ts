// * Instagram feed store. Read-only public feed cached in Postgres by the
// * instagram-sync worker; the storefront binds to the cached rows (same direct
// * RLS read pattern as siteSettings — no edge function on the read path).
import { defineStore } from 'pinia'

export interface InstagramPost {
  id: string
  ig_id: string
  media_type: string | null
  media_url: string | null
  thumbnail_url: string | null
  permalink: string | null
  caption: string | null
  posted_at: string | null
}

export const useInstagramStore = defineStore('instagram', () => {
  const posts = ref<InstagramPost[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // * The single most-recent post — what the home page features by default.
  const latest = computed(() => posts.value[0] ?? null)

  async function fetchAll(limit = 4) {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const { data, error: err } = await client
        .from('instagram_posts')
        .select('*')
        .order('posted_at', { ascending: false })
        .limit(limit)
      if (err) throw err
      posts.value = (data ?? []) as InstagramPost[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load Instagram feed'
    } finally {
      loading.value = false
    }
  }

  return { posts, loading, error, latest, fetchAll }
})
