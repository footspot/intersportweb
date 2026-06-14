// * Storefront home flow — the interactive state machine extracted out of the
// * (formerly monolithic) home page so the section components can stay thin.
// * Created once in `pages/index.vue` and shared with the section components via
// * provide/inject (`HomeFlowKey` / `useHomeFlowCtx`).
import type { InjectionKey } from 'vue'
import { useSportsStore, type Sport } from '~/stores/sports'
import { useClubsStore, type Club } from '~/stores/clubs'
import { useProductsStore, type Product } from '~/stores/products'
import { useCatalogStore } from '~/stores/catalog'
import { useCarouselStore } from '~/stores/carousel'
import { useHeroBannerStore } from '~/stores/heroBanner'
import { useHomeSectionsStore, type HomeSection } from '~/stores/homeSections'
import { useClubAccessStore } from '~/stores/clubAccess'
import { useSiteSettingsStore } from '~/stores/siteSettings'
import { useProductDiscountsStore } from '~/stores/productDiscounts'
import { useFeaturedProductsStore } from '~/stores/featuredProducts'
import { computeUnitPricing, applyClubDiscount } from '~/composables/usePricingPreview'

export type HomeMode = 'idle' | 'catalog' | 'clearance' | 'home-section' | 'products'

export function useHomeFlow() {
  const { t, locale } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const client = useSupabaseClient()

  const sports = useSportsStore()
  const clubs = useClubsStore()
  const products = useProductsStore()
  const catalog = useCatalogStore()
  const carousel = useCarouselStore()
  const heroBanner = useHeroBannerStore()
  const homeSections = useHomeSectionsStore()
  const access = useClubAccessStore()
  const siteSettings = useSiteSettingsStore()
  const productDiscounts = useProductDiscountsStore()
  const featuredProducts = useFeaturedProductsStore()

  // * UI state
  const currentSlide = ref<0 | 1 | 2>(0) // * 0=entry, 1=sports, 2=clubs
  const mode = ref<HomeMode>('idle')
  const selectedHomeSectionId = ref<string | null>(null)
  const selectedSportId = ref<string | null>(null)
  const selectedClubId = ref<string | null>(null)
  const activeCategory = ref<string | null>(null)

  const pendingClub = ref<Club | null>(null)
  const pwOpen = ref(false)

  // * Which top-nav tab the header should highlight. Kept in shared state because
  // * the header lives outside this page and the `?step` query is stripped after
  // * handling, so the URL can't be the source of truth.
  const activeNav = useState<string>('storefront:active-nav', () => 'home')

  // * ── Storage URL helpers ──
  function publicUrl(bucket: string, path: string | null): string | null {
    if (!path) return null
    const { data } = client.storage.from(bucket).getPublicUrl(path)
    return data?.publicUrl ?? null
  }
  const sportIconUrl = (p: string | null) => publicUrl('sports-icons', p)
  const clubLogoUrl = (p: string | null) => publicUrl('club-logos', p)
  const catalogLogoUrl = (p: string | null) => publicUrl('catalog-logos', p)
  const homeSectionLogoUrl = (p: string | null) => publicUrl('home-section-logos', p)
  const homeSectionCoverUrl = (p: string | null) => publicUrl('home-section-covers', p)
  const entryCardCoverUrl = (p: string | null) => publicUrl('entry-card-covers', p)
  const homeSectionLinkLogoUrl = (p: string | null) => publicUrl('home-section-link-logos', p)
  const productImageUrl = (p: string | null) => publicUrl('product-images', p)

  function sportName(s: Sport) {
    return s.name[locale.value as 'fr' | 'en'] ?? s.name.fr
  }

  // * #rrggbb → "r, g, b" for CSS rgba() in entry-card glow vars.
  function hexToRgbTriple(hex: string): string {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
    if (!m) return '27, 42, 107'
    const n = parseInt(m[1]!, 16)
    return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`
  }
  function sectionStyle(section: HomeSection) {
    return {
      '--accent': section.accent_color,
      '--accent-rgb': hexToRgbTriple(section.accent_color),
    } as Record<string, string>
  }

  // * ── Clearance ──
  const clearanceProducts = computed<Product[]>(() =>
    products.items.filter(
      (p) => p.is_on_clearance && p.is_visible && !products.isComponent(p.id),
    ),
  )
  const clearanceVisible = computed(
    () => siteSettings.clearanceActive && clearanceProducts.value.length > 0,
  )

  // * ── "Les bons plans du moment" ──
  // * Admin-ordered roster resolved to live, visible products (drops hidden /
  // * deleted picks). Render order follows the featured_products sort_order.
  const bonsPlansProducts = computed<Product[]>(() =>
    featuredProducts.orderedProductIds
      .map((id) => products.byId(id))
      .filter((p): p is Product => !!p && p.is_visible),
  )
  const bonsPlansVisible = computed(
    () => siteSettings.bonsPlansActive && bonsPlansProducts.value.length > 0,
  )

  // * ── Hero stats ──
  const stats = computed(() => ({
    clubs: clubs.items.length,
    products: products.items.filter((p) => p.is_visible).length,
    sports: sports.items.length,
  }))

  // * ── Derived selections ──
  const sportClubs = computed<Club[]>(() => {
    if (!selectedSportId.value) return []
    return clubs.items
      .filter((c) => c.sport_id === selectedSportId.value)
      .sort((a, b) => a.sort_order - b.sort_order)
  })

  const clubProducts = computed<Product[]>(() => {
    if (!selectedClubId.value) return []
    return products.items.filter(
      (p) =>
        p.club_id === selectedClubId.value &&
        p.is_visible &&
        !products.isComponent(p.id),
    )
  })

  const productCategories = computed<string[]>(() => {
    const s = new Set<string>()
    for (const p of clubProducts.value) if (p.category) s.add(p.category)
    return Array.from(s).sort()
  })

  const filteredProducts = computed<Product[]>(() => {
    if (!activeCategory.value) return clubProducts.value
    return clubProducts.value.filter((p) => p.category === activeCategory.value)
  })

  const selectedClub = computed<Club | null>(() =>
    selectedClubId.value ? clubs.byId(selectedClubId.value) : null,
  )

  // * Fall back to the Intersport red when the club set no accent colour.
  const accentCss = computed(() => selectedClub.value?.accent_color ?? '#e8251f')

  const selectedHomeSection = computed(() =>
    selectedHomeSectionId.value ? homeSections.byId(selectedHomeSectionId.value) : null,
  )
  const selectedHomeSectionLinks = computed(() =>
    selectedHomeSectionId.value ? homeSections.linksFor(selectedHomeSectionId.value) : [],
  )

  // * ── Pricing (reuse the single source of truth) ──
  function fmt(v: number) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
  }
  function pricingFor(p: Product) {
    return computeUnitPricing({
      buying_price: Number(p.buying_price),
      selling_price: Number(p.selling_price),
      discount_percent: Number(p.discount_percent ?? 0),
      discount_source: p.discount_source ?? null,
    })
  }
  const clubDiscountPct = (p: Product) => productDiscounts.pctFor(p.club_id, p.reference)
  const finalPrice = (p: Product) =>
    applyClubDiscount(pricingFor(p).unit_price_paid, clubDiscountPct(p))
  function displayDiscount(p: Product): number {
    const fs = clubDiscountPct(p)
    return fs > 0 ? fs : Number(p.discount_percent ?? 0)
  }
  function productSizes(p: Product): string[] {
    if (p.is_pack) return ['?']
    return p.variants.slice(0, 4).map((v) => v.size)
  }

  function goToProduct(p: Product) {
    router.push(`/product/${p.id}`)
  }

  // * ── Navigation / actions ──
  // * Scroll a target section just below the sticky header. We compute the
  // * position manually (rather than scrollIntoView) and subtract the live
  // * header height so the section lands under it instead of behind it — and so
  // * page height (e.g. the footer) can't change where we land.
  function scrollToSelector(sel: string) {
    setTimeout(() => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return
      const header = document.querySelector('header') as HTMLElement | null
      const offset = (header?.offsetHeight ?? 0) + 12
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }, 280)
  }

  function pickEntry(kind: 'catalog' | 'shop' | 'clearance') {
    if (kind === 'catalog') {
      mode.value = 'catalog'
      activeNav.value = 'catalog'
      currentSlide.value = 0
      selectedClubId.value = null
      selectedHomeSectionId.value = null
      nextTick(() => scrollToSelector('[data-home-catalog]'))
    } else if (kind === 'clearance') {
      mode.value = 'clearance'
      activeNav.value = 'home'
      currentSlide.value = 0
      selectedClubId.value = null
      selectedHomeSectionId.value = null
      nextTick(() => scrollToSelector('[data-home-clearance]'))
    } else {
      mode.value = 'idle'
      activeNav.value = 'shop'
      selectedHomeSectionId.value = null
      currentSlide.value = 1
      nextTick(() => scrollToSelector('[data-home-shop]'))
    }
  }

  function pickHomeSection(id: string) {
    selectedHomeSectionId.value = id
    selectedClubId.value = null
    mode.value = 'home-section'
    activeNav.value = 'home'
    currentSlide.value = 0
    nextTick(() => scrollToSelector('[data-home-section]'))
  }

  function pickSport(s: Sport) {
    selectedSportId.value = s.id
    selectedClubId.value = null
    mode.value = 'idle'
    activeNav.value = 'shop'
    currentSlide.value = 2
  }

  function pickClub(c: Club) {
    if (c.is_password_protected && !access.hasAccess(c.id)) {
      pendingClub.value = c
      pwOpen.value = true
      return
    }
    activateClub(c)
  }

  function activateClub(c: Club) {
    selectedClubId.value = c.id
    activeCategory.value = null
    mode.value = 'products'
    activeNav.value = 'shop'
    router.replace({ query: { club: c.id } })
    nextTick(() => scrollToSelector('[data-home-products]'))
  }

  function goHome() {
    selectedSportId.value = null
    selectedClubId.value = null
    selectedHomeSectionId.value = null
    mode.value = 'idle'
    activeNav.value = 'home'
    currentSlide.value = 0
    router.replace({ query: {} })
  }

  function goBackToSports() {
    selectedSportId.value = null
    selectedClubId.value = null
    mode.value = 'idle'
    activeNav.value = 'shop'
    currentSlide.value = 1
    router.replace({ query: {} })
  }

  function onPwUnlocked() {
    if (pendingClub.value) activateClub(pendingClub.value)
    pendingClub.value = null
  }

  // * Sync carousel state with the ?club= URL param.
  watch(
    () => route.query.club as string | undefined,
    (clubId) => {
      if (!clubId) {
        goHome()
        return
      }
      if (selectedClubId.value === clubId) return
      const club = clubs.byId(clubId)
      if (!club) return
      selectedSportId.value = club.sport_id
      currentSlide.value = 2
      pickClub(club)
    },
    { immediate: true },
  )

  // * `?step=...` deep-links from the header.
  watch(
    () => route.query.step as string | undefined,
    (step) => {
      if (step === 'shop') {
        selectedClubId.value = null
        mode.value = 'idle'
        activeNav.value = 'shop'
        currentSlide.value = 1
        router.replace({ query: {} })
        nextTick(() => scrollToSelector('[data-home-shop]'))
      } else if (step === 'catalog') {
        currentSlide.value = 0
        pickEntry('catalog')
        router.replace({ query: {} })
      } else if (step === 'home') {
        goHome()
        router.replace({ query: {} })
        nextTick(() => scrollToSelector('.home-page'))
      }
    },
    { immediate: true },
  )

  return {
    // * i18n / locale passthrough for templates
    t,
    locale,
    // * stores
    sports,
    clubs,
    products,
    catalog,
    carousel,
    heroBanner,
    homeSections,
    siteSettings,
    productDiscounts,
    featuredProducts,
    // * state
    currentSlide,
    mode,
    selectedHomeSectionId,
    selectedSportId,
    selectedClubId,
    activeCategory,
    pendingClub,
    pwOpen,
    // * computed
    clearanceProducts,
    clearanceVisible,
    bonsPlansProducts,
    bonsPlansVisible,
    stats,
    sportClubs,
    clubProducts,
    productCategories,
    filteredProducts,
    selectedClub,
    accentCss,
    selectedHomeSection,
    selectedHomeSectionLinks,
    // * helpers
    sportName,
    sportIconUrl,
    clubLogoUrl,
    catalogLogoUrl,
    homeSectionLogoUrl,
    homeSectionCoverUrl,
    entryCardCoverUrl,
    homeSectionLinkLogoUrl,
    productImageUrl,
    sectionStyle,
    fmt,
    clubDiscountPct,
    finalPrice,
    displayDiscount,
    productSizes,
    goToProduct,
    // * actions
    pickEntry,
    pickHomeSection,
    pickSport,
    pickClub,
    activateClub,
    goHome,
    goBackToSports,
    onPwUnlocked,
  }
}

export type HomeFlow = ReturnType<typeof useHomeFlow>

export const HomeFlowKey: InjectionKey<HomeFlow> = Symbol('home-flow')

// * Section components inject the single flow instance created by the page.
export function useHomeFlowCtx(): HomeFlow {
  const flow = inject(HomeFlowKey)
  if (!flow) throw new Error('useHomeFlowCtx() must be used within the home page')
  return flow
}
