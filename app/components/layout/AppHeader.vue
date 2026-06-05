<script setup lang="ts">
import { useCartStore } from '~/stores/cart'
import { useSiteSettingsStore } from '~/stores/siteSettings'

const { t, locale, setLocale } = useI18n()
const cart = useCartStore()
const colorMode = useColorMode()

// * Top promo banner — admin-customizable (Personalization → Banner). The store
// * is a singleton; fetch once if the page that mounted us didn't already.
const siteSettings = useSiteSettingsStore()
onMounted(() => {
  if (!siteSettings.settings) siteSettings.fetchAll()
})
const bannerText = computed(() => siteSettings.promoBannerText || t('storefront.home.topbarPromo'))
const bannerUrl = computed(() => siteSettings.promoBannerUrl || '/?step=catalog')

const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)

function resetHome() {
  mobileOpen.value = false
  router.push({ path: '/', query: { step: 'home' } })
}
const cartOpen = useState('customer:cart-open', () => false)

function toggleDark() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
function swapLocale() {
  setLocale(locale.value === 'fr' ? 'en' : 'fr')
}
function openCart() {
  cartOpen.value = true
}

// * Category tabs — mirror the mockup's second nav row. Each drives the live
// * home flow via the existing `?step=` / route handlers.
const cats = computed(() => [
  { key: 'home', label: t('nav.home'), to: { path: '/', query: { step: 'home' } } },
  { key: 'catalog', label: t('nav.catalog'), to: { path: '/', query: { step: 'catalog' } } },
  { key: 'shop', label: t('nav.shop'), to: { path: '/', query: { step: 'shop' } } },
  { key: 'contact', label: t('nav.contact'), to: { path: '/contact' } },
])

// * Which storefront tab is active. The home page strips its `?step` query
// * after handling it, so we track the active section in shared state that the
// * home flow (useHomeFlow) updates as the visitor moves around.
const activeNav = useState<string>('storefront:active-nav', () => 'home')

function isActive(key: string) {
  if (route.path === '/contact') return key === 'contact'
  if (route.path === '/') return activeNav.value === key
  return false
}
</script>

<template>
  <header class="sticky top-0 z-30">
    <!-- Topbar promo — admin-customizable text + link (Personalization → Banner) -->
    <div
      v-if="siteSettings.promoBannerActive"
      class="bg-ink text-white/85 text-[12px] text-center py-2 px-4 tracking-[0.04em]"
    >
      {{ bannerText }} →
      <NuxtLink :to="bannerUrl" class="text-white font-bold underline">
        {{ t('storefront.home.topbarPromoLink') }}
      </NuxtLink>
    </div>

    <!-- Nav level 1 — logo / search / controls -->
    <div class="bg-white dark:bg-sidebar border-b border-gray-100 dark:border-sidebar-surface">
      <div class="max-w-7xl mx-auto px-3 sm:px-6 h-[68px] flex items-center gap-4 sm:gap-6">
        <NuxtLink to="/" class="shrink-0 flex items-center" :aria-label="t('app.name')" @click.prevent="resetHome">
          <img src="/logo_horizontal.svg" :alt="t('app.name')" class="h-9 sm:h-10 w-auto block dark:hidden">
          <img src="/logo_horizontal.svg" :alt="t('app.name')" class="h-9 sm:h-10 w-auto hidden dark:block dark:brightness-0 dark:invert">
        </NuxtLink>

        <!-- Product search — sport selector + paginated results -->
        <LayoutAppSearch />

        <div class="flex items-center gap-1.5 sm:gap-2 ml-auto md:ml-0 shrink-0">
          <button
            type="button"
            class="h-[38px] px-2.5 rounded-lg border border-gray-200 dark:border-sidebar-surface hover:bg-gray-50 dark:hover:bg-sidebar-surface text-sm font-semibold text-gray-600 dark:text-gray-300"
            :aria-label="t('nav.language')"
            @click="swapLocale"
          >
            {{ locale.toUpperCase() }}
          </button>
          <button
            type="button"
            class="w-[38px] h-[38px] rounded-lg border border-gray-200 dark:border-sidebar-surface hover:bg-gray-50 dark:hover:bg-sidebar-surface flex items-center justify-center text-gray-600 dark:text-gray-300"
            :aria-label="t('nav.toggleDark')"
            @click="toggleDark"
          >
            <ClientOnly>
              <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-[19px] h-[19px]" />
              <template #fallback>
                <UIcon name="i-lucide-moon" class="w-[19px] h-[19px]" />
              </template>
            </ClientOnly>
          </button>
          <button
            type="button"
            class="relative w-[38px] h-[38px] rounded-lg border border-gray-200 dark:border-sidebar-surface hover:bg-gray-50 dark:hover:bg-sidebar-surface flex items-center justify-center text-gray-600 dark:text-gray-300"
            :aria-label="t('cart.open')"
            @click="openCart"
          >
            <UIcon name="i-lucide-shopping-cart" class="w-[19px] h-[19px]" />
            <ClientOnly>
              <span
                v-if="cart.count > 0"
                class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-accent text-white text-[10px] font-bold"
              >
                {{ cart.count }}
              </span>
            </ClientOnly>
          </button>
          <button
            type="button"
            class="lg:hidden w-[38px] h-[38px] rounded-lg border border-gray-200 dark:border-sidebar-surface flex items-center justify-center text-gray-600 dark:text-gray-300"
            :aria-label="t('nav.menu')"
            @click="mobileOpen = !mobileOpen"
          >
            <UIcon :name="mobileOpen ? 'i-lucide-x' : 'i-lucide-menu'" class="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Nav level 2 — category tabs with red underline -->
    <nav class="hidden lg:flex bg-white dark:bg-sidebar border-b-2 border-accent items-center justify-center px-6">
      <NuxtLink
        v-for="c in cats"
        :key="c.key"
        :to="c.to"
        class="block text-sm font-semibold px-7 py-3.5 border-b-[3px] -mb-0.5 whitespace-nowrap transition-colors hover:text-accent"
        :class="isActive(c.key) ? '!text-accent border-accent font-bold' : 'text-ink dark:text-gray-200 border-transparent'"
        @click="c.key === 'home' ? resetHome() : null"
      >
        {{ c.label }}
      </NuxtLink>
    </nav>

    <!-- Mobile menu -->
    <div v-if="mobileOpen" class="lg:hidden bg-white dark:bg-sidebar border-b border-gray-100 dark:border-sidebar-surface px-4 py-3 space-y-1 text-sm">
      <NuxtLink
        v-for="c in cats"
        :key="c.key"
        :to="c.to"
        class="block py-2 font-semibold hover:text-accent"
        :class="isActive(c.key) ? '!text-accent font-bold' : 'text-ink dark:text-gray-200'"
        @click="c.key === 'home' ? resetHome() : (mobileOpen = false)"
      >
        {{ c.label }}
      </NuxtLink>
    </div>
  </header>
</template>
