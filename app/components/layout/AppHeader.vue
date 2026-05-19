<script setup lang="ts">
import { useCartStore } from '~/stores/cart'

const { t, locale, setLocale } = useI18n()
const cart = useCartStore()
const colorMode = useColorMode()

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
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-gray-200 dark:border-sidebar-surface bg-white/90 dark:bg-sidebar/90 backdrop-blur">
    <div class="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
      <NuxtLink to="/" class="shrink-0 flex items-center" :aria-label="t('app.name')" @click.prevent="resetHome">
        <img
          src="/logo_compose.svg"
          :alt="t('app.name')"
          class="h-9 sm:h-10 w-auto block dark:hidden"
        >
        <img
          src="/logo_compose_noir.svg"
          :alt="t('app.name')"
          class="h-9 sm:h-10 w-auto hidden dark:block dark:invert"
        >
      </NuxtLink>

      <!-- * Centered nav — flex-based, only on lg+ so it never collides with right controls. -->
      <nav class="hidden lg:flex flex-1 justify-center items-center gap-2 min-w-0">
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-secondary/30 dark:border-[#ff5b5c]/55 bg-brand-secondary/8 dark:bg-[#ff5b5c]/15 text-brand-secondary dark:text-[#ff7b7c] text-sm font-semibold hover:bg-brand-primary hover:text-white hover:border-brand-primary dark:hover:bg-brand-primary dark:hover:text-white dark:hover:border-brand-primary transition-all duration-200"
          active-class="!bg-brand-primary !text-white !border-brand-primary shadow-md"
          @click.prevent="resetHome"
        >
          <UIcon name="i-lucide-store" class="w-4 h-4" />
          {{ t('nav.home') }}
        </NuxtLink>
        <NuxtLink
          to="/?step=catalog"
          class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-secondary/30 dark:border-[#ff5b5c]/55 bg-brand-secondary/8 dark:bg-[#ff5b5c]/15 text-brand-secondary dark:text-[#ff7b7c] text-sm font-semibold hover:bg-brand-primary hover:text-white hover:border-brand-primary dark:hover:bg-brand-primary dark:hover:text-white dark:hover:border-brand-primary transition-all duration-200"
        >
          <UIcon name="i-lucide-book-open" class="w-4 h-4" />
          {{ t('nav.catalog') }}
        </NuxtLink>
        <NuxtLink
          to="/?step=shop"
          class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-secondary/30 dark:border-[#ff5b5c]/55 bg-brand-secondary/8 dark:bg-[#ff5b5c]/15 text-brand-secondary dark:text-[#ff7b7c] text-sm font-semibold hover:bg-brand-primary hover:text-white hover:border-brand-primary dark:hover:bg-brand-primary dark:hover:text-white dark:hover:border-brand-primary transition-all duration-200"
        >
          <UIcon name="i-lucide-shopping-bag" class="w-4 h-4" />
          {{ t('nav.shop') }}
        </NuxtLink>
        <NuxtLink
          to="/contact"
          class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-secondary/30 dark:border-[#ff5b5c]/55 bg-brand-secondary/8 dark:bg-[#ff5b5c]/15 text-brand-secondary dark:text-[#ff7b7c] text-sm font-semibold hover:bg-brand-primary hover:text-white hover:border-brand-primary dark:hover:bg-brand-primary dark:hover:text-white dark:hover:border-brand-primary transition-all duration-200"
          active-class="!bg-brand-primary !text-white !border-brand-primary shadow-md"
        >
          <UIcon name="i-lucide-users" class="w-4 h-4" />
          {{ t('nav.contact') }}
        </NuxtLink>
      </nav>

      <div class="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar-surface text-sm font-medium"
          :aria-label="t('nav.language')"
          @click="swapLocale"
        >
          {{ locale.toUpperCase() }}
        </button>
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar-surface"
          :aria-label="t('nav.toggleDark')"
          @click="toggleDark"
        >
          <ClientOnly>
            <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
            <template #fallback>
              <UIcon name="i-lucide-moon" class="w-5 h-5" />
            </template>
          </ClientOnly>
        </button>

        <button
          type="button"
          class="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar-surface"
          :aria-label="t('cart.open')"
          @click="openCart"
        >
          <UIcon name="i-lucide-shopping-bag" class="w-5 h-5" />
          <ClientOnly>
            <span
              v-if="cart.count > 0"
              class="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-brand-primary text-white text-[10px] font-bold"
            >
              {{ cart.count }}
            </span>
          </ClientOnly>
        </button>

        <button
          type="button"
          class="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar-surface"
          :aria-label="t('nav.menu')"
          @click="mobileOpen = !mobileOpen"
        >
          <UIcon :name="mobileOpen ? 'i-lucide-x' : 'i-lucide-menu'" class="w-5 h-5" />
        </button>
      </div>
    </div>


    <!-- Mobile menu -->
    <div v-if="mobileOpen" class="lg:hidden border-t border-gray-100 dark:border-sidebar-surface px-4 py-3 space-y-2 text-sm">
      <NuxtLink to="/" class="block py-1 hover:text-brand-primary" @click.prevent="resetHome">{{ t('nav.home') }}</NuxtLink>
      <NuxtLink
        to="/?step=catalog"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-secondary/30 dark:border-[#ff5b5c]/55 bg-brand-secondary/8 dark:bg-[#ff5b5c]/15 text-brand-secondary dark:text-[#ff7b7c] text-xs font-semibold hover:bg-brand-primary hover:text-white hover:border-brand-primary"
        @click="mobileOpen = false"
      >
        <UIcon name="i-lucide-book-open" class="w-4 h-4" />
        {{ t('nav.catalog') }}
      </NuxtLink>
      <NuxtLink
        to="/?step=shop"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-secondary/30 dark:border-[#ff5b5c]/55 bg-brand-secondary/8 dark:bg-[#ff5b5c]/15 text-brand-secondary dark:text-[#ff7b7c] text-xs font-semibold ml-2 hover:bg-brand-primary hover:text-white hover:border-brand-primary"
        @click="mobileOpen = false"
      >
        <UIcon name="i-lucide-shopping-bag" class="w-4 h-4" />
        {{ t('nav.shop') }}
      </NuxtLink>
      <NuxtLink
        to="/contact"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-secondary/30 dark:border-[#ff5b5c]/55 bg-brand-secondary/8 dark:bg-[#ff5b5c]/15 text-brand-secondary dark:text-[#ff7b7c] text-xs font-semibold ml-2 hover:bg-brand-primary hover:text-white hover:border-brand-primary"
        active-class="!bg-brand-primary !text-white !border-brand-primary"
        @click="mobileOpen = false"
      >
        <UIcon name="i-lucide-users" class="w-4 h-4" />
        {{ t('nav.contact') }}
      </NuxtLink>
    </div>
  </header>
</template>
