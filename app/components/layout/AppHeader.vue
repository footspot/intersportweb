<script setup lang="ts">
import { useCartStore } from '~/stores/cart'
import { useSiteSettingsStore } from '~/stores/siteSettings'

const { t, locale, setLocale } = useI18n()
const cart = useCartStore()
const colorMode = useColorMode()

// * Top promo ticker — the FIRST item's text is admin-customizable
// * (Personalization → Banner); the other two are static brand promises.
const siteSettings = useSiteSettingsStore()
onMounted(() => {
  if (!siteSettings.settings) siteSettings.fetchAll()
})
const bannerText = computed(() => siteSettings.promoBannerText || t('storefront.home.topbarPromo'))

const tickerItems = computed(() => [
  { icon: 'i-lucide-badge-percent', text: bannerText.value },
  { icon: 'i-lucide-shirt', text: t('storefront.home.tickerFlocking') },
  { icon: 'i-lucide-shield-check', text: t('storefront.home.tickerOfficial') },
])

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

// * Scrolled state — drop shadow + tighter padding once the page moves.
const scrolled = ref(false)
function onScroll() {
  scrolled.value = window.scrollY > 10
}
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

// * Category tabs — each drives the live home flow via `?step=` / route handlers.
const cats = computed(() => [
  { key: 'home', label: t('nav.home'), to: { path: '/', query: { step: 'home' } } },
  { key: 'catalog', label: t('nav.catalog'), to: { path: '/', query: { step: 'catalog' } } },
  { key: 'shop', label: t('nav.shop'), to: { path: '/', query: { step: 'shop' } } },
  { key: 'contact', label: t('nav.contact'), to: { path: '/contact' } },
])

// * Which storefront tab is active (the home page strips its `?step` query after
// * handling it, so the active section is tracked in shared state).
const activeNav = useState<string>('storefront:active-nav', () => 'home')

function isActive(key: string) {
  if (route.path === '/contact') return key === 'contact'
  if (route.path === '/') return activeNav.value === key
  return false
}
</script>

<template>
  <header class="sticky top-0 z-30">
    <!-- Topbar ticker — item 1 admin-customizable, items 2-3 static -->
    <div class="ticker bg-ink text-white">
      <div class="ticker-track">
        <template v-for="rep in 2" :key="rep">
          <template v-for="(item, i) in tickerItems" :key="`${rep}-${i}`">
            <span class="ticker-item">
              <UIcon :name="item.icon" class="w-3.5 h-3.5 text-accent shrink-0" />
              {{ item.text }}
            </span>
            <span class="ticker-dot"></span>
          </template>
        </template>
      </div>
    </div>

    <!-- Nav — single row: logo / search / links / controls -->
    <div
      class="nav-bar border-b border-black/5 dark:border-sidebar-surface backdrop-blur-md bg-page/85 dark:bg-sidebar/85 transition-shadow"
      :class="{ 'shadow-[0_8px_30px_rgba(14,42,96,0.10)]': scrolled }"
    >
      <div
        class="max-w-7xl mx-auto px-3 sm:px-6 flex items-center gap-3 sm:gap-6 transition-[padding]"
        :class="scrolled ? 'h-[44px]' : 'h-[51px]'"
      >
        <NuxtLink to="/" class="shrink-0 flex items-center" :aria-label="t('app.name')" @click.prevent="resetHome">
          <img src="/logo_horizontal.svg" :alt="t('app.name')" class="h-[25px] sm:h-[30px] w-auto block dark:hidden">
          <img src="/logo_horizontal.svg" :alt="t('app.name')" class="h-[25px] sm:h-[30px] w-auto hidden dark:block dark:brightness-0 dark:invert">
        </NuxtLink>

        <!-- Product search — sport selector + paginated results -->
        <LayoutAppSearch />

        <!-- Category links with animated red underline -->
        <nav class="hidden lg:flex items-center gap-0.5 ml-auto">
          <NuxtLink
            v-for="c in cats"
            :key="c.key"
            :to="c.to"
            class="nav-link"
            :class="{ active: isActive(c.key) }"
            @click="c.key === 'home' ? resetHome() : null"
          >
            {{ c.label }}
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-1.5 sm:gap-2 ml-auto lg:ml-0 shrink-0">
          <button
            type="button"
            class="ic-btn px-2.5 text-sm font-semibold"
            :aria-label="t('nav.language')"
            @click="swapLocale"
          >
            {{ locale.toUpperCase() }}
          </button>
          <button
            type="button"
            class="ic-btn w-[41px]"
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
            class="ic-btn w-[41px] relative"
            :aria-label="t('cart.open')"
            @click="openCart"
          >
            <UIcon name="i-lucide-shopping-cart" class="w-[19px] h-[19px]" />
            <ClientOnly>
              <span
                v-if="cart.count > 0"
                class="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold"
              >
                {{ cart.count }}
              </span>
            </ClientOnly>
          </button>
          <button
            type="button"
            class="ic-btn w-[41px] lg:hidden"
            :aria-label="t('nav.menu')"
            @click="mobileOpen = !mobileOpen"
          >
            <UIcon :name="mobileOpen ? 'i-lucide-x' : 'i-lucide-menu'" class="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile menu -->
    <div v-if="mobileOpen" class="lg:hidden bg-page dark:bg-sidebar border-b border-black/5 dark:border-sidebar-surface px-4 py-3 space-y-1 text-sm">
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

<style scoped>
/* * Ticker — infinite horizontal marquee, paused on hover. */
.ticker {
  overflow: hidden;
  font-size: 12px;
  padding: 8px 0;
}
.ticker-track {
  display: flex;
  width: max-content;
  white-space: nowrap;
  animation: ticker-marq 28s linear infinite;
}
.ticker:hover .ticker-track {
  animation-play-state: paused;
}
.ticker-item {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 0 26px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}
.ticker-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
  align-self: center;
  flex-shrink: 0;
}
@keyframes ticker-marq {
  to {
    transform: translateX(-50%);
  }
}

/* * Nav links — animated red underline on hover/active. */
.nav-link {
  position: relative;
  font-weight: 700;
  font-size: 14px;
  padding: 9px 15px;
  border-radius: 9px;
  color: var(--color-ink);
  transition: color 0.18s;
  white-space: nowrap;
}
:global(.dark) .nav-link {
  color: #e5e7eb;
}
.nav-link::after {
  content: '';
  position: absolute;
  left: 15px;
  right: 15px;
  bottom: 4px;
  height: 2px;
  background: var(--color-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.22s;
}
.nav-link:hover::after,
.nav-link.active::after {
  transform: scaleX(1);
}
.nav-link:hover,
.nav-link.active {
  color: var(--color-accent);
}

/* * Icon buttons — bordered, lift on hover. */
.ic-btn {
  height: 41px;
  border-radius: 10px;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  transition: transform 0.14s, border-color 0.15s, background 0.15s;
}
.ic-btn:hover {
  transform: translateY(-2px);
  border-color: var(--color-ink);
}
:global(.dark) .ic-btn {
  background: var(--color-sidebar-surface);
  border-color: var(--color-sidebar-surface);
  color: #cbd5e1;
}
@media (prefers-reduced-motion: reduce) {
  .ticker-track {
    animation: none;
  }
}
</style>
