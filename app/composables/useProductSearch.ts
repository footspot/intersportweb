// * Storefront product search — talks to the public `search-products` edge
// * function (server-side, restricted-club products excluded confidentially).
// * Debounced query, sport scoping, and dropdown pagination.
import { useDebounceFn } from '@vueuse/core'
import { invokeEdge } from '~/composables/useEdgeFunction'

export interface SearchResult {
  id: string
  name: { fr: string; en: string }
  reference: string
  club_id: string
  club_name: string | null
  club_accent: string | null
  category: string | null
  image_path: string | null
  unit_price: number
  original_price: number
  discount_percent: number
  is_on_clearance: boolean
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

const PAGE_SIZE = 12

export function useProductSearch() {
  const query = ref('')
  const sportId = ref<string | null>(null)
  const page = ref(1)
  const results = ref<SearchResult[]>([])
  const total = ref(0)
  const hasMore = ref(false)
  const loading = ref(false)
  const open = ref(false)

  // * Drop stale responses when a faster later request already resolved.
  let reqId = 0

  async function run() {
    const q = query.value.trim()
    if (q.length < 2) {
      results.value = []
      total.value = 0
      hasMore.value = false
      loading.value = false
      return
    }
    loading.value = true
    const mine = ++reqId
    const { data, error } = await invokeEdge<SearchResponse>('search-products', {
      method: 'POST',
      body: { q, sport_id: sportId.value, page: page.value, page_size: PAGE_SIZE },
    })
    if (mine !== reqId) return // * a newer request won
    loading.value = false
    if (error || !data) {
      results.value = []
      total.value = 0
      hasMore.value = false
      return
    }
    results.value = data.results
    total.value = data.total
    hasMore.value = data.has_more
  }

  const debounced = useDebounceFn(() => {
    page.value = 1
    run()
  }, 250)

  watch(query, () => {
    open.value = true
    debounced()
  })
  watch(sportId, () => {
    page.value = 1
    run()
  })

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

  function setPage(p: number) {
    if (p < 1 || p > totalPages.value) return
    page.value = p
    run()
  }

  function reset() {
    query.value = ''
    results.value = []
    total.value = 0
    hasMore.value = false
    open.value = false
  }

  return {
    query,
    sportId,
    page,
    pageSize: PAGE_SIZE,
    results,
    total,
    totalPages,
    hasMore,
    loading,
    open,
    run,
    setPage,
    reset,
  }
}
