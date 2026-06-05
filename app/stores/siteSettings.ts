// * Singleton site-wide settings store. Public read via RLS, admin writes
// * through the admin-settings edge function.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export interface SiteSettings {
  id: string
  clearance_active: boolean
  promo_banner_text: string | null
  promo_banner_url: string | null
  promo_banner_active: boolean
  carousel_autoplay_seconds: number
  updated_at: string
}

export const useSiteSettingsStore = defineStore('siteSettings', () => {
  const settings = ref<SiteSettings | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const clearanceActive = computed(() => !!settings.value?.clearance_active)
  // * Banner defaults to visible when the row predates the feature (null → true).
  const promoBannerActive = computed(() => settings.value?.promo_banner_active !== false)
  const promoBannerText = computed(() => settings.value?.promo_banner_text ?? null)
  const promoBannerUrl = computed(() => settings.value?.promo_banner_url ?? null)
  // * Carousel dwell time in seconds; falls back to 3 when the row predates the feature.
  const carouselAutoplaySeconds = computed(() => settings.value?.carousel_autoplay_seconds ?? 3)

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const client = useSupabaseClient()
      const { data, error: err } = await client
        .from('site_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (err) throw err
      settings.value = (data ?? null) as SiteSettings | null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load settings'
    } finally {
      loading.value = false
    }
  }

  async function update(
    patch: Partial<
      Pick<
        SiteSettings,
        | 'clearance_active'
        | 'promo_banner_text'
        | 'promo_banner_url'
        | 'promo_banner_active'
        | 'carousel_autoplay_seconds'
      >
    >,
  ) {
    const { data, error: err } = await invokeEdge<{ settings: SiteSettings }>(
      'admin-settings',
      { method: 'PUT', body: patch },
    )
    if (err) throw new Error(err.message)
    if (data?.settings) settings.value = data.settings
    return data?.settings
  }

  async function toggleClearance() {
    return update({ clearance_active: !clearanceActive.value })
  }

  return {
    settings,
    loading,
    error,
    clearanceActive,
    promoBannerActive,
    promoBannerText,
    promoBannerUrl,
    carouselAutoplaySeconds,
    fetchAll,
    update,
    toggleClearance,
  }
})
