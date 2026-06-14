<script setup lang="ts">
// * Header product search — sport selector + text input + paginated results
// * dropdown. Results come from the public `search-products` edge function, which
// * excludes restricted-club products server-side.
import { onClickOutside } from '@vueuse/core'
import { useSportsStore, type Sport } from '~/stores/sports'
import { useProductSearch } from '~/composables/useProductSearch'

const { t, locale } = useI18n()
const sports = useSportsStore()
const client = useSupabaseClient()
const search = useProductSearch()

const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (search.open.value = false))

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

function productName(r: { name: { fr: string; en: string } }) {
  return r.name[locale.value as 'fr' | 'en'] ?? r.name.fr
}

function imageUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
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
      <!-- Loading (first load) -->
      <div
        v-if="search.loading.value && !search.results.value.length"
        class="py-8 text-center text-sm text-gray-400"
      >
        <UIcon name="i-lucide-loader-circle" class="w-5 h-5 animate-spin mx-auto" />
      </div>

      <!-- No results -->
      <div
        v-else-if="!search.results.value.length"
        class="py-8 text-center text-sm text-gray-400"
      >
        {{ t('storefront.search.noResults') }}
      </div>

      <template v-else>
        <div class="px-3.5 py-2 text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-sidebar-surface">
          {{ t('storefront.search.results', { n: search.total.value }) }}
        </div>

        <ul class="max-h-[60vh] overflow-y-auto py-1">
          <li v-for="r in search.results.value" :key="r.id">
            <NuxtLink
              :to="`/product/${r.id}`"
              class="flex items-center gap-3 px-3 py-2 no-underline text-inherit hover:bg-gray-50 dark:hover:bg-sidebar-surface transition-colors"
              @click="search.reset()"
            >
              <div class="w-11 h-11 rounded-lg bg-gray-100 dark:bg-sidebar-surface flex items-center justify-center overflow-hidden shrink-0">
                <img v-if="imageUrl(r.image_path)" :src="imageUrl(r.image_path)!" class="w-full h-full object-contain" :alt="productName(r)">
                <UIcon v-else name="i-lucide-image" class="w-5 h-5 text-gray-300" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-ink dark:text-gray-100 truncate">{{ productName(r) }}</div>
                <div class="text-[11px] text-gray-400 truncate">
                  {{ r.club_name }} · {{ r.reference }}
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-sm font-bold text-ink dark:text-gray-100">{{ fmt(r.unit_price) }}</div>
                <span
                  v-if="r.is_on_clearance"
                  class="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-accent text-white"
                >
                  {{ t('storefront.home.clearance.badge') }}
                </span>
              </div>
            </NuxtLink>
          </li>
        </ul>

        <!-- Pagination -->
        <div
          v-if="search.totalPages.value > 1"
          class="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-sidebar-surface"
        >
          <button
            type="button"
            class="inline-flex items-center gap-1 text-[13px] font-semibold text-ink dark:text-gray-200 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-sidebar-surface disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="search.page.value <= 1"
            @click="search.setPage(search.page.value - 1)"
          >
            <UIcon name="i-lucide-chevron-left" class="w-4 h-4" />
          </button>
          <span class="text-[12px] text-gray-500">
            {{ t('storefront.search.page', { x: search.page.value, n: search.totalPages.value }) }}
          </span>
          <button
            type="button"
            class="inline-flex items-center gap-1 text-[13px] font-semibold text-ink dark:text-gray-200 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-sidebar-surface disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!search.hasMore.value"
            @click="search.setPage(search.page.value + 1)"
          >
            <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
          </button>
        </div>
      </template>
    </div>
  </div>
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
