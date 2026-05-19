<script setup lang="ts">
// * Storefront home — hero + vertical 3-slide carousel (entry → sports → clubs)
// * then a conditional products section or partner-catalog section.
// * Matches wireframes/home-wireframe_carousel.html layout + behaviour.
import { useSportsStore, type Sport } from '~/stores/sports'
import { useClubsStore, type Club } from '~/stores/clubs'
import { useProductsStore, type Product } from '~/stores/products'
import { useCatalogStore } from '~/stores/catalog'
import { useCarouselStore } from '~/stores/carousel'
import { useHomeSectionsStore, type HomeSection } from '~/stores/homeSections'
import { useClubAccessStore } from '~/stores/clubAccess'
import { useSiteSettingsStore } from '~/stores/siteSettings'
import { computeUnitPricing } from '~/composables/usePricingPreview'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const sports = useSportsStore()
const clubs = useClubsStore()
const products = useProductsStore()
const catalog = useCatalogStore()
const carousel = useCarouselStore()
const homeSections = useHomeSectionsStore()
const access = useClubAccessStore()
const siteSettings = useSiteSettingsStore()
const client = useSupabaseClient()

await useAsyncData('home-bootstrap', async () => {
  await Promise.all([
    sports.fetchAll(),
    clubs.fetchAll(),
    products.fetchAll(),
    catalog.fetchAll(),
    carousel.fetchAll(),
    homeSections.fetchAll(),
    siteSettings.fetchAll(),
  ])
  return true
})

// * UI state
type Mode = 'idle' | 'catalog' | 'clearance' | 'home-section' | 'products'
const currentSlide = ref<0 | 1 | 2>(0) // 0=entry, 1=sports, 2=clubs
const mode = ref<Mode>('idle')
const selectedHomeSectionId = ref<string | null>(null)
const selectedSportId = ref<string | null>(null)
const selectedClubId = ref<string | null>(null)

const pendingClub = ref<Club | null>(null)
const pwOpen = ref(false)

const activeCategory = ref<string | null>(null)

// * Slide refs for dynamic height measurement
const slideEntryEl = ref<HTMLElement | null>(null)
const slideSportsEl = ref<HTMLElement | null>(null)
const slideClubsEl = ref<HTMLElement | null>(null)
const viewportHeight = ref(0)
const trackOffset = ref(0)

function measure() {
  const entryH = slideEntryEl.value?.offsetHeight ?? 0
  const sportsH = slideSportsEl.value?.offsetHeight ?? 0
  const clubsH = slideClubsEl.value?.offsetHeight ?? 0

  if (currentSlide.value === 0) {
    viewportHeight.value = entryH
    trackOffset.value = 0
  } else if (currentSlide.value === 1) {
    viewportHeight.value = sportsH
    trackOffset.value = entryH
  } else {
    viewportHeight.value = clubsH
    trackOffset.value = entryH + sportsH
  }
}

onMounted(() => {
  requestAnimationFrame(measure)
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
})

// * Clearance products — visible, on clearance, not locked into a bundle.
// * Defined here (before the watch) because the carousel viewport height
// * depends on the slide-0 content, which is taller when clearance is active.
const clearanceProducts = computed<Product[]>(() =>
  products.items.filter(
    (p) => p.is_on_clearance && p.is_visible && !products.isComponent(p.id),
  ),
)

const clearanceVisible = computed(
  () => siteSettings.clearanceActive && clearanceProducts.value.length > 0,
)

watch(
  [currentSlide, selectedSportId, clearanceVisible, () => homeSections.visible.length],
  () => {
    nextTick(() => requestAnimationFrame(measure))
  },
)

// * Header text for the carousel section
const stepHeader = computed(() => {
  if (currentSlide.value === 0) {
    return {
      icon: '✦',
      title: t('storefront.home.stepEntryTitle'),
      hint: t('storefront.home.stepEntryHint'),
    }
  }
  if (currentSlide.value === 1) {
    return {
      icon: '1',
      title: t('storefront.home.stepSportsTitle'),
      hint: t('storefront.home.stepSportsHint'),
    }
  }
  const sport = sports.byId(selectedSportId.value ?? '')
  const count = sport
    ? clubs.items.filter((c) => c.sport_id === sport.id).length
    : 0
  return {
    icon: '2',
    title: t('storefront.home.stepClubsTitle'),
    hint: sport
      ? `${sportName(sport)} — ${count} ${t('storefront.home.clubsWord')}`
      : '',
  }
})

function sportName(s: Sport) {
  return s.name[locale.value as 'fr' | 'en'] ?? s.name.fr
}

function sportIconUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('sports-icons').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function clubLogoUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('club-logos').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function catalogLogoUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('catalog-logos').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function homeSectionLogoUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('home-section-logos').getPublicUrl(path)
  return data?.publicUrl ?? null
}

// * #rrggbb → "r, g, b" string for CSS rgba() in entry-card glow vars.
function hexToRgbTriple(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return '3, 49, 249'
  const n = parseInt(m[1]!, 16)
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`
}

function sectionStyle(section: HomeSection) {
  return {
    '--accent': section.accent_color,
    '--accent-rgb': hexToRgbTriple(section.accent_color),
  } as Record<string, string>
}

function productImageUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}

// * Hero stats
const stats = computed(() => ({
  clubs: clubs.items.length,
  products: products.items.filter((p) => p.is_visible).length,
  sports: sports.items.length,
}))

function goToProduct(p: Product) {
  router.push(`/product/${p.id}`)
}

// * Club list for the active sport
const sportClubs = computed<Club[]>(() => {
  if (!selectedSportId.value) return []
  return clubs.items
    .filter((c) => c.sport_id === selectedSportId.value)
    .sort((a, b) => a.sort_order - b.sort_order)
})

// * Products for the active club (excluding locked components)
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

const accentCss = computed(() => selectedClub.value?.accent_color ?? 'transparent')

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

function productSizes(p: Product): string[] {
  if (p.is_pack) return ['?']
  return p.variants.slice(0, 4).map((v) => v.size)
}

// * ── Entry actions ──
function pickEntry(kind: 'catalog' | 'shop' | 'clearance') {
  if (kind === 'catalog') {
    mode.value = 'catalog'
    selectedClubId.value = null
    selectedHomeSectionId.value = null
    nextTick(() => scrollToSelector('[data-home-catalog]'))
  } else if (kind === 'clearance') {
    mode.value = 'clearance'
    selectedClubId.value = null
    selectedHomeSectionId.value = null
    nextTick(() => scrollToSelector('[data-home-clearance]'))
  } else {
    mode.value = 'idle'
    selectedHomeSectionId.value = null
    currentSlide.value = 1
  }
}

function pickHomeSection(id: string) {
  selectedHomeSectionId.value = id
  selectedClubId.value = null
  mode.value = 'home-section'
  nextTick(() => scrollToSelector('[data-home-section]'))
}

const selectedHomeSection = computed(() =>
  selectedHomeSectionId.value ? homeSections.byId(selectedHomeSectionId.value) : null,
)
const selectedHomeSectionLinks = computed(() =>
  selectedHomeSectionId.value ? homeSections.linksFor(selectedHomeSectionId.value) : [],
)

function homeSectionLinkLogoUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('home-section-link-logos').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function pickSport(s: Sport) {
  selectedSportId.value = s.id
  selectedClubId.value = null
  mode.value = 'idle'
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
  router.replace({ query: { club: c.id } })
  nextTick(() => scrollToSelector('[data-home-products]'))
}

function goHome() {
  selectedSportId.value = null
  selectedClubId.value = null
  selectedHomeSectionId.value = null
  mode.value = 'idle'
  currentSlide.value = 0
  router.replace({ query: {} })
}

function goBackToSports() {
  selectedSportId.value = null
  selectedClubId.value = null
  mode.value = 'idle'
  currentSlide.value = 1
  router.replace({ query: {} })
}

// * Sync carousel state with the ?club= URL param.
// * No param → reset to slide 0. With param → restore club selection.
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

// * `?step=...` deep-links from the header — `shop` opens the sports picker
// * (slide 1), `catalog` opens the partner-catalog section, `home` resets to the
// * entry slide. Query is stripped after handling so navigation history stays clean.
watch(
  () => route.query.step as string | undefined,
  (step) => {
    if (step === 'shop') {
      selectedClubId.value = null
      mode.value = 'idle'
      currentSlide.value = 1
      router.replace({ query: {} })
      nextTick(() => scrollToSelector('.home-page'))
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

function onPwUnlocked() {
  if (pendingClub.value) activateClub(pendingClub.value)
  pendingClub.value = null
}

function scrollToSelector(sel: string) {
  setTimeout(() => {
    const el = document.querySelector(sel) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 280)
}
</script>

<template>
  <div class="home-page bg-[#f8f9fc] dark:bg-sidebar-bg text-[#1a1a2e] dark:text-gray-100">
    <!-- HERO -->
    <section class="hero relative overflow-hidden min-h-[400px] lg:min-h-[480px] flex items-center px-6 md:px-10 py-14 md:py-20 bg-[#0a0e27] text-white border-y-2 border-[#7b9fff]">
      <div class="hero-grid absolute inset-0 pointer-events-none"></div>
      <div class="hero-radial absolute inset-0 pointer-events-none"></div>

      <div class="relative z-[2] max-w-[600px]">
        <h1 class="font-heading text-4xl md:text-5xl lg:text-[52px] font-black leading-[1.1] tracking-[-1.5px] mb-4">
          {{ t('storefront.home.heroTitlePre') }}
          <span class="bg-gradient-to-br from-[#3a5fff] to-[#7b9fff] bg-clip-text text-transparent">
            {{ t('storefront.home.heroTitleAccent') }}
          </span>
          {{ t('storefront.home.heroTitlePost') }}
        </h1>
        <p class="text-white/60 text-base leading-[1.7] mb-8 max-w-lg">
          {{ t('storefront.home.heroSubtitle') }}
        </p>

        <div class="flex gap-10">
          <div>
            <div class="font-heading text-2xl md:text-[28px] font-extrabold">
              {{ stats.clubs }}<span class="text-[#3a5fff]">+</span>
            </div>
            <div class="text-[11px] text-white/40 uppercase tracking-[1px] mt-1">
              {{ t('storefront.home.statsClubs') }}
            </div>
          </div>
          <div>
            <div class="font-heading text-2xl md:text-[28px] font-extrabold">
              {{ stats.products }}<span class="text-[#3a5fff]">+</span>
            </div>
            <div class="text-[11px] text-white/40 uppercase tracking-[1px] mt-1">
              {{ t('storefront.home.statsProducts') }}
            </div>
          </div>
          <div>
            <div class="font-heading text-2xl md:text-[28px] font-extrabold">
              {{ stats.sports }}
            </div>
            <div class="text-[11px] text-white/40 uppercase tracking-[1px] mt-1">
              {{ t('storefront.home.statsSports') }}
            </div>
          </div>
        </div>
      </div>

      <HomeHeroCarousel :slides="carousel.sorted" />

    </section>

    <!-- CAROUSEL -->
    <div class="carousel-container px-6 md:px-10 pt-5 pb-5">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-8 h-8 rounded-lg bg-brand-primary text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
          {{ stepHeader.icon }}
        </div>
        <h2 class="font-heading text-xl md:text-[22px] font-bold tracking-[-0.3px]">
          {{ stepHeader.title }}
        </h2>
        <span class="text-xs md:text-[13px] text-gray-500 ml-auto hidden sm:inline">
          {{ stepHeader.hint }}
        </span>
      </div>

      <div
        class="carousel-viewport relative overflow-hidden rounded-[20px] bg-white dark:bg-sidebar-surface border border-gray-200 dark:border-sidebar shadow-card-sm transition-[height] duration-[700ms]"
        :style="{ height: viewportHeight ? viewportHeight + 'px' : 'auto' }"
      >
        <div
          class="carousel-track transition-transform duration-[700ms]"
          :style="{ transform: `translateY(-${trackOffset}px)` }"
        >
          <!-- Slide 0 — Entry choice -->
          <div ref="slideEntryEl" class="carousel-slide px-6 py-6 md:px-8 md:py-8 space-y-6">
            <div
              class="entry-row flex flex-col md:flex-row md:flex-wrap gap-6 items-center md:justify-center md:py-2"
            >
              <button
                type="button"
                class="entry-card entry-card-glow accent-red w-full md:w-[400px] md:shrink-0 max-w-md h-[200px] rounded-[20px] border-2 flex items-center gap-6 px-9 py-8 relative overflow-hidden cursor-pointer"
                @click="pickEntry('catalog')"
              >
                <span class="entry-card-tint" aria-hidden="true"></span>
                <span class="entry-card-shine" aria-hidden="true"></span>
                <span class="entry-sparkle entry-sparkle-a" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5l2.2 8.3L22.5 12l-8.3 2.2L12 22.5l-2.2-8.3L1.5 12l8.3-2.2z"/></svg>
                </span>
                <span class="entry-sparkle entry-sparkle-b" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 8.2L22 12l-8.2 1.8L12 22l-1.8-8.2L2 12l8.2-1.8z"/></svg>
                </span>

                <div class="entry-icon-wrap w-20 h-20 rounded-[20px] bg-brand-secondary/10 flex items-center justify-center flex-shrink-0 overflow-hidden relative z-[1]">
                  <span class="entry-icon-halo" aria-hidden="true"></span>
                  <img src="/catalog-logo.png" alt="" class="w-full h-full object-contain relative z-[2]" />
                </div>

                <div class="text-left relative z-[1]">
                  <div class="entry-card-title font-heading text-xl md:text-[22px] font-extrabold tracking-[-0.3px] mb-1.5">
                    {{ t('storefront.home.entryCatalogTitle') }}
                  </div>
                  <div class="text-sm text-gray-500 leading-[1.5]">
                    {{ t('storefront.home.entryCatalogDesc') }}
                  </div>
                </div>

                <span class="entry-arrow ml-auto relative z-[1]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                class="entry-card entry-card-glow accent-blue w-full md:w-[400px] md:shrink-0 max-w-md h-[200px] rounded-[20px] border-2 flex items-center gap-6 px-9 py-8 relative overflow-hidden cursor-pointer"
                @click="pickEntry('shop')"
              >
                <span class="entry-card-tint" aria-hidden="true"></span>
                <span class="entry-card-shine" aria-hidden="true"></span>
                <span class="entry-sparkle entry-sparkle-a" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5l2.2 8.3L22.5 12l-8.3 2.2L12 22.5l-2.2-8.3L1.5 12l8.3-2.2z"/></svg>
                </span>
                <span class="entry-sparkle entry-sparkle-b" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 8.2L22 12l-8.2 1.8L12 22l-1.8-8.2L2 12l8.2-1.8z"/></svg>
                </span>

                <div class="entry-icon-wrap w-20 h-20 rounded-[20px] bg-brand-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden relative z-[1]">
                  <span class="entry-icon-halo" aria-hidden="true"></span>
                  <img src="/shop-logo.png" alt="" class="w-full h-full object-contain relative z-[2]" />
                </div>

                <div class="text-left relative z-[1]">
                  <div class="entry-card-title font-heading text-xl md:text-[22px] font-extrabold tracking-[-0.3px] mb-1.5">
                    {{ t('storefront.home.entryShopTitle') }}
                  </div>
                  <div class="text-sm text-gray-500 leading-[1.5]">
                    {{ t('storefront.home.entryShopDesc') }}
                  </div>
                </div>

                <span class="entry-arrow ml-auto relative z-[1]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </span>
              </button>

              <!-- Clearance entry card — only when admin toggle on AND clearance products exist. -->
              <button
                v-if="clearanceVisible"
                type="button"
                class="entry-card entry-card-glow accent-red w-full md:w-[400px] md:shrink-0 max-w-md h-[200px] rounded-[20px] border-2 flex items-center gap-6 px-9 py-8 relative overflow-hidden cursor-pointer"
                @click="pickEntry('clearance')"
              >
                <span class="entry-card-tint" aria-hidden="true"></span>
                <span class="entry-card-shine" aria-hidden="true"></span>
                <span class="entry-sparkle entry-sparkle-a" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5l2.2 8.3L22.5 12l-8.3 2.2L12 22.5l-2.2-8.3L1.5 12l8.3-2.2z"/></svg>
                </span>
                <span class="entry-sparkle entry-sparkle-b" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 8.2L22 12l-8.2 1.8L12 22l-1.8-8.2L2 12l8.2-1.8z"/></svg>
                </span>

                <div class="entry-icon-wrap w-20 h-20 rounded-[20px] bg-brand-secondary/10 flex items-center justify-center flex-shrink-0 overflow-hidden relative z-[1]">
                  <span class="entry-icon-halo" aria-hidden="true"></span>
                  <UIcon name="i-lucide-tag" class="w-9 h-9 text-brand-secondary relative z-[2]" />
                </div>

                <div class="text-left relative z-[1] min-w-0">
                  <div class="entry-card-title font-heading text-xl md:text-[22px] font-extrabold tracking-[-0.3px] mb-1.5">
                    {{ t('storefront.home.clearance.title') }}
                  </div>
                  <div class="text-sm text-gray-500 leading-[1.5]">
                    {{ t('storefront.home.clearance.itemsCount', { n: clearanceProducts.length }) }}
                  </div>
                </div>

                <span class="entry-arrow ml-auto relative z-[1]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </span>
              </button>

              <!-- Dynamic admin-managed sections (each opens a panel of URL links). -->
              <button
                v-for="section in homeSections.visible"
                :key="section.id"
                type="button"
                class="entry-card entry-card-glow w-full md:w-[400px] md:shrink-0 max-w-md h-[200px] rounded-[20px] border-2 flex items-center gap-6 px-9 py-8 relative overflow-hidden cursor-pointer text-inherit"
                :style="sectionStyle(section)"
                @click="pickHomeSection(section.id)"
              >
                <span class="entry-card-tint" aria-hidden="true"></span>
                <span class="entry-card-shine" aria-hidden="true"></span>
                <span class="entry-sparkle entry-sparkle-a" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5l2.2 8.3L22.5 12l-8.3 2.2L12 22.5l-2.2-8.3L1.5 12l8.3-2.2z"/></svg>
                </span>
                <span class="entry-sparkle entry-sparkle-b" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 8.2L22 12l-8.2 1.8L12 22l-1.8-8.2L2 12l8.2-1.8z"/></svg>
                </span>

                <div
                  class="entry-icon-wrap w-20 h-20 rounded-[20px] flex items-center justify-center flex-shrink-0 overflow-hidden relative z-[1]"
                  :style="{ background: 'rgba(var(--accent-rgb), 0.10)' }"
                >
                  <span class="entry-icon-halo" aria-hidden="true"></span>
                  <img
                    v-if="homeSectionLogoUrl(section.logo_path)"
                    :src="homeSectionLogoUrl(section.logo_path)!"
                    alt=""
                    class="w-full h-full object-contain relative z-[2]"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-link"
                    class="w-9 h-9 relative z-[2]"
                    :style="{ color: section.accent_color }"
                  />
                </div>

                <div class="text-left relative z-[1] min-w-0">
                  <div class="entry-card-title font-heading text-xl md:text-[22px] font-extrabold tracking-[-0.3px] mb-1.5 truncate">
                    {{ section.name }}
                  </div>
                  <div
                    v-if="section.description"
                    class="text-sm text-gray-500 leading-[1.5] line-clamp-2"
                  >
                    {{ section.description }}
                  </div>
                </div>

                <span class="entry-arrow ml-auto relative z-[1]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-[18px] h-[18px]">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            </div>
          </div>

          <!-- Slide 1 — Sports -->
          <div ref="slideSportsEl" class="carousel-slide px-6 py-3 md:px-8 md:py-4">
            <div class="flex items-center gap-3 mb-4">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-primary dark:text-[#7b9fff] px-3.5 py-1.5 rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 transition"
                @click="goHome"
              >
                ← {{ t('storefront.home.backToHome') }}
              </button>
            </div>
            <div class="flex gap-4 overflow-x-auto pt-3 pb-2 no-scrollbar">
              <button
                v-for="s in sports.sorted"
                :key="s.id"
                type="button"
                class="sport-card group relative flex-[0_0_180px] h-[110px] rounded-[14px] border-2 flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden transition-all select-none"
                :class="
                  selectedSportId === s.id
                    ? 'border-brand-primary dark:border-[#7b9fff] bg-brand-primary text-white shadow-lg'
                    : 'border-gray-200 dark:border-sidebar bg-[#f8f9fc] dark:bg-sidebar-surface hover:border-brand-primary dark:hover:border-[#7b9fff] hover:-translate-y-1'
                "
                @click="pickSport(s)"
              >
                <div v-if="sportIconUrl(s.icon_path)" class="relative z-[1] w-10 h-10 flex items-center justify-center">
                  <img
                    :src="sportIconUrl(s.icon_path)!"
                    class="w-9 h-9 object-contain rounded-lg"
                    :class="selectedSportId === s.id ? 'brightness-0 invert' : ''"
                    :alt="sportName(s)"
                  />
                </div>
                <span class="text-[13px] font-semibold relative z-[1]">{{ sportName(s) }}</span>
              </button>
            </div>
          </div>

          <!-- Slide 2 — Clubs for selected sport -->
          <div ref="slideClubsEl" class="carousel-slide px-6 py-3 md:px-8 md:py-4">
            <div class="flex items-center gap-2 mb-4">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-primary dark:text-[#7b9fff] px-3.5 py-1.5 rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 transition"
                @click="goBackToSports"
              >
                ← {{ t('storefront.home.backToSports') }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-secondary px-3.5 py-1.5 rounded-lg bg-brand-secondary/10 hover:bg-brand-secondary/20 transition"
                @click="goHome"
              >
                ← {{ t('storefront.home.backToHome') }}
              </button>
            </div>
            <div v-if="sportClubs.length" class="flex gap-3.5 overflow-x-auto py-3 no-scrollbar">
              <button
                v-for="c in sportClubs"
                :key="c.id"
                type="button"
                class="club-card flex-[0_0_220px] p-4.5 rounded-[14px] border-2 flex items-center gap-3.5 cursor-pointer transition-all select-none text-left"
                :class="
                  selectedClubId === c.id
                    ? 'border-brand-primary dark:border-[#7b9fff] bg-gradient-to-br from-brand-primary/5 to-brand-primary/[0.02] shadow-md'
                    : 'border-gray-200 dark:border-sidebar bg-[#f8f9fc] dark:bg-sidebar-surface hover:border-brand-primary dark:hover:border-[#7b9fff] hover:-translate-y-1 hover:shadow-md'
                "
                @click="pickClub(c)"
              >
                <div
                  class="w-[46px] h-[46px] rounded-xl flex items-center justify-center text-[22px] flex-shrink-0 overflow-hidden transition"
                  :class="
                    selectedClubId === c.id
                      ? 'bg-gradient-to-br from-brand-primary to-brand-primary-dark text-white'
                      : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface'
                  "
                >
                  <img
                    v-if="clubLogoUrl(c.logo_path)"
                    :src="clubLogoUrl(c.logo_path)!"
                    class="w-full h-full object-cover"
                    :alt="c.name"
                  />
                  <UIcon v-else name="i-lucide-shield" class="w-5 h-5" />
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-semibold text-sm truncate">{{ c.name }}</span>
                  <span class="text-xs text-gray-500">
                    {{ products.items.filter((p) => p.club_id === c.id && p.is_visible).length }}
                    {{ t('storefront.home.productsWord') }}
                  </span>
                </div>
                <span v-if="c.is_password_protected" class="ml-auto text-sm opacity-40">🔒</span>
              </button>
            </div>
            <div v-else class="py-10 text-center text-gray-500 text-sm">
              {{ t('storefront.home.noClubsForSport') }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- CLEARANCE SECTION -->
    <Transition name="panel">
      <section
        v-if="mode === 'clearance'"
        data-home-clearance
        class="px-6 md:px-10 pb-16"
      >
        <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-brand-secondary text-white flex items-center justify-center">
              <UIcon name="i-lucide-tag" class="w-4 h-4" />
            </div>
            <h2 class="font-heading text-xl md:text-[22px] font-bold flex items-center gap-2">
              {{ t('storefront.home.clearance.title') }}
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-secondary text-white animate-pulse">
                {{ t('storefront.home.clearance.badge') }}
              </span>
            </h2>
            <span class="text-xs text-gray-500 hidden sm:inline">
              {{ t('storefront.home.clearance.itemsCount', { n: clearanceProducts.length }) }}
            </span>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-secondary px-3.5 py-1.5 rounded-lg bg-brand-secondary/10 hover:bg-brand-secondary/20 transition"
            @click="goHome"
          >
            ← {{ t('storefront.home.backToHomeCatalog') }}
          </button>
        </div>

        <div
          v-if="!clearanceProducts.length"
          class="py-16 text-center text-gray-500"
        >
          <UIcon name="i-lucide-package" class="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p class="text-sm">{{ t('storefront.home.clearance.empty') }}</p>
        </div>

        <div v-else class="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-7 gap-3">
          <NuxtLink
            v-for="(p, i) in clearanceProducts"
            :key="p.id"
            :to="`/product/${p.id}`"
            class="product-card group bg-white dark:bg-sidebar-surface rounded-2xl overflow-hidden border border-brand-secondary/30 transition-all hover:-translate-y-1.5 hover:shadow-card-lg hover:border-brand-secondary cursor-pointer relative no-underline text-inherit"
            :style="{ animationDelay: `${i * 0.05}s` }"
          >
            <div class="aspect-square relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface flex items-center justify-center p-2">
              <img
                v-if="productImageUrl(p.images[0]?.image_path ?? null)"
                :src="productImageUrl(p.images[0]?.image_path ?? null)!"
                class="w-full h-full object-contain"
                :alt="p.name.fr"
              />
              <UIcon v-else name="i-lucide-image" class="w-12 h-12 text-gray-300 opacity-40" />

              <span
                v-if="p.discount_percent > 0"
                class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-brand-secondary text-white"
              >
                -{{ p.discount_percent }}%
              </span>
            </div>
            <div class="p-2.5">
              <div class="text-[9px] text-gray-400 tracking-[0.5px] uppercase mb-0.5">
                REF: {{ p.reference }}
              </div>
              <div class="font-semibold text-[12px] leading-[1.3] mb-1 line-clamp-2">
                {{ p.name[locale as 'fr' | 'en'] ?? p.name.fr }}
              </div>
              <div class="font-heading font-extrabold text-sm text-brand-secondary">
                {{ fmt(pricingFor(p).unit_price_paid) }}
                <span
                  v-if="p.discount_percent > 0"
                  class="line-through text-[10px] text-gray-400 font-normal ml-1"
                >
                  {{ fmt(Number(p.selling_price)) }}
                </span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </section>
    </Transition>

    <!-- HOME SECTION (admin-managed, multiple URL links) -->
    <Transition name="panel">
      <section
        v-if="mode === 'home-section' && selectedHomeSection"
        data-home-section
        class="px-6 md:px-10 pb-16"
      >
        <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
              :style="{ backgroundColor: selectedHomeSection.accent_color + '1a' }"
            >
              <img
                v-if="homeSectionLogoUrl(selectedHomeSection.logo_path)"
                :src="homeSectionLogoUrl(selectedHomeSection.logo_path)!"
                class="w-full h-full object-cover"
                alt=""
              />
              <UIcon
                v-else
                name="i-lucide-link"
                class="w-5 h-5"
                :style="{ color: selectedHomeSection.accent_color }"
              />
            </div>
            <h2 class="font-heading text-xl md:text-[22px] font-bold truncate">
              {{ selectedHomeSection.name }}
            </h2>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-1.5 rounded-lg transition"
            :style="{
              color: selectedHomeSection.accent_color,
              backgroundColor: selectedHomeSection.accent_color + '1a',
            }"
            @click="goHome"
          >
            ← {{ t('storefront.home.backToHomeCatalog') }}
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <a
            v-for="link in selectedHomeSectionLinks"
            :key="link.id"
            :href="link.url"
            target="_blank"
            rel="noopener"
            class="bg-white dark:bg-sidebar-surface border border-gray-200 dark:border-sidebar rounded-2xl p-7 flex items-center gap-4 no-underline text-inherit transition-all hover:-translate-y-1 hover:shadow-card-lg hover:border-transparent"
          >
            <div class="w-14 h-14 rounded-[14px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface flex items-center justify-center text-[28px] flex-shrink-0 overflow-hidden">
              <img
                v-if="homeSectionLinkLogoUrl(link.logo_path)"
                :src="homeSectionLinkLogoUrl(link.logo_path)!"
                class="w-full h-full object-cover"
                :alt="link.name"
              />
              <UIcon v-else name="i-lucide-link" class="w-7 h-7 text-gray-400" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-base font-heading mb-0.5">
                {{ link.name }}
              </div>
              <div class="text-xs text-gray-400 break-all">{{ link.url }}</div>
            </div>
            <span class="text-xl text-gray-400 flex-shrink-0">↗</span>
          </a>
          <div
            v-if="!selectedHomeSectionLinks.length"
            class="col-span-full py-16 text-center text-gray-500"
          >
            {{ t('storefront.home.homeSection.empty') }}
          </div>
        </div>
      </section>
    </Transition>

    <!-- CATALOG SECTION -->
    <Transition name="panel">
      <section
        v-if="mode === 'catalog'"
        data-home-catalog
        class="px-6 md:px-10 pb-16"
      >
        <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-brand-secondary text-white text-sm font-bold flex items-center justify-center">
              📑
            </div>
            <h2 class="font-heading text-xl md:text-[22px] font-bold">
              {{ t('storefront.home.catalogSectionTitle') }}
            </h2>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-secondary px-3.5 py-1.5 rounded-lg bg-brand-secondary/10 hover:bg-brand-secondary/20 transition"
            @click="goHome"
          >
            ← {{ t('storefront.home.backToHomeCatalog') }}
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <a
            v-for="link in catalog.sorted"
            :key="link.id"
            :href="link.url"
            target="_blank"
            rel="noopener"
            class="bg-white dark:bg-sidebar-surface border border-gray-200 dark:border-sidebar rounded-2xl p-7 flex items-center gap-4 no-underline text-inherit transition-all hover:-translate-y-1 hover:shadow-card-lg hover:border-transparent"
          >
            <div class="w-14 h-14 rounded-[14px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface flex items-center justify-center text-[28px] flex-shrink-0 overflow-hidden">
              <img
                v-if="catalogLogoUrl(link.logo_path)"
                :src="catalogLogoUrl(link.logo_path)!"
                class="w-full h-full object-cover"
                :alt="link.name[locale as 'fr' | 'en'] ?? link.name.fr"
              />
              <UIcon v-else name="i-lucide-book-open" class="w-7 h-7 text-gray-400" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-base font-heading mb-0.5">
                {{ link.name[locale as 'fr' | 'en'] ?? link.name.fr }}
              </div>
              <div class="text-xs text-gray-400 break-all">{{ link.url }}</div>
            </div>
            <span class="text-xl text-gray-400 flex-shrink-0">↗</span>
          </a>
          <div
            v-if="!catalog.sorted.length"
            class="col-span-full py-16 text-center text-gray-500"
          >
            {{ t('storefront.home.noCatalog') }}
          </div>
        </div>
      </section>
    </Transition>

    <!-- PRODUCTS SECTION -->
    <Transition name="panel">
      <section
        v-if="mode === 'products'"
        data-home-products
        class="px-6 md:px-10 pb-16"
      >
        <div class="mb-6 space-y-1">
          <!-- * Accent divider — inverse of the section gradient (color at the ends, fades through the middle) -->
          <div
            v-if="selectedClub?.accent_color"
            class="h-0.5 rounded-full"
            :style="{ background: `linear-gradient(to right, ${selectedClub.accent_color}cc 0%, ${selectedClub.accent_color}77 25%, ${selectedClub.accent_color}33 50%, ${selectedClub.accent_color}77 75%, ${selectedClub.accent_color}cc 100%)` }"
          />
          <div class="relative rounded-2xl overflow-hidden px-5 py-4 flex items-start justify-between flex-wrap gap-3">
            <div
              v-if="selectedClub?.accent_color"
              class="absolute inset-0 pointer-events-none"
              :style="{
                background: `linear-gradient(to right, transparent 0%, ${selectedClub.accent_color}33 25%, ${selectedClub.accent_color}80 50%, ${selectedClub.accent_color}33 75%, transparent 100%)`,
              }"
            />
            <div class="relative">
              <h2 class="font-heading text-xl md:text-[22px] font-bold leading-tight">
                {{ selectedClub?.name ?? '' }}
              </h2>
              <p v-if="selectedClub?.slogan" class="flex items-center gap-2 text-sm italic text-gray-500 mt-1">
                <span
                  v-if="selectedClub?.accent_color"
                  class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  :style="{ background: selectedClub.accent_color }"
                />
                {{ selectedClub.slogan }}
              </p>
            </div>
            <div v-if="productCategories.length" class="relative flex gap-2 flex-wrap">
            <button
              type="button"
              class="px-4 py-1.5 rounded-full border text-[13px] font-medium transition"
              :class="
                activeCategory === null
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white dark:bg-sidebar-surface border-gray-200 dark:border-sidebar text-gray-500 hover:border-brand-primary hover:text-brand-primary'
              "
              @click="activeCategory = null"
            >
              {{ t('storefront.home.filterAll') }}
            </button>
            <button
              v-for="c in productCategories"
              :key="c"
              type="button"
              class="px-4 py-1.5 rounded-full border text-[13px] font-medium transition capitalize"
              :class="
                activeCategory === c
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white dark:bg-sidebar-surface border-gray-200 dark:border-sidebar text-gray-500 hover:border-brand-primary hover:text-brand-primary'
              "
              @click="activeCategory = c"
            >
              {{ c }}
            </button>
          </div>
          </div>
          <!-- * Accent divider — inverse of the section gradient (color at the ends, fades through the middle) -->
          <div
            v-if="selectedClub?.accent_color"
            class="h-0.5 rounded-full"
            :style="{ background: `linear-gradient(to right, ${selectedClub.accent_color}cc 0%, ${selectedClub.accent_color}77 25%, ${selectedClub.accent_color}33 50%, ${selectedClub.accent_color}77 75%, ${selectedClub.accent_color}cc 100%)` }"
          />
        </div>

        <div
          v-if="!filteredProducts.length"
          class="py-16 text-center text-gray-500"
        >
          <UIcon name="i-lucide-package" class="w-12 h-12 mx-auto mb-4 opacity-40" />
          <h3 class="font-heading font-bold text-lg mb-2">{{ t('storefront.home.noProducts') }}</h3>
          <p class="text-sm">{{ t('storefront.home.noProductsHint') }}</p>
        </div>

        <div v-else class="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-7 gap-3">
          <NuxtLink
            v-for="(p, i) in filteredProducts"
            :key="p.id"
            :to="`/product/${p.id}`"
            class="product-card group bg-white dark:bg-sidebar-surface rounded-2xl overflow-hidden border border-gray-200 dark:border-sidebar transition-all hover:-translate-y-1.5 hover:shadow-card-lg hover:border-transparent cursor-pointer relative no-underline text-inherit"
            :style="{ animationDelay: `${i * 0.05}s` }"
          >
            <div class="aspect-square relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface flex items-center justify-center p-2">
              <img
                v-if="productImageUrl(p.images[0]?.image_path ?? null)"
                :src="productImageUrl(p.images[0]?.image_path ?? null)!"
                class="w-full h-full object-contain"
                :alt="p.name.fr"
              />
              <UIcon v-else name="i-lucide-image" class="w-12 h-12 text-gray-300 opacity-40" />

              <!-- Badges -->
              <span
                v-if="p.discount_percent > 0"
                class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-brand-secondary text-white"
              >
                -{{ p.discount_percent }}%
              </span>
              <span
                v-else-if="p.flocking_kind !== 'none'"
                class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-brand-green text-white"
              >
                {{ t('storefront.home.badgeFlocking') }}
              </span>
              <span
                v-else-if="p.is_pack"
                class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-brand-purple text-white"
              >
                {{ t('storefront.home.badgePack') }}
              </span>

              <!-- Quick add marker -->
              <span
                class="product-quick-add absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-brand-primary text-white flex items-center justify-center text-sm shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all"
              >
                +
              </span>

              <!-- * Accent bottom border — expands from center on hover -->
              <div
                class="absolute bottom-0 left-0 right-0 h-0.5 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-center"
                :style="{ backgroundColor: accentCss }"
              />
            </div>
            <div class="p-2.5">
              <div class="text-[9px] text-gray-400 tracking-[0.5px] uppercase mb-0.5">
                REF: {{ p.reference }}
              </div>
              <div class="font-semibold text-[12px] leading-[1.3] mb-1 line-clamp-2">
                {{ p.name[locale as 'fr' | 'en'] ?? p.name.fr }}
              </div>
              <div v-if="p.category" class="text-[10px] text-gray-500 mb-1.5 capitalize">
                {{ p.category }}
              </div>
              <div class="flex items-center justify-between gap-1 flex-wrap">
                <div class="font-heading font-extrabold text-sm">
                  {{ fmt(pricingFor(p).unit_price_paid) }}
                  <span
                    v-if="p.discount_percent > 0"
                    class="line-through text-[10px] text-gray-400 font-normal ml-1"
                  >
                    {{ fmt(Number(p.selling_price)) }}
                  </span>
                </div>
                <div class="flex gap-0.5 flex-wrap">
                  <span
                    v-for="s in productSizes(p)"
                    :key="s"
                    class="w-4 h-4 rounded border border-gray-200 dark:border-sidebar flex items-center justify-center text-[8px] font-semibold text-gray-500"
                  >
                    {{ s }}
                  </span>
                </div>
              </div>
            </div>
          </NuxtLink>
        </div>
      </section>
    </Transition>

    <HomeClubPasswordModal
      v-model="pwOpen"
      :club="pendingClub"
      @unlocked="onPwUnlocked"
      @cancel="pendingClub = null"
    />
  </div>
</template>

<style scoped>
/* * Hero grid + radial highlights */
.hero-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
}
.hero-radial {
  background:
    radial-gradient(ellipse 600px 400px at 20% 50%, rgba(3, 49, 249, 0.25), transparent),
    radial-gradient(ellipse 400px 300px at 80% 30%, rgba(227, 11, 12, 0.15), transparent);
}

/* * Panel-enter transition for catalog / products sections */
.panel-enter-active {
  transition: opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1),
              transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.panel-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.panel-enter-from {
  opacity: 0;
  transform: translateY(-40px);
}
.panel-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.no-scrollbar {
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

/* * Product card fade-in on render */
.product-card {
  animation: cardIn 0.5s ease-out both;
}
@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* * Accent ring on hover — uses club colour via CSS v-bind.
 * Includes card-lg shadow values so Tailwind's hover:shadow-card-lg isn't lost. */
.product-card:hover {
  box-shadow:
    0 0 0 2px v-bind(accentCss),
    0 12px 24px rgba(0, 0, 0, 0.08),
    0 4px 8px rgba(0, 0, 0, 0.06);
}

/* * Entry-choice cards — glow up.
 * Per-card accent driven by --accent / --accent-rgb set by .accent-red / .accent-blue. */
.entry-card-glow {
  --accent: var(--color-brand-primary);
  --accent-rgb: 3, 49, 249;
  isolation: isolate;
  /* * Resting state: brand-tinted gradient bg, brand-tinted border, ambient colored shadow. */
  background:
    linear-gradient(135deg, #ffffff 0%, rgba(var(--accent-rgb), 0.04) 100%);
  border-color: rgba(var(--accent-rgb), 0.22);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 8px 20px -8px rgba(var(--accent-rgb), 0.20),
    inset 0 0 0 1px rgba(var(--accent-rgb), 0.04);
  transition:
    transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.4s ease,
    background 0.5s ease;
  will-change: transform;
}
:where(.dark) .entry-card-glow {
  background:
    linear-gradient(135deg, var(--color-sidebar) 0%, rgba(var(--accent-rgb), 0.10) 100%);
  border-color: rgba(var(--accent-rgb), 0.32);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.2),
    0 10px 24px -8px rgba(var(--accent-rgb), 0.30),
    inset 0 0 0 1px rgba(var(--accent-rgb), 0.06);
}
.entry-card-glow.accent-red {
  --accent: var(--color-brand-secondary);
  --accent-rgb: 227, 11, 12;
}
.entry-card-glow.accent-blue {
  --accent: var(--color-brand-primary);
  --accent-rgb: 3, 49, 249;
}
/* * Dark mode: brand-primary (#0331f9) is too dark on the dark surface — every
 * border/text/glow that derives from --accent / --accent-rgb shifts to the
 * lighter brand blue (#7b9fff) used elsewhere in the carousel. */
:where(.dark) .entry-card-glow.accent-blue {
  --accent: #7b9fff;
  --accent-rgb: 123, 159, 255;
}
/* * Same treatment for brand-secondary red (#e30b0c) — lifts to a brighter red
 * so border, gradient title and glow stay legible against the dark surface. */
:where(.dark) .entry-card-glow.accent-red {
  --accent: #ff5b5c;
  --accent-rgb: 255, 91, 92;
}

/* * Soft radial tint — visible at rest (ambient color), intensifies on hover. */
.entry-card-tint {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(circle at 85% 50%, rgba(var(--accent-rgb), 0.10), transparent 55%),
    radial-gradient(circle at 15% 120%, rgba(var(--accent-rgb), 0.06), transparent 50%);
  opacity: 0.55;
  transition: opacity 0.5s ease;
  pointer-events: none;
  z-index: 0;
}
.entry-card-glow:hover .entry-card-tint {
  opacity: 1;
}

/* * Decorative sparkles — top-right ambient, slow drift + twinkle. */
.entry-sparkle {
  position: absolute;
  pointer-events: none;
  z-index: 1;
  color: var(--accent);
}
.entry-sparkle svg {
  width: 100%;
  height: 100%;
  display: block;
  filter: drop-shadow(0 0 6px rgba(var(--accent-rgb), 0.55));
}
.entry-sparkle-a {
  top: 14px;
  right: 18px;
  width: 18px;
  height: 18px;
  opacity: 0.55;
  animation: entrySparkleA 3.6s ease-in-out infinite;
}
.entry-sparkle-b {
  top: 38px;
  right: 44px;
  width: 10px;
  height: 10px;
  opacity: 0.4;
  animation: entrySparkleB 4.8s ease-in-out infinite;
  animation-delay: -1.2s;
}
.entry-card-glow:hover .entry-sparkle-a { opacity: 0.95; }
.entry-card-glow:hover .entry-sparkle-b { opacity: 0.75; }
@keyframes entrySparkleA {
  0%, 100% { transform: scale(1) rotate(0deg);   opacity: 0.55; }
  50%      { transform: scale(1.25) rotate(45deg); opacity: 0.85; }
}
@keyframes entrySparkleB {
  0%, 100% { transform: scale(0.85) rotate(0deg);  opacity: 0.30; }
  50%      { transform: scale(1.1)  rotate(-30deg); opacity: 0.65; }
}

/* * Diagonal shine that sweeps across once on hover. */
.entry-card-shine {
  position: absolute;
  top: 0;
  left: 0;
  width: 60%;
  height: 100%;
  background: linear-gradient(
    115deg,
    transparent 0%,
    rgba(255, 255, 255, 0) 30%,
    rgba(255, 255, 255, 0.55) 50%,
    rgba(255, 255, 255, 0) 70%,
    transparent 100%
  );
  transform: translateX(-120%) skewX(-12deg);
  transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
  z-index: 3;
  mix-blend-mode: overlay;
}
.entry-card-glow:hover .entry-card-shine {
  transform: translateX(220%) skewX(-12deg);
}

/* * Card lift + colored glow halo on hover. */
.entry-card-glow:hover {
  transform: translateY(-8px) scale(1.015);
  border-color: var(--accent);
  box-shadow:
    0 0 0 1px rgba(var(--accent-rgb), 0.35),
    0 22px 48px -16px rgba(var(--accent-rgb), 0.45),
    0 10px 20px -8px rgba(var(--accent-rgb), 0.25),
    0 2px 4px rgba(0, 0, 0, 0.04);
}
.entry-card-glow:active {
  transform: translateY(-4px) scale(1.005);
  transition-duration: 0.15s;
}

/* * Title — brand-color gradient text at rest, deeper colored shadow on hover. */
.entry-card-title {
  background-image: linear-gradient(
    135deg,
    var(--accent) 0%,
    color-mix(in srgb, var(--accent) 65%, #000) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  text-shadow: 0 2px 10px rgba(var(--accent-rgb), 0.18);
  transition: text-shadow 0.4s ease, transform 0.4s ease;
}
/* * Fallback for older Safari/iOS where text-shadow + transparent fill conflict. */
@supports not (background-clip: text) {
  .entry-card-title {
    color: var(--accent);
    -webkit-text-fill-color: var(--accent);
  }
}
.entry-card-glow:hover .entry-card-title {
  text-shadow: 0 6px 22px rgba(var(--accent-rgb), 0.45);
}

/* * Icon wrapper — gentle rotate-bounce + halo that breathes ambient at rest. */
.entry-icon-wrap {
  transition: transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.entry-card-glow:hover .entry-icon-wrap {
  transform: scale(1.08) rotate(-5deg);
}
.entry-icon-halo {
  position: absolute;
  inset: -30%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--accent-rgb), 0.55), transparent 65%);
  opacity: 0.32;
  transform: scale(0.85);
  transition: opacity 0.5s ease, transform 0.5s ease;
  pointer-events: none;
  z-index: 1;
  filter: blur(8px);
  animation: entryHaloAmbient 4.2s ease-in-out infinite;
}
.entry-card-glow:hover .entry-icon-halo {
  opacity: 1;
  transform: scale(1.1);
  animation: entryHaloPulse 2.4s ease-in-out 0.4s infinite;
}
@keyframes entryHaloAmbient {
  0%, 100% { transform: scale(0.85); opacity: 0.28; }
  50%      { transform: scale(1.0);  opacity: 0.45; }
}
@keyframes entryHaloPulse {
  0%, 100% { transform: scale(1.1); opacity: 0.85; }
  50%      { transform: scale(1.35); opacity: 1; }
}

/* * Arrow — brand-tinted pill at rest, expands into solid accent on hover. */
.entry-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.10);
  color: var(--accent);
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.18);
  transition:
    width 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.35s ease,
    color 0.35s ease,
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.45s ease;
}
:where(.dark) .entry-arrow {
  background: rgba(var(--accent-rgb), 0.18);
}
.entry-card-glow:hover .entry-arrow {
  width: 60px;
  background: var(--accent);
  color: #fff;
  transform: translateX(4px);
  box-shadow:
    0 8px 22px -4px rgba(var(--accent-rgb), 0.55),
    0 2px 6px rgba(var(--accent-rgb), 0.3);
}
.entry-card-glow:hover .entry-arrow svg {
  animation: entryArrowNudge 0.9s ease-in-out 0.15s infinite;
}
@keyframes entryArrowNudge {
  0%, 100% { transform: translateX(0); }
  50%      { transform: translateX(3px); }
}

@media (prefers-reduced-motion: reduce) {
  .entry-card-glow,
  .entry-card-glow:hover,
  .entry-icon-wrap,
  .entry-card-glow:hover .entry-icon-wrap,
  .entry-arrow,
  .entry-card-glow:hover .entry-arrow,
  .entry-card-shine,
  .entry-card-tint,
  .entry-icon-halo,
  .entry-card-glow:hover .entry-icon-halo,
  .entry-sparkle-a,
  .entry-sparkle-b {
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }
}
</style>
