<script setup lang="ts">
// * Header product search — sport selector + text input + paginated results.
// * Desktop: inline bar with a dropdown. Mobile: a search icon in the header
// * toggles a fixed bottom bar (shared `mobileOpen` state) with results above it.
// * Results come from the public `search-products` edge function, which excludes
// * restricted-club products server-side.
import { onClickOutside } from '@vueuse/core'
import { useSportsStore, type Sport } from '~/stores/sports'
import { useProductSearch } from '~/composables/useProductSearch'

const { t, locale } = useI18n()
const sports = useSportsStore()
const search = useProductSearch()

const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (search.open.value = false))

// * Mobile fixed-bottom search — toggled by the header's search icon button.
const mobileOpen = useState('storefront:mobile-search-open', () => false)
const mobileInput = ref<HTMLInputElement | null>(null)
const route = useRoute()

function closeMobile() {
  mobileOpen.value = false
}

// * Focus the input when the mobile bar opens; close it on navigation.
watch(mobileOpen, (open) => {
  if (open) {
    search.open.value = true
    nextTick(() => mobileInput.value?.focus())
  }
})
watch(() => route.fullPath, closeMobile)

// * Defer the sport <option> list until after mount. The store can be populated
// * inconsistently between SSR and client hydration, which makes the <select>
// * child count diverge and throws a hydration mismatch. Rendering only the
// * "All sports" option during SSR + initial hydration keeps both sides identical.
const mounted = ref(false)

onMounted(() => {
  mounted.value = true
  // * Header is global; sports may not be loaded on non-home routes.
  if (!sports.items.length) sports.fetchAll()
})

function sportName(s: Sport) {
  return s.name[locale.value as 'fr' | 'en'] ?? s.name.fr
}

const showDropdown = computed(() => search.open.value && search.query.value.trim().length >= 2)
</script>

<template>
  <div ref="root" class="relative hidden md:block flex-1">
    <div class="flex items-center gap-1.5 bg-[#f2f2f2] dark:bg-sidebar-surface rounded-xl p-0.5 ring-1 ring-transparent focus-within:ring-ink/30 dark:focus-within:ring-white/15 transition-shadow">
      <!-- Sport selector — branded filter chip -->
      <div class="sport-select relative shrink-0">
        <select
          v-model="search.sportId.value"
          class="appearance-none bg-ink/[0.07] dark:bg-white/[0.06] text-ink dark:text-gray-100 text-[13px] font-semibold rounded-lg pl-3 pr-7 py-1.5 max-w-[160px] outline-none cursor-pointer hover:bg-ink/[0.12] dark:hover:bg-white/10 transition-colors"
          :aria-label="t('storefront.search.allSports')"
        >
          <option :value="null">{{ t('storefront.search.allSports') }}</option>
          <option v-for="s in (mounted ? sports.sorted : [])" :key="s.id" :value="s.id">{{ sportName(s) }}</option>
        </select>
        <UIcon
          name="i-lucide-chevron-down"
          class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/50 dark:text-gray-400"
        />
      </div>

      <!-- Query -->
      <div class="flex items-center gap-2.5 pl-2 pr-3 flex-1 min-w-0">
        <UIcon name="i-lucide-search" class="w-[18px] h-[18px] text-gray-400 shrink-0" />
        <input
          v-model="search.query.value"
          type="text"
          :placeholder="t('storefront.home.searchPlaceholder')"
          class="bg-transparent border-0 outline-none text-sm text-gray-700 dark:text-gray-200 w-full placeholder:text-gray-400"
          @focus="search.open.value = true"
        >
        <UIcon
          v-if="search.loading.value"
          name="i-lucide-loader-circle"
          class="w-4 h-4 text-accent animate-spin shrink-0"
        />
      </div>
    </div>

    <!-- Results dropdown -->
    <div
      v-if="showDropdown"
      class="absolute left-0 right-0 mt-2 bg-white dark:bg-sidebar rounded-xl shadow-card-lg border border-gray-100 dark:border-sidebar-surface z-40 overflow-hidden"
    >
      <LayoutAppSearchResults :search="search" />
    </div>
  </div>

  <!-- * Mobile: fixed bottom search bar (sport filter + input), results above.
       Teleported to body so it escapes the sticky header's stacking context. -->
  <Teleport to="body">
    <div v-if="mobileOpen" class="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px]" @click="closeMobile" />

      <div class="relative bg-page dark:bg-sidebar border-t border-black/10 dark:border-sidebar-surface shadow-[0_-8px_30px_rgba(0,0,0,0.22)]">
        <!-- Results (rendered above the input since the bar sits at the bottom) -->
        <div
          v-if="showDropdown"
          class="max-h-[55vh] overflow-y-auto border-b border-gray-100 dark:border-sidebar-surface"
        >
          <LayoutAppSearchResults :search="search" />
        </div>

        <!-- Input row -->
        <div class="flex items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div class="flex items-center gap-1.5 flex-1 min-w-0 bg-[#f2f2f2] dark:bg-sidebar-surface rounded-xl p-0.5 ring-1 ring-transparent focus-within:ring-ink/30 dark:focus-within:ring-white/15 transition-shadow">
            <!-- Sport selector -->
            <div class="sport-select relative shrink-0">
              <select
                v-model="search.sportId.value"
                class="appearance-none bg-ink/[0.07] dark:bg-white/[0.06] text-ink dark:text-gray-100 text-[13px] font-semibold rounded-lg pl-3 pr-7 py-2 max-w-[130px] outline-none cursor-pointer"
                :aria-label="t('storefront.search.allSports')"
              >
                <option :value="null">{{ t('storefront.search.allSports') }}</option>
                <option v-for="s in (mounted ? sports.sorted : [])" :key="s.id" :value="s.id">{{ sportName(s) }}</option>
              </select>
              <UIcon
                name="i-lucide-chevron-down"
                class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/50 dark:text-gray-400"
              />
            </div>

            <!-- Query -->
            <div class="flex items-center gap-2.5 pl-1 pr-2 flex-1 min-w-0">
              <UIcon name="i-lucide-search" class="w-[18px] h-[18px] text-gray-400 shrink-0" />
              <input
                ref="mobileInput"
                v-model="search.query.value"
                type="text"
                :placeholder="t('storefront.home.searchPlaceholder')"
                class="bg-transparent border-0 outline-none text-sm text-gray-700 dark:text-gray-200 w-full placeholder:text-gray-400 py-1.5"
                @focus="search.open.value = true"
              >
              <UIcon
                v-if="search.loading.value"
                name="i-lucide-loader-circle"
                class="w-4 h-4 text-accent animate-spin shrink-0"
              />
            </div>
          </div>

          <!-- Close -->
          <button
            type="button"
            class="shrink-0 w-[41px] h-[41px] rounded-xl border border-black/10 dark:border-sidebar-surface flex items-center justify-center text-ink dark:text-gray-200"
            :aria-label="t('common.close')"
            @click="closeMobile"
          >
            <UIcon name="i-lucide-x" class="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* * Best-effort styling of the native option list (supported in Chromium/FF). */
.sport-select select option {
  background: #ffffff;
  color: #164194;
  font-weight: 600;
}
:where(.dark) .sport-select select option {
  background: #0f1428;
  color: #e5e7eb;
}
</style>
