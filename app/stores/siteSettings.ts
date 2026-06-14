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
  // * Static entry-card personalization (cover image + overlay text color).
  catalog_cover_image_path: string | null
  catalog_text_color: string | null
  catalog_cover_gradient: boolean
  shop_cover_image_path: string | null
  shop_text_color: string | null
  shop_cover_gradient: boolean
  clearance_cover_image_path: string | null
  clearance_text_color: string | null
  clearance_cover_gradient: boolean
  // * Hero: admin launch video (null → bundled default) + show/hide the deck.
  hero_video_path: string | null
  hero_show_cards: boolean
  // * "Les bons plans du moment" featured carousel: visibility + custom title.
  bons_plans_active: boolean
  bons_plans_title: string | null
  updated_at: string
}

// * Payload for the entry-card editor — text colors + clear flags as JSON,
// * cover images as Files (sent multipart when any file is present).
export interface EntryCardInput {
  catalog_text_color?: string | null
  shop_text_color?: string | null
  clearance_text_color?: string | null
  catalog_cover_gradient?: boolean
  shop_cover_gradient?: boolean
  clearance_cover_gradient?: boolean
  clear_catalog_cover?: boolean
  clear_shop_cover?: boolean
  clear_clearance_cover?: boolean
  catalog_cover?: File | null
  shop_cover?: File | null
  clearance_cover?: File | null
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
  // * Hero deck visibility — defaults to shown when the row predates the feature.
  const heroShowCards = computed(() => settings.value?.hero_show_cards !== false)
  // * Featured "bons plans" carousel — hidden by default until an admin enables it.
  const bonsPlansActive = computed(() => !!settings.value?.bons_plans_active)
  const bonsPlansTitle = computed(() => settings.value?.bons_plans_title ?? null)
  // * Public URL of the admin launch video, or null → caller uses the bundled clip.
  const heroVideoUrl = computed(() => {
    const path = settings.value?.hero_video_path
    if (!path) return null
    const { data } = useSupabaseClient().storage.from('home-carousel').getPublicUrl(path)
    return data?.publicUrl ?? null
  })

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
        | 'bons_plans_active'
        | 'bons_plans_title'
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

  // * Hero settings — show/hide the deck and/or replace/clear the launch video.
  // * Sends multipart when a video File is present, plain JSON otherwise.
  async function updateHero(payload: {
    hero_show_cards?: boolean
    hero_video?: File | null
    clear_hero_video?: boolean
  }) {
    const { hero_video, ...rest } = payload
    let body: FormData | typeof rest = rest
    if (hero_video) {
      const fd = new FormData()
      fd.append('data', JSON.stringify(rest))
      fd.append('hero_video', hero_video)
      body = fd
    }
    const { data, error: err } = await invokeEdge<{ settings: SiteSettings }>(
      'admin-settings',
      { method: 'PUT', body },
    )
    if (err) throw new Error(err.message)
    if (data?.settings) settings.value = data.settings
    return data?.settings
  }

  // * Static entry cards (catalog/shop/clearance) cover + text color. Sends
  // * multipart when any cover File is present, plain JSON otherwise.
  async function updateEntryCards(payload: EntryCardInput) {
    const { catalog_cover, shop_cover, clearance_cover, ...rest } = payload
    let body: FormData | typeof rest = rest
    if (catalog_cover || shop_cover || clearance_cover) {
      const fd = new FormData()
      fd.append('data', JSON.stringify(rest))
      if (catalog_cover) fd.append('catalog_cover', catalog_cover)
      if (shop_cover) fd.append('shop_cover', shop_cover)
      if (clearance_cover) fd.append('clearance_cover', clearance_cover)
      body = fd
    }
    const { data, error: err } = await invokeEdge<{ settings: SiteSettings }>(
      'admin-settings',
      { method: 'PUT', body },
    )
    if (err) throw new Error(err.message)
    if (data?.settings) settings.value = data.settings
    return data?.settings
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
    heroShowCards,
    bonsPlansActive,
    bonsPlansTitle,
    heroVideoUrl,
    fetchAll,
    update,
    toggleClearance,
    updateEntryCards,
    updateHero,
  }
})
